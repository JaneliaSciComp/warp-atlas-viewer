import { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { TrackballControls } from '@react-three/drei';
import * as THREE from 'three';
import type { NeuronDataset, FilterState, SelectionState, SettingsState } from '../data/types';
import type { CameraState } from '../utils/urlState';
import {
  allocColoring,
  anyFilterActive,
  applySelectionAsFilterGhost,
  cellInSet,
  cellIsRenderable,
} from '../utils/coloring';
import type { SharedColoring } from '../hooks/useColoring';
import vertSrc from '../shaders/neuron.vert.glsl?raw';
import fragSrc from '../shaders/neuron.frag.glsl?raw';
import { AmbientOcclusion, skipAmbientOcclusionUserData } from './AmbientOcclusion';

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
}

interface PickState {
  /** Mouse position in canvas pixel coords, or null if mouse outside. */
  pos: { x: number; y: number } | null;
  /** Most recently picked neuron, or -1. Updated by useFrame in PointCloud. */
  hovered: number;
}

interface ScreenPanState {
  /** CSS-pixel offset applied in projection space. Positive values move
   *  the volume right/down in the viewport. */
  x: number;
  y: number;
}

const VOLUME_CENTER: [number, number, number] = [0, 0, 0];


/** Inner R3F component: owns the Points object and shader updates.
 *  Filter / settings / selection are already baked into `coloring`;
 *  this component reads them directly only for the picker's
 *  in-filter prioritization. */
function PointCloud({
  data,
  filter,
  settings,
  coloring,
  selection,
  focusedNeuron,
  pickRef,
  onHoverChange,
}: {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  coloring: SharedColoring | null;
  selection: SelectionState;
  focusedNeuron: number | null;
  pickRef: React.MutableRefObject<PickState>;
  onHoverChange: (i: number) => void;
}) {
  const { gl, camera, size } = useThree();

  const buffers = useMemo(() => allocColoring(data.count), [data]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('instColor', new THREE.BufferAttribute(buffers.colors, 3));
    g.setAttribute('instAlpha', new THREE.BufferAttribute(buffers.alphas, 1));
    g.setAttribute('instSize', new THREE.BufferAttribute(buffers.sizes, 1));
    g.computeBoundingSphere();
    return g;
  }, [data, buffers]);

  // Two-pass rendering. Opaque-ish cells (α ≥ 0.5: region/fish/highlight
  // colors at 0.85+, signal-saturated gene/stim/swim cells at 1.0) write
  // depth so they correctly occlude cells behind them — fixes the
  // "stratified" look where back cells punched through front cells.
  // Transparent cells (α < 0.5: ghosts, fade-weak midpoints, dim
  // backdrops) don't write depth so they still let near cells see
  // through them. The fragment shader pre-filters by vAlpha so each
  // material only renders its half.
  const ALPHA_PASS_SPLIT = 0.5;
  const opaqueMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: fragSrc,
      transparent: true,
      depthWrite: true,
      uniforms: {
        pixelRatio: { value: gl.getPixelRatio() },
        sizeScale: { value: 1 },
        alphaMin: { value: ALPHA_PASS_SPLIT },
        alphaMax: { value: 1e6 },
      },
    });
  }, [gl]);
  const transparentMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: fragSrc,
      transparent: true,
      depthWrite: false,
      uniforms: {
        pixelRatio: { value: gl.getPixelRatio() },
        sizeScale: { value: 1 },
        alphaMin: { value: 0 },
        alphaMax: { value: ALPHA_PASS_SPLIT },
      },
    });
  }, [gl]);

  // Canvas-size adaptation now lives inside applyColoring's auto-mode
  // formulas (basePointSize is derived from canvas height), so the
  // shader uniform stays at its default 1.0. We keep the uniform
  // around for shader-source compatibility but no longer drive it
  // from JS.

  useEffect(() => {
    if (!coloring) return;
    // Copy the shared base coloring into our own buffers so the
    // focused-neuron stamp and selection-as-filter ghost pass below
    // don't corrupt what other consumers (UmapPanel) read from the
    // same shared result.
    buffers.colors.set(coloring.result.colors);
    buffers.alphas.set(coloring.result.alphas);
    buffers.sizes.set(coloring.result.sizes);
    // Treat a t-SNE lasso selection as an additional filter for the 3D
    // viewer only: demote in-set cells outside the lasso to standard
    // ghost values. UmapPanel reads the shared (non-demoted) buffer so
    // the user can lasso new subsets from the dimmed cells.
    // basePointSize (the un-boosted size) keeps the in-set boost from
    // scale-by-filter confined to active cells — the helper sizes
    // ghosts as basePointSize × ghostFactor.
    applySelectionAsFilterGhost(
      buffers,
      data.count,
      coloring.drawOrder,
      coloring.filterSelection,
      coloring.basePointSize,
      coloring.effectiveGhostIntensity,
      selection,
    );
    // Stamp the focused neuron on top of whatever group coloring chose
    // for it: full alpha, brightened, so it stays visible inside a
    // dimmed group. The ring marker (below) handles the actual focus
    // indicator — we don't bump the cell size.
    if (focusedNeuron != null && focusedNeuron >= 0 && focusedNeuron < data.count) {
      const i = focusedNeuron;
      buffers.colors[i * 3] = Math.min(1, buffers.colors[i * 3] * 1.2 + 0.25);
      buffers.colors[i * 3 + 1] = Math.min(1, buffers.colors[i * 3 + 1] * 1.2 + 0.25);
      buffers.colors[i * 3 + 2] = Math.min(1, buffers.colors[i * 3 + 2] * 1.2 + 0.25);
      buffers.alphas[i] = 1.0;
    }
    (geometry.attributes.instColor as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instAlpha as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instSize as THREE.BufferAttribute).needsUpdate = true;
    // drawOrder partitions cells so out-of-filter indices come first
    // and in-filter ones last. Setting it as the geometry's index
    // buffer makes Three.js draw them in that order — combined with
    // depthWrite: false (so the depth buffer doesn't enforce true 3D
    // ordering for transparents) this guarantees in-set cells
    // composite over the dim ghost haze regardless of where they
    // sit in space. When no filter is active drawOrder is null and
    // we clear the index so the renderer falls back to natural order.
    if (coloring.drawOrder) {
      geometry.setIndex(new THREE.BufferAttribute(coloring.drawOrder, 1));
    } else if (geometry.index) {
      geometry.setIndex(null);
    }
  }, [data, filter, settings, coloring, selection, focusedNeuron, buffers, geometry]);

  // Focused-neuron ring marker. Mirrors the t-SNE white outline: a
  // hollow circle that grows with the cell up close and floors at a
  // visible minimum when the cell shrinks at distance.
  const markerGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  // The marker material is created once per renderer. Subsequent
  // pointSize changes flow through the effect below by mutating
  // baseSize.value in place — re-creating the ShaderMaterial on every
  // slider tick would be wasteful. Capturing only the mount-time value
  // via a ref makes that "initial value, then mutate" contract
  // structural so the linter doesn't have to take our word for it.
  const initialPointSize = useRef(settings.pointSize).current;
  const markerMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        uniform float pixelRatio;
        uniform float baseSize;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float dist = -mvPosition.z;
          float cellSize = baseSize * pixelRatio * (160.0 / max(dist, 40.0));
          // Same recipe as the t-SNE ring: at least a visible floor,
          // otherwise track the cell with a small buffer.
          gl_PointSize = max(14.0 * pixelRatio, cellSize + 6.0 * pixelRatio);
        }
      `,
      fragmentShader: `
        precision mediump float;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float r = length(c);
          // Hollow ring with a soft 1.5-px-ish edge on either side.
          float outer = smoothstep(0.50, 0.46, r);
          float inner = smoothstep(0.40, 0.44, r);
          float a = outer * inner;
          if (a < 0.02) discard;
          gl_FragColor = vec4(1.0, 1.0, 1.0, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        pixelRatio: { value: gl.getPixelRatio() },
        baseSize: { value: initialPointSize },
      },
    });
  }, [gl, initialPointSize]);

  // Marker tracks the *effective* point size used by the cell shader so
  // the focus ring stays sized relative to the dots it surrounds.
  // basePointSize already reflects the canvas-area adaptation (auto mode);
  // we use the in-set-boosted effectivePointSize to match what active
  // cells get on screen.
  const effectiveMarkerSize =
    coloring?.effectivePointSize ?? settings.pointSize;
  useEffect(() => {
    markerMaterial.uniforms.baseSize.value = effectiveMarkerSize;
  }, [markerMaterial, effectiveMarkerSize]);

  useEffect(() => {
    if (focusedNeuron == null || focusedNeuron < 0 || focusedNeuron >= data.count) {
      markerGeometry.setDrawRange(0, 0);
      return;
    }
    const i = focusedNeuron;
    const pos = markerGeometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2]);
    pos.needsUpdate = true;
    markerGeometry.setDrawRange(0, 1);
  }, [focusedNeuron, data, markerGeometry]);

  const ndcRef = useRef(new THREE.Vector3());

  useFrame(() => {
    const pos = pickRef.current.pos;
    if (!pos) {
      if (pickRef.current.hovered !== -1) {
        pickRef.current.hovered = -1;
        onHoverChange(-1);
      }
      return;
    }
    const { x: mx, y: my } = pos;
    const positions = data.positions;
    const w = size.width;
    const h = size.height;
    const projMat = camera.projectionMatrix;
    const viewMat = camera.matrixWorldInverse;
    const tmp = ndcRef.current;
    const CENTER_FALLBACK_RADIUS = 16;
    const CENTER_FALLBACK_RADIUS_SQ = CENTER_FALLBACK_RADIUS * CENTER_FALLBACK_RADIUS;
    const PICK_PAD_PX = 2;
    const MIN_DISK_PICK_RADIUS = 3;

    // Match the world transform applied by <group> below: scale y by
    // −1 (flip the AP/longitudinal axis to match the paper figures),
    // then rotate +90° around Z. Net effect on raw data coords:
    //   (dx, dy, dz) → (dy, dx, dz)
    // so AP/world-y → +screen-x and ML/world-x → +screen-y.

    // Pick in two tiers:
    //   1. If the cursor is inside one or more rendered point disks,
    //      choose the front-most disk. This matches what the depth
    //      buffer shows, so a rear cell center cannot steal a click
    //      from a visible front cell.
    //   2. If the cursor is near but not on any disk, fall back to the
    //      nearest center in a 16 px radius to keep small/far points
    //      easy to acquire.
    //
    // When a filter is active, in-filter cells outrank out-of-filter
    // ones regardless of distance/depth: the dimmed background cells
    // are visually de-emphasized, so a click on a coloured cell that
    // happens to sit a hair behind a greyed-out one should still land
    // on the coloured cell. Out-of-filter cells are only considered if
    // no in-filter cell is within the pick window — and not at all
    // when ghost mode is on, since they're effectively invisible.
    //
    // The t-SNE lasso is treated as an additional filter in the 3D
    // viewer (see applySelectionAsFilterGhost), so it contributes to
    // both `filterActive` and per-cell `inFilter`. That keeps the
    // picker's priority aligned with the rendered ghost demotion.
    const hasLasso = selection.source === 'umap' && selection.indices.length > 0;
    const lassoSet = hasLasso ? new Set<number>(Array.from(selection.indices)) : null;
    const filterActive = anyFilterActive(data, filter) || hasLasso;
    // Below half visibility, ghosts are too faint to aim at — skip
    // them in the picker so clicks always land on cells the user can
    // actually see. Use coloring's effective ghost intensity so this
    // tracks autoSizing too.
    const effGhost = coloring?.effectiveGhostIntensity ?? settings.ghostIntensity;
    const ghost = filterActive && effGhost < 0.5;
    // Read from our LOCAL buffers (not coloring.result) so the picker
    // honors the selection-as-filter ghost override: a cell that was
    // demoted to ghost in the 3D pass should also be unpickable below
    // the visibility threshold, even though the shared buffer still
    // marks it as in-set.
    const alphas = buffers.alphas;
    const pointSizes = buffers.sizes;
    const defaultPointSize = coloring?.effectivePointSize ?? settings.pointSize;
    const pixelRatio = gl.getPixelRatio();
    let bestDiskI = -1;
    let bestDiskD2 = Infinity;
    let bestDiskZ = Infinity;
    let bestDiskInFilter = false;
    let bestNearI = -1;
    let bestNearD2 = Infinity;
    let bestNearZ = Infinity;
    let bestNearInFilter = false;
    for (let i = 0; i < data.count; i++) {
      if (!cellIsRenderable(data, filter, i)) continue;
      if (alphas && alphas[i] < 0.02) continue;
      const ox = positions[i * 3];
      const x = positions[i * 3 + 1];
      const y = ox;
      const z = positions[i * 3 + 2];
      tmp.set(x, y, z);
      tmp.applyMatrix4(viewMat);
      const cz = tmp.z;
      if (cz > -1) continue;
      tmp.applyMatrix4(projMat);
      const px = (tmp.x * 0.5 + 0.5) * w;
      const py = (-tmp.y * 0.5 + 0.5) * h;
      const dx = px - mx;
      const dy = py - my;
      const d2 = dx * dx + dy * dy;
      const depth = -cz;
      const pointSize = pointSizes ? pointSizes[i] : defaultPointSize;
      const diameter = Math.max(1.5 / pixelRatio, pointSize * (160 / Math.max(depth, 40)));
      const diskRadius = Math.max(MIN_DISK_PICK_RADIUS, diameter * 0.5 + PICK_PAD_PX);
      const diskHit = d2 <= diskRadius * diskRadius;
      const nearHit = d2 <= CENTER_FALLBACK_RADIUS_SQ;
      if (!diskHit && !nearHit) continue;
      // "In filter" for picker priority: passes the active filter cards
       // AND is inside the active lasso (if any).
      const inFilter =
        !filterActive ||
        (cellInSet(data, filter, settings, i) && (!lassoSet || lassoSet.has(i)));
      if (diskHit) {
        if (inFilter) {
          if (
            !bestDiskInFilter ||
            depth < bestDiskZ ||
            (depth === bestDiskZ && d2 < bestDiskD2)
          ) {
            bestDiskInFilter = true;
            bestDiskD2 = d2;
            bestDiskZ = depth;
            bestDiskI = i;
          }
        } else if (!bestDiskInFilter && !ghost) {
          if (depth < bestDiskZ || (depth === bestDiskZ && d2 < bestDiskD2)) {
            bestDiskD2 = d2;
            bestDiskZ = depth;
            bestDiskI = i;
          }
        }
      }
      if (nearHit) {
        if (inFilter) {
          if (!bestNearInFilter || d2 < bestNearD2 || (d2 === bestNearD2 && depth < bestNearZ)) {
            bestNearInFilter = true;
            bestNearD2 = d2;
            bestNearZ = depth;
            bestNearI = i;
          }
        } else if (!bestNearInFilter && !ghost) {
          if (d2 < bestNearD2 || (d2 === bestNearD2 && depth < bestNearZ)) {
            bestNearD2 = d2;
            bestNearZ = depth;
            bestNearI = i;
          }
        }
      }
    }

    const bestI = bestDiskI >= 0 ? bestDiskI : bestNearI;
    if (bestI !== pickRef.current.hovered) {
      pickRef.current.hovered = bestI;
      onHoverChange(bestI);
    }
  });

  return (
    <group rotation={[0, 0, Math.PI / 2]} scale={[1, -1, 1]}>
      {/* Opaque pass first so its depth values are in place before the
        * transparent pass reads them. Both points share the same
        * geometry — the materials' alphaMin / alphaMax uniforms
        * partition cells by alpha at the fragment level. */}
      <points geometry={geometry} material={opaqueMaterial} renderOrder={0} />
      <points
        geometry={geometry}
        material={transparentMaterial}
        renderOrder={1}
        userData={skipAmbientOcclusionUserData}
      />
      <points
        geometry={markerGeometry}
        material={markerMaterial}
        renderOrder={2}
        userData={skipAmbientOcclusionUserData}
      />
    </group>
  );
}

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
}: Props) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const pickRef = useRef<PickState>({ pos: null, hovered: -1 });
  // Wrapping-div size — the R3F Canvas fills its parent so this is
  // also the rendered canvas size. Tracked unconditionally because the
  // auto-mode point-size / ghost-visibility formulas depend on it.
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
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

  // Default camera position derived from the data bounds — straight-on
  // dorsal view with the brain comfortably filling the landscape panel.
  // span doubles as the basis for the zoom limits below.
  const { defaultCamPosition, minDistance, maxDistance } = useMemo(() => {
    const { min, max } = data.bounds;
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    return {
      defaultCamPosition: [0, 0, span * 0.95] as [number, number, number],
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
  }, [data]);
  // initialCamera is the URL-restored seed. Capture it once at mount in
  // a ref so a later prop update (e.g. a parent re-emitting the URL
  // state) can't yank the camera mid-interaction.
  const mountCameraRef = useRef(initialCamera);
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
  const resetRef = useRef<(() => void) | null>(null);
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

  const tooltip = hover ? buildTooltip(data, hover.i) : null;

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
        camera={{ position: camPosition, fov: 45, near: 0.1, far: 10000 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0a0a0a']} />
        <PointCloud
          data={data}
          filter={filter}
          settings={settings}
          coloring={coloring}
          selection={selection}
          focusedNeuron={focusedNeuron}
          pickRef={pickRef}
          onHoverChange={handleHoverChange}
        />
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
          resetRef={resetRef}
          onAtDefaultChange={setAtDefault}
          lockTargetToCenter={settings.objectCentricRotation}
        />
        {settings.ambientOcclusion && (
          <AmbientOcclusion
            intensity={settings.ambientOcclusionIntensity}
            radius={settings.ambientOcclusionRadius}
          />
        )}
      </Canvas>
      {tooltip && hover && (
        <div className="neuron-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {tooltip}
        </div>
      )}
      <div className="absolute top-2 left-2 flex flex-col items-start gap-1.5 pointer-events-none">
        {!atDefault && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetRef.current?.();
            }}
            className="pointer-events-auto font-mono text-[10px] bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-800"
          >
            reset view
          </button>
        )}
        {settings.debugMode && (
          <DebugOverlay
            canvasSize={canvasSize}
            settings={settings}
            coloring={coloring}
            totalCells={data.count}
          />
        )}
      </div>
    </div>
  );
}

function DebugOverlay({
  canvasSize,
  settings,
  coloring,
  totalCells,
}: {
  canvasSize: { w: number; h: number };
  settings: SettingsState;
  coloring: SharedColoring | null;
  totalCells: number;
}) {
  const inSetCount = coloring?.filterSelection?.length ?? totalCells;
  // basePointSize / effGhost come straight from the shared coloring
  // (computed in applyColoring), so the overlay doesn't re-derive the
  // auto-mode formulas — it just reports what the renderer used.
  const AUTO_MIN_INSET = 50;
  const useFilterLerp = settings.autoSizing && settings.scaleByFilterCount;
  const tFilter = useFilterLerp
    ? Math.max(
        0,
        Math.min(
          1,
          (Math.log(Math.max(AUTO_MIN_INSET, inSetCount)) - Math.log(AUTO_MIN_INSET)) /
            (Math.log(Math.max(AUTO_MIN_INSET + 1, totalCells)) - Math.log(AUTO_MIN_INSET)),
        ),
      )
    : 0;
  const inSetBoost = useFilterLerp ? 2 - tFilter : 1;
  const basePointSize = coloring?.basePointSize ?? settings.pointSize;
  const effPointSize = coloring?.effectivePointSize ?? settings.pointSize;
  const effGhost = coloring?.effectiveGhostIntensity ?? settings.ghostIntensity;
  const row = (label: string, value: string | number) => (
    <div className="flex justify-between gap-3">
      <span className="text-neutral-400">{label}</span>
      <span className="text-neutral-100 tabular-nums">{value}</span>
    </div>
  );
  const fx = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : String(n));
  return (
    <div className="pointer-events-auto font-mono text-[10px] bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-2 py-1.5 rounded min-w-[220px] leading-tight">
      <div className="text-neutral-500 uppercase tracking-wider text-[9px] mb-1">debug</div>
      {row('canvas', `${canvasSize.w}×${canvasSize.h}`)}
      {row('cells (total)', totalCells.toLocaleString())}
      {row('cells (in set)', inSetCount.toLocaleString())}
      {row('auto', settings.autoSizing ? 'on' : 'off')}
      {row('scale by filter', settings.scaleByFilterCount ? 'on' : 'off')}
      {row('settings.pointSize', fx(settings.pointSize, 1))}
      {row('settings.ghost', fx(settings.ghostIntensity, 2))}
      {row('tFilter (boost)', fx(tFilter, 3))}
      {row('inSetBoost', fx(inSetBoost, 3) + '×')}
      {row('base pointSize', fx(basePointSize, 2))}
      {row('eff. pointSize', fx(effPointSize, 2))}
      {row('eff. ghost', fx(effGhost, 3))}
    </div>
  );
}

function supportsViewOffset(
  camera: THREE.Camera,
): camera is THREE.PerspectiveCamera | THREE.OrthographicCamera {
  return camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera;
}

/** Screen-space panning is implemented as a projection offset, not as a
 *  camera/target translation. TrackballControls therefore keeps a stable
 *  orbit target at the volume center, while right-drag simply shifts where
 *  that centered view lands inside the canvas.
 *
 *  When `enabled` is false (the user toggled off object-centric rotation),
 *  this component clears any active view offset and detaches its pointer
 *  listeners so TrackballControls' native pan can take over the right
 *  mouse button. The cached `panRef` is preserved so toggling the mode
 *  back on restores the previous screen-space pan. */
function ScreenSpacePan({
  panRef,
  enabled,
}: {
  panRef: React.MutableRefObject<ScreenPanState>;
  enabled: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  const applyViewOffset = useCallback(() => {
    if (!supportsViewOffset(camera)) return;
    if (size.width <= 0 || size.height <= 0) return;
    const pan = panRef.current;
    camera.setViewOffset(size.width, size.height, -pan.x, -pan.y, size.width, size.height);
    invalidate();
  }, [camera, invalidate, panRef, size.height, size.width]);

  useEffect(() => {
    if (!enabled) {
      // Drop any active projection offset so the native trackball pan
      // sees a centered frustum to work against.
      if (supportsViewOffset(camera) && size.width > 0 && size.height > 0) {
        camera.setViewOffset(size.width, size.height, 0, 0, size.width, size.height);
        invalidate();
      }
      return;
    }
    applyViewOffset();
  }, [applyViewOffset, camera, enabled, invalidate, size.height, size.width]);

  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) return;
      dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
      el.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      if (dx === 0 && dy === 0) return;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      panRef.current.x += dx;
      panRef.current.y += dy;
      applyViewOffset();
      event.preventDefault();
    };

    const stopDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      if (el.hasPointerCapture(event.pointerId)) {
        el.releasePointerCapture(event.pointerId);
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', stopDrag);
    el.addEventListener('pointercancel', stopDrag);
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', stopDrag);
      el.removeEventListener('pointercancel', stopDrag);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [applyViewOffset, enabled, gl, panRef]);

  return null;
}

/** Reads/writes the camera-controls + camera state so App can mirror
 *  it to the URL hash. Restores `initialCamera` once on mount;
 *  thereafter polls the camera each frame and fires `onCameraChange`
 *  only after a few idle frames so the URL update lands when the user
 *  has truly stopped moving (covers TrackballControls' damping settle
 *  without spamming a write per frame). */
function CameraSync({
  initialCamera,
  onCameraChange,
  panRef,
  defaultCamPosition,
  resetRef,
  onAtDefaultChange,
  lockTargetToCenter,
}: {
  initialCamera: CameraState | null;
  onCameraChange?: (cam: CameraState) => void;
  panRef: React.MutableRefObject<ScreenPanState>;
  defaultCamPosition: [number, number, number];
  resetRef: React.MutableRefObject<(() => void) | null>;
  onAtDefaultChange: (atDefault: boolean) => void;
  /** When true, the orbit target is forced back to VOLUME_CENTER each
   *  frame so rotation always pivots around the volume. When false, the
   *  user-driven pan (native TrackballControls pan) is allowed to move
   *  the target freely. */
  lockTargetToCenter: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  // The drei controls wire themselves in via makeDefault; useThree
  // exposes the instance on .controls. Use any to avoid a public-API
  // dependency on TrackballControlsImpl.
  const controls = useThree((s) => s.controls) as any;
  const restoredRef = useRef(false);
  const lastRef = useRef<CameraState | null>(null);
  // Position tolerance for the at-default check. Trackball damping
  // can leave sub-unit residue after a snap, so compare against a
  // fraction of the default eye distance rather than using exact
  // equality.
  const POS_EPS = Math.max(1e-3, Math.hypot(...defaultCamPosition) * 1e-4);
  const atDefaultRef = useRef<boolean | null>(null);

  useEffect(() => {
    resetRef.current = () => {
      camera.position.set(...defaultCamPosition);
      // TrackballControls rotates camera.up during orbit, so position
      // + target alone leaves the view rolled. Restore the canonical
      // up vector so the volume returns to its original orientation.
      camera.up.set(0, 1, 0);
      controls?.target.set(...VOLUME_CENTER);
      controls?.update();
      panRef.current.x = 0;
      panRef.current.y = 0;
      if (supportsViewOffset(camera) && size.width > 0 && size.height > 0) {
        camera.setViewOffset(size.width, size.height, 0, 0, size.width, size.height);
      }
      invalidate();
    };
    return () => {
      resetRef.current = null;
    };
  }, [camera, controls, defaultCamPosition, invalidate, panRef, resetRef, size.height, size.width]);

  useEffect(() => {
    if (!controls || restoredRef.current) return;
    if (initialCamera) {
      camera.position.set(...initialCamera.pos);
      // Orient the camera. Current URLs carry both an explicit quaternion
      // (captures any roll the trackball produced) and the orbit target
      // (captures native pan). Older v2 URLs may only have pos + quat and
      // implicitly target the volume center; v1 URLs only had pos + target,
      // so fall back to look-at with the canonical up vector (roll for
      // those links is unrecoverable).
      const target = initialCamera.target ?? VOLUME_CENTER;
      if (initialCamera.quat) {
        camera.quaternion.set(
          initialCamera.quat[0],
          initialCamera.quat[1],
          initialCamera.quat[2],
          initialCamera.quat[3],
        );
        // Derive `up` from the quaternion so subsequent trackball
        // rotations have the correct local frame to spin around.
        camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      } else if (initialCamera.target) {
        camera.up.set(0, 1, 0);
        camera.lookAt(target[0], target[1], target[2]);
      }
      controls.target.set(...target);
      controls.update();
    }
    restoredRef.current = true;
  }, [controls, camera, initialCamera]);

  useFrame(() => {
    if (!controls) return;
    if (
      lockTargetToCenter &&
      (controls.target.x !== VOLUME_CENTER[0] ||
        controls.target.y !== VOLUME_CENTER[1] ||
        controls.target.z !== VOLUME_CENTER[2])
    ) {
      controls.target.set(...VOLUME_CENTER);
      controls.update();
    }
    const targetAtCenter =
      Math.abs(controls.target.x - VOLUME_CENTER[0]) < POS_EPS &&
      Math.abs(controls.target.y - VOLUME_CENTER[1]) < POS_EPS &&
      Math.abs(controls.target.z - VOLUME_CENTER[2]) < POS_EPS;
    const isAtDefault =
      Math.abs(camera.position.x - defaultCamPosition[0]) < POS_EPS &&
      Math.abs(camera.position.y - defaultCamPosition[1]) < POS_EPS &&
      Math.abs(camera.position.z - defaultCamPosition[2]) < POS_EPS &&
      Math.abs(camera.up.x) < 1e-3 &&
      Math.abs(camera.up.y - 1) < 1e-3 &&
      Math.abs(camera.up.z) < 1e-3 &&
      panRef.current.x === 0 &&
      panRef.current.y === 0 &&
      targetAtCenter;
    if (atDefaultRef.current !== isAtDefault) {
      atDefaultRef.current = isAtDefault;
      onAtDefaultChange(isAtDefault);
    }
    if (!onCameraChange) return;
    const pos: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    const quat: [number, number, number, number] = [
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
    ];
    const target: [number, number, number] = [
      controls.target.x,
      controls.target.y,
      controls.target.z,
    ];
    const rawPan = panRef.current;
    const pan: [number, number] | undefined =
      rawPan.x !== 0 || rawPan.y !== 0 ? [rawPan.x, rawPan.y] : undefined;
    const cam: CameraState = pan ? { pos, quat, target, pan } : { pos, quat, target };
    const last = lastRef.current;
    // Sub-pixel epsilon: anything below this per-frame delta is
    // numerically still as far as the rendered image cares about, so
    // we stop emitting and let the App-side debounce write the URL.
    // Exact float equality would keep counting the tail of trackball
    // damping (~0.9× velocity decay each frame) as "movement" for
    // ~130 frames after release — which kept resetting the debounce
    // and stalled the URL hash for ~2 s. The remaining residue past
    // this threshold is bounded by epsilon / dampingFactor (~1e-3
    // unit), well inside the rounded URL precision.
    const POS_DELTA_EPS = 1e-4;
    const TARGET_DELTA_EPS = 1e-4;
    const QUAT_DELTA_EPS = 1e-5;
    const PAN_DELTA_EPS = 1e-4;
    const moved =
      !last ||
      Math.abs(pos[0] - last.pos[0]) > POS_DELTA_EPS ||
      Math.abs(pos[1] - last.pos[1]) > POS_DELTA_EPS ||
      Math.abs(pos[2] - last.pos[2]) > POS_DELTA_EPS ||
      Math.abs(target[0] - (last.target?.[0] ?? VOLUME_CENTER[0])) > TARGET_DELTA_EPS ||
      Math.abs(target[1] - (last.target?.[1] ?? VOLUME_CENTER[1])) > TARGET_DELTA_EPS ||
      Math.abs(target[2] - (last.target?.[2] ?? VOLUME_CENTER[2])) > TARGET_DELTA_EPS ||
      Math.abs(quat[0] - (last.quat?.[0] ?? 0)) > QUAT_DELTA_EPS ||
      Math.abs(quat[1] - (last.quat?.[1] ?? 0)) > QUAT_DELTA_EPS ||
      Math.abs(quat[2] - (last.quat?.[2] ?? 0)) > QUAT_DELTA_EPS ||
      Math.abs(quat[3] - (last.quat?.[3] ?? 1)) > QUAT_DELTA_EPS ||
      Math.abs((pan?.[0] ?? 0) - (last.pan?.[0] ?? 0)) > PAN_DELTA_EPS ||
      Math.abs((pan?.[1] ?? 0) - (last.pan?.[1] ?? 0)) > PAN_DELTA_EPS;
    if (!moved) return;
    // Emit on every (above-epsilon) change so the upstream camera ref
    // stays current — the URL hash write is debounced 50 ms in App,
    // which is what coalesces the per-frame stream into a single
    // replaceState call once the damping settles below the epsilon.
    // Holding emits until N idle frames meant a tab duplicated
    // mid-rotation (or mid-damping) saw a stale hash.
    lastRef.current = cam;
    onCameraChange(cam);
  });

  return null;
}

function buildTooltip(data: NeuronDataset, i: number): string {
  const G = data.geneNames.length;
  const region = data.regionNames[data.regionIds[i]] ?? '?';
  const cluster = data.clusterIds[i];
  const fish = data.fishIds[i];
  const tops: Array<{ name: string; v: number }> = [];
  for (let g = 0; g < G; g++) {
    const v = data.geneCounts[i * G + g];
    if (v > 0) tops.push({ name: data.geneNames[g], v });
  }
  tops.sort((a, b) => b.v - a.v);
  const topStr = tops.slice(0, 3).map((t) => `${t.name}:${t.v.toFixed(0)}`).join(' ');
  return `neuron ${i}\nfish ${fish + 1}  cluster ${cluster}\nregion ${region}\ntop ${topStr || '-'}`;
}
