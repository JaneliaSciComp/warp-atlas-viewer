import { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { TrackballControls } from '@react-three/drei';
import * as THREE from 'three';
import type { NeuronDataset, FilterState, SelectionState, SettingsState, ProjectionMode } from '../data/types';
import type { CameraState } from '../utils/urlState';
import type { SharedColoring } from '../hooks/useColoring';
import { AmbientOcclusion } from './AmbientOcclusion';
import {
  createProjectionColorMapTexture,
  effectiveProjectionMode,
  PROJECTION_MODE_LABELS,
  PROJECTION_MODE_ORDER,
  scalarProjectionConfig,
  supportsScalarProjection,
} from './brain/projectionModel';
import { buildTooltip } from './brain/tooltip';
import { DebugOverlay, FpsMeter } from './brain/debugOverlay';
import { CameraSync, ScreenSpacePan, type ScreenPanState } from './brain/cameraControls';
import { ProjectionRenderPass } from './brain/ProjectionRenderPass';
import { PointCloud, type PickState } from './brain/PointCloud';
import { BrainMeshes } from './brain/BrainMeshes';
import {
  EMBEDDED_DEFAULT_PRESET,
  VIEWER_FOV_DEG,
  boundsMaxAbs,
  fitDistance,
} from './brain/viewPresets';
import { ViewOrientationBar } from './brain/ViewOrientationBar';

const VIEWER_BACKGROUND = '#0a0a0a';
// mapZebrain's own clear colour (web-gl.service.ts:47), so the embedded
// canvas and the host page's canvas match exactly.
const EMBEDDED_BACKGROUND = '#000000';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  /** Shared base coloring computed once in App. We copy it into our
   *  own buffers so we can stamp the focused-neuron brighter on top
   *  without corrupting what UmapPanel reads. */
  coloring: SharedColoring | null;
  /** Active group selection. The 3D viewer treats a non-empty t-SNE
   *  lasso ('umap' source) as an additional filter — cells outside the
   *  lasso get the standard ghost treatment so the selected subset
   *  reads as the foreground population. The t-SNE panel itself does
   *  NOT apply this demotion (so the user can re-lasso). */
  selection: SelectionState;
  /** Single-neuron focus, separate from the group selection. */
  focusedNeuron: number | null;
  /** Click on a neuron sets focus; click on empty space sets to null. */
  onFocus: (i: number | null) => void;
  /** Fires whenever the wrapping div is resized. App threads this back
   *  into useColoring so the auto-mode formulas (point size + ghost
   *  visibility derived from canvas height) reflect the current 3D
   *  canvas size. */
  onCanvasSizeChange?: (size: { w: number; h: number }) => void;
  /** Camera position + orbit target restored from URL on first mount. */
  initialCamera?: CameraState | null;
  /** Fired whenever the user moves/orbits/zooms the camera. */
  onCameraChange?: (cam: CameraState) => void;
  /** Fired when the user picks a projection mode from the in-viewer
   *  status pill. Wired to the same settings.projectionMode the
   *  Settings tab drives, so the two controls stay in sync. */
  onProjectionModeChange?: (mode: ProjectionMode) => void;
  /** Fired when the gear icon in the embedded orientation bar is clicked. */
  onOpenSettings?: () => void;
}

const VOLUME_CENTER: [number, number, number] = [0, 0, 0];
const VOLUME_CENTER_VEC = new THREE.Vector3(...VOLUME_CENTER);

/** Renders the 3D brain viewer shell, including canvas controls, overlays, and projection UI. */
export function BrainViewer({
  data,
  filter,
  settings,
  coloring,
  selection,
  focusedNeuron,
  onFocus,
  onCanvasSizeChange,
  initialCamera,
  onCameraChange,
  onProjectionModeChange,
  onOpenSettings,
}: Props) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [projMenuOpen, setProjMenuOpen] = useState(false);
  const pickRef = useRef<PickState>({ pos: null, hovered: -1 });
  // Wrapping-div size — the R3F Canvas fills its parent so this is
  // also the rendered canvas size. Tracked unconditionally because the
  // auto-mode point-size / ghost-visibility formulas depend on it.
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // Rendered frame rate, sampled inside the Canvas by FpsMeter (only while
  // the debug overlay is open) and surfaced in the overlay below.
  const [fps, setFps] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const rect = el.getBoundingClientRect();
      const next = { w: Math.floor(rect.width), h: Math.floor(rect.height) };
      setCanvasSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Mirror the measured size up to App so useColoring's deps update.
  // Skip the (0, 0) mount value — App seeds with the upper anchor so
  // first paint already renders sensibly.
  useEffect(() => {
    if (!onCanvasSizeChange) return;
    if (canvasSize.w === 0 || canvasSize.h === 0) return;
    onCanvasSizeChange(canvasSize);
  }, [canvasSize, onCanvasSizeChange]);

  // Default camera derived from the data bounds. Normal mode keeps the
  // original landscape framing verbatim — the brain's long rostro-caudal axis
  // runs horizontally across the wide panel, with the volume group transform
  // putting rostral at screen-right. span doubles as the basis for the zoom
  // limits below.
  const { defaultCamPosition, defaultCamUp, presetDistance, minDistance, maxDistance } = useMemo(() => {
    const { min, max } = data.bounds;
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    // Embedded mode opens on mapZebrain's own default: dorsal, brain vertical,
    // rostral up. That rolls the 784-unit rostro-caudal extent from horizontal
    // to vertical, and three's fov is the VERTICAL fov, so the landscape
    // distance below would clip the rostral and caudal tips — hence
    // fitDistance. It takes the largest arm from the origin rather than half
    // the span, because the cloud is centered on its mean and so sits
    // off-centre; and its default margin also clears the outline mesh, which
    // reaches further caudally than the cells. presetDistance is the orbit
    // distance the icon bar uses too, so no preset can clip either.
    const presetDistance = fitDistance(boundsMaxAbs(data.bounds));
    const embedded = settings.embeddedMode;
    return {
      defaultCamPosition: (embedded
        ? [0, 0, presetDistance]
        : [0, 0, span * 0.95]) as [number, number, number],
      defaultCamUp: (embedded ? EMBEDDED_DEFAULT_PRESET.up : [0, 1, 0]) as [
        number,
        number,
        number,
      ],
      presetDistance,
      // Hard zoom-in floor. Without it, TrackballControls' default
      // minDistance=0 lets the wheel keep shrinking the camera-to-
      // target offset asymptotically: the view stops changing once
      // the eye is sub-pixel close, but further wheel ticks keep
      // updating it, and zooming back out is a slow exponential climb
      // back through all that compounded zoom. With minDistance set,
      // TrackballControls._checkDistances clamps the eye and resets
      // the zoom accumulator (_zoomStart.copy(_zoomEnd)) the instant
      // we hit the floor, turning it into a hard wall.
      minDistance: span * 0.15,
      maxDistance: span * 5,
    };
  }, [data, settings.embeddedMode]);
  // initialCamera is the URL-restored seed. Capture it once at mount in
  // a ref so a later prop update (e.g. a parent re-emitting the URL
  // state) can't yank the camera mid-interaction.
  const mountCameraRef = useRef(initialCamera);
  // Embedded mode at MOUNT. The Canvas reads its `gl` options once at
  // creation, so preserveDrawingBuffer — and therefore whether a screenshot
  // can be taken at all — is fixed here. Toggling the Settings checkbox
  // later must not offer a button that would emit a blank PNG.
  const embeddedAtMountRef = useRef(settings.embeddedMode);
  const screenPanRef = useRef<ScreenPanState>({
    x: mountCameraRef.current?.pan?.[0] ?? 0,
    y: mountCameraRef.current?.pan?.[1] ?? 0,
  });
  const camPosition = useMemo(() => {
    if (mountCameraRef.current) return mountCameraRef.current.pos;
    return defaultCamPosition;
  }, [defaultCamPosition]);

  // Imperative handle into CameraSync so the overlay button can snap
  // the camera back to its default position/pan without lifting the
  // r3f controls instance out of the Canvas.
  const applyViewRef = useRef<
    ((position: [number, number, number], up: [number, number, number]) => void) | null
  >(null);
  const initiallyAtDefault = !mountCameraRef.current;
  const [atDefault, setAtDefault] = useState(initiallyAtDefault);

  // Track the pointer-down position so we can distinguish a click (no
  // movement) from a drag-rotate. Without this, a drag-rotate ending
  // over a neuron fires the same DOM click event a true click would,
  // and the user accidentally selects that neuron.
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const DRAG_THRESHOLD_PX = 4;

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pickRef.current.pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // Promote pointerdown → drag once movement exceeds the threshold.
    // The tooltip is hidden the moment a drag starts and stays hidden
    // until the next mousedown so it doesn't trail the cursor across
    // a rotate/pan.
    if (downRef.current && !draggedRef.current) {
      const dx = e.clientX - downRef.current.x;
      const dy = e.clientY - downRef.current.y;
      if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        draggedRef.current = true;
        setHover(null);
      }
    }
    if (!draggedRef.current && pickRef.current.hovered >= 0) {
      setHover({
        i: pickRef.current.hovered,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };
  const onPointerLeave = () => {
    pickRef.current.pos = null;
    pickRef.current.hovered = -1;
    setHover(null);
    downRef.current = null;
    draggedRef.current = false;
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    downRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
  };
  const onPointerUp = () => {
    downRef.current = null;
  };
  const onClickDiv = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedRef.current) {
      // Suppress the click that closes a drag-rotate so it doesn't get
      // interpreted as "focus this neuron".
      draggedRef.current = false;
      return;
    }
    const i = pickRef.current.hovered;
    // Click on a neuron → focus it. Click on empty space → unfocus.
    // Either way the group selection is left alone.
    onFocus(i >= 0 ? i : null);
    e.stopPropagation();
  };

  // useFrame in PointCloud calls this when the hovered index changes; we
  // mirror it into React state so the tooltip re-renders. Suppressed
  // while a drag is in progress so the tooltip doesn't reappear behind
  // a rotate/pan as the picker keeps walking over cells.
  const handleHoverChange = useCallback((i: number) => {
    if (i < 0) {
      setHover(null);
      return;
    }
    if (draggedRef.current) return;
    const pos = pickRef.current.pos;
    if (!pos) return;
    setHover({ i, x: pos.x, y: pos.y });
  }, []);

  // Reads the composited back buffer, so the PNG matches what is on screen
  // in every mode — including the projection modes, where the image is built
  // across several passes per frame and re-rendering the raw scene here
  // would produce a different picture.
  const onCapture = useCallback(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'warp-atlas.png';
    a.click();
  }, []);

  const projectionConfig = useMemo(
    () => scalarProjectionConfig(data, filter, settings),
    [data, filter, settings],
  );
  const activeProjectionMode = effectiveProjectionMode(filter.colorMode, settings.projectionMode);
  const projectionColorMap = useMemo(
    () => createProjectionColorMapTexture(projectionConfig.colorMapKind),
    [projectionConfig.colorMapKind],
  );
  useEffect(() => () => projectionColorMap.dispose(), [projectionColorMap]);

  const tooltip = hover ? buildTooltip(data, filter, settings, coloring, hover.i) : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-neutral-900"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClickDiv}
    >
      <Canvas
        camera={{ position: camPosition, fov: VIEWER_FOV_DEG, near: 0.1, far: 10000 }}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          // Needed for toDataURL to see anything. Embedded-only: it costs a
          // full-canvas copy per frame.
          preserveDrawingBuffer: embeddedAtMountRef.current,
        }}
        dpr={[1, 2]}
      >
        <color
          attach="background"
          // Mount-time value, not the live setting: everything else in
          // embedded mode is fixed at page load (layout, palette, camera
          // default, preserveDrawingBuffer above), and docs/settings.md
          // promises a mid-session toggle does not repaint the palette.
          args={[embeddedAtMountRef.current ? EMBEDDED_BACKGROUND : VIEWER_BACKGROUND]}
        />
        {settings.debugMode && <FpsMeter onSample={setFps} />}
        <PointCloud
          data={data}
          filter={filter}
          settings={settings}
          coloring={coloring}
          projectionMode={activeProjectionMode}
          projectionConfig={projectionConfig}
          projectionColorMap={projectionColorMap}
          selection={selection}
          focusedNeuron={focusedNeuron}
          pickRef={pickRef}
          onHoverChange={handleHoverChange}
          defaultCamDistance={defaultCamPosition[2]}
          volumeCenter={VOLUME_CENTER_VEC}
        />
        <BrainMeshes settings={settings} />
        <TrackballControls
          makeDefault
          // rotationMomentum maps inversely to TrackballControls' damping:
          // 0 → staticMoving (zero inertia), 1 → factor 0.05 (most drift).
          // The default 0.9 yields ~0.1, matching the original feel.
          staticMoving={settings.rotationMomentum === 0}
          dynamicDampingFactor={Math.max(0.05, 1 - settings.rotationMomentum)}
          rotateSpeed={4.0}
          zoomSpeed={1.5}
          minDistance={minDistance}
          maxDistance={maxDistance}
          // Object-centric mode disables native pan in favor of the
          // screen-space projection offset below, which keeps the orbit
          // target pinned to the volume center so rotation always pivots
          // around the volume. With object-centric off, native pan moves
          // the target, and rotation follows.
          noPan={settings.objectCentricRotation}
        />
        <ScreenSpacePan
          panRef={screenPanRef}
          enabled={settings.objectCentricRotation}
        />
        <CameraSync
          initialCamera={initialCamera ?? null}
          onCameraChange={onCameraChange}
          panRef={screenPanRef}
          defaultCamPosition={defaultCamPosition}
          defaultCamUp={defaultCamUp}
          applyViewRef={applyViewRef}
          onAtDefaultChange={setAtDefault}
          lockTargetToCenter={settings.objectCentricRotation}
          volumeCenter={VOLUME_CENTER}
        />
        {settings.ambientOcclusion && activeProjectionMode === 'off' && (
          <AmbientOcclusion
            intensity={settings.ambientOcclusionIntensity}
            radius={settings.ambientOcclusionRadius}
            flatPointSize={!settings.scaleByDepth}
            defaultCamDistance={defaultCamPosition[2]}
          />
        )}
        {activeProjectionMode !== 'off' && (
          <ProjectionRenderPass
            mode={activeProjectionMode}
            sumExposure={settings.projectionSumExposure}
            intensityFloor={settings.projectionIntensityFloor}
            projectionConfig={projectionConfig}
            projectionColorMap={projectionColorMap}
            activeBrightness={settings.activeBrightness}
            fadeWeakCorrelation={settings.fadeWeakCorrelation}
          />
        )}
      </Canvas>
      {tooltip && hover && (
        <div className="neuron-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {tooltip}
        </div>
      )}
      {settings.embeddedMode && !settings.screenshotMode && (
        <ViewOrientationBar
          distance={presetDistance}
          applyView={(position, up) => applyViewRef.current?.(position, up)}
          onCapture={embeddedAtMountRef.current ? onCapture : null}
          onOpenSettings={() => onOpenSettings?.()}
        />
      )}
      <div className="absolute top-2 left-2 flex flex-col items-start gap-1.5 pointer-events-none">
        {supportsScalarProjection(filter.colorMode) && (
          // Status pill: a per-pixel projection through the point cloud
          // is a non-default render, so it gets a persistent control at
          // the top of the overlay. Click to switch projection mode (or
          // turn it off) without leaving the 3D view — mirrors the
          // Settings tab's projection control. Shares the reset button's
          // neutral grey so the two read as one control group.
          <div className="relative pointer-events-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProjMenuOpen((v) => !v);
              }}
              className="font-mono text-[10px] bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-800"
              title="per-pixel projection through the point cloud — click to change"
            >
              projection: {PROJECTION_MODE_LABELS[activeProjectionMode]}{settings.screenshotMode ? '' : ' ▾'}
            </button>
            {projMenuOpen && (
              <>
                {/* Click-away backdrop. Sits under the menu but over the
                    canvas so an outside click closes without selecting. */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjMenuOpen(false);
                  }}
                />
                <div className="absolute top-full left-0 mt-1 z-20 flex flex-col bg-neutral-900/95 border border-neutral-700 rounded overflow-hidden min-w-[88px]">
                  {PROJECTION_MODE_ORDER.map((m) => (
                    <button
                      key={m}
                      onClick={(e) => {
                        e.stopPropagation();
                        onProjectionModeChange?.(m);
                        setProjMenuOpen(false);
                      }}
                      className={
                        'font-mono text-[10px] text-left px-2 py-1 hover:bg-neutral-700 ' +
                        (m === activeProjectionMode
                          ? 'bg-neutral-700 text-white'
                          : 'text-neutral-200')
                      }
                    >
                      {PROJECTION_MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {!atDefault && !settings.screenshotMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              applyViewRef.current?.(defaultCamPosition, defaultCamUp);
            }}
            className="pointer-events-auto font-mono text-[10px] bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-800"
          >
            reset view
          </button>
        )}
        {settings.debugMode && (
          <DebugOverlay
            canvasSize={canvasSize}
            fps={fps}
            settings={settings}
            coloring={coloring}
            totalCells={data.count}
          />
        )}
      </div>
    </div>
  );
}
