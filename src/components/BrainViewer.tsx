import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { TrackballControls } from '@react-three/drei';
import * as THREE from 'three';
import type { NeuronDataset, FilterState, SettingsState } from '../data/types';
import type { CameraState } from '../utils/urlState';
import { allocColoring, anyFilterActive, cellInSet } from '../utils/coloring';
import type { SharedColoring } from '../hooks/useColoring';
import vertSrc from '../shaders/neuron.vert.glsl?raw';
import fragSrc from '../shaders/neuron.frag.glsl?raw';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  /** Shared base coloring computed once in App. We copy it into our
   *  own buffers so we can stamp the focused-neuron brighter on top
   *  without corrupting what UmapPanel reads. */
  coloring: SharedColoring | null;
  /** Single-neuron focus, separate from the group selection. */
  focusedNeuron: number | null;
  /** Click on a neuron sets focus; click on empty space sets to null. */
  onFocus: (i: number | null) => void;
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
  focusedNeuron,
  pickRef,
  onHoverChange,
}: {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  coloring: SharedColoring | null;
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
        alphaMin: { value: 0 },
        alphaMax: { value: ALPHA_PASS_SPLIT },
      },
    });
  }, [gl]);

  useEffect(() => {
    if (!coloring) return;
    // Copy the shared base coloring into our own buffers so the
    // focused-neuron stamp below doesn't corrupt what other consumers
    // (UmapPanel) read from the same shared result.
    buffers.colors.set(coloring.result.colors);
    buffers.alphas.set(coloring.result.alphas);
    buffers.sizes.set(coloring.result.sizes);
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
  }, [data, coloring, focusedNeuron, buffers, geometry]);

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
  // the focus ring stays sized relative to the dots it surrounds even
  // when autoSizing is on.
  const effectiveMarkerSize = coloring?.effectivePointSize ?? settings.pointSize;
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
    const PIX_THRESH_SQ = 16 * 16;

    // Match the world-rotation applied by <group> below: rotate +90°
    // around Z (so AP/world-y → screen-x, ML/world-x → screen-y).

    // Pick the cell closest to the cursor in screen space, breaking
    // ties by depth (front-most wins). Depth-only would correctly
    // pick the visible cell in a tight overlap but goes wrong when
    // zoomed out — the 16 px window then contains many cells, so the
    // foreground winner can be visibly several pixels off-cursor while
    // a deeper cell sits right under the click.
    //
    // When a filter is active, in-filter cells outrank out-of-filter
    // ones regardless of distance/depth: the dimmed background cells
    // are visually de-emphasized, so a click on a coloured cell that
    // happens to sit a hair behind a greyed-out one should still land
    // on the coloured cell. Out-of-filter cells are only considered if
    // no in-filter cell is within the pick window — and not at all
    // when ghost mode is on, since they're effectively invisible.
    const filterActive = anyFilterActive(data, filter);
    // Below half visibility, ghosts are too faint to aim at — skip
    // them in the picker so clicks always land on cells the user can
    // actually see. Use coloring's effective ghost intensity so this
    // tracks autoSizing too.
    const effGhost = coloring?.effectiveGhostIntensity ?? settings.ghostIntensity;
    const ghost = filterActive && effGhost < 0.5;
    let bestI = -1;
    let bestD2 = Infinity;
    let bestZ = Infinity;
    let bestInFilter = false;
    for (let i = 0; i < data.count; i++) {
      const ox = positions[i * 3];
      const x = -positions[i * 3 + 1];
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
      if (d2 >= PIX_THRESH_SQ) continue;
      const depth = -cz;
      const inFilter = !filterActive || cellInSet(data, filter, settings, i);
      if (inFilter) {
        if (!bestInFilter || d2 < bestD2 || (d2 === bestD2 && depth < bestZ)) {
          bestInFilter = true;
          bestD2 = d2;
          bestZ = depth;
          bestI = i;
        }
      } else if (!bestInFilter && !ghost) {
        if (d2 < bestD2 || (d2 === bestD2 && depth < bestZ)) {
          bestD2 = d2;
          bestZ = depth;
          bestI = i;
        }
      }
    }

    if (bestI !== pickRef.current.hovered) {
      pickRef.current.hovered = bestI;
      onHoverChange(bestI);
    }
  });

  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      {/* Opaque pass first so its depth values are in place before the
        * transparent pass reads them. Both points share the same
        * geometry — the materials' alphaMin / alphaMax uniforms
        * partition cells by alpha at the fragment level. */}
      <points geometry={geometry} material={opaqueMaterial} renderOrder={0} />
      <points geometry={geometry} material={transparentMaterial} renderOrder={1} />
      <points geometry={markerGeometry} material={markerMaterial} renderOrder={2} />
    </group>
  );
}

export function BrainViewer({
  data,
  filter,
  settings,
  coloring,
  focusedNeuron,
  onFocus,
  initialCamera,
  onCameraChange,
}: Props) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const pickRef = useRef<PickState>({ pos: null, hovered: -1 });

  // Default camera position derived from the data bounds — straight-on
  // dorsal view with the brain comfortably filling the landscape panel.
  const defaultCamPosition = useMemo(() => {
    const { min, max } = data.bounds;
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    return [0, 0, span * 0.95] as [number, number, number];
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
    if (pickRef.current.hovered >= 0) {
      setHover({
        i: pickRef.current.hovered,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
    // Promote pointerdown → drag once movement exceeds the threshold.
    if (downRef.current) {
      const dx = e.clientX - downRef.current.x;
      const dy = e.clientY - downRef.current.y;
      if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        draggedRef.current = true;
      }
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
  // mirror it into React state so the tooltip re-renders.
  const handleHoverChange = useCallback((i: number) => {
    if (i < 0) {
      setHover(null);
      return;
    }
    const pos = pickRef.current.pos;
    if (!pos) return;
    setHover({ i, x: pos.x, y: pos.y });
  }, []);

  const tooltip = hover ? buildTooltip(data, hover.i) : null;

  return (
    <div
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
          focusedNeuron={focusedNeuron}
          pickRef={pickRef}
          onHoverChange={handleHoverChange}
        />
        <TrackballControls
          makeDefault
          dynamicDampingFactor={0.1}
          rotateSpeed={4.0}
          zoomSpeed={1.5}
          noPan
        />
        <ScreenSpacePan enabled={settings.enablePan} panRef={screenPanRef} />
        <CameraSync
          initialCamera={initialCamera ?? null}
          onCameraChange={onCameraChange}
          panRef={screenPanRef}
        />
      </Canvas>
      {tooltip && hover && (
        <div className="neuron-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {tooltip}
        </div>
      )}
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
 *  that centered view lands inside the canvas. */
function ScreenSpacePan({
  enabled,
  panRef,
}: {
  enabled: boolean;
  panRef: React.MutableRefObject<ScreenPanState>;
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
    applyViewOffset();
  }, [applyViewOffset]);

  useEffect(() => {
    const el = gl.domElement;

    const onPointerDown = (event: PointerEvent) => {
      if (!enabled || event.button !== 2) return;
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
      if (enabled) event.preventDefault();
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

  useEffect(() => {
    if (!enabled) dragRef.current = null;
  }, [enabled]);

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
}: {
  initialCamera: CameraState | null;
  onCameraChange?: (cam: CameraState) => void;
  panRef: React.MutableRefObject<ScreenPanState>;
}) {
  const camera = useThree((s) => s.camera);
  // The drei controls wire themselves in via makeDefault; useThree
  // exposes the instance on .controls. Use any to avoid a public-API
  // dependency on TrackballControlsImpl.
  const controls = useThree((s) => s.controls) as any;
  const restoredRef = useRef(false);
  const lastRef = useRef<CameraState | null>(null);
  const idleFramesRef = useRef(0);
  const dirtyRef = useRef(false);
  // ~3 frames at 60fps ≈ 50 ms — long enough to outlast any frame
  // hitches from the trackball's damping but short enough to feel
  // immediate.
  const IDLE_FRAMES = 3;

  useEffect(() => {
    if (!controls || restoredRef.current) return;
    if (initialCamera) {
      camera.position.set(...initialCamera.pos);
      // Camera target used to double as pan state in older URLs. The point
      // cloud is centered at the origin, so always restore the true orbit
      // center and keep screen pan in CameraState.pan instead.
      controls.target.set(...VOLUME_CENTER);
      controls.update();
    }
    restoredRef.current = true;
  }, [controls, camera, initialCamera]);

  useFrame(() => {
    if (!controls) return;
    if (
      controls.target.x !== VOLUME_CENTER[0] ||
      controls.target.y !== VOLUME_CENTER[1] ||
      controls.target.z !== VOLUME_CENTER[2]
    ) {
      controls.target.set(...VOLUME_CENTER);
      controls.update();
    }
    if (!onCameraChange) return;
    const pos: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    const target: [number, number, number] = [...VOLUME_CENTER];
    const rawPan = panRef.current;
    const pan: [number, number] | undefined =
      rawPan.x !== 0 || rawPan.y !== 0 ? [rawPan.x, rawPan.y] : undefined;
    const cam: CameraState = pan ? { pos, target, pan } : { pos, target };
    const last = lastRef.current;
    const moved =
      !last ||
      pos[0] !== last.pos[0] || pos[1] !== last.pos[1] || pos[2] !== last.pos[2] ||
      target[0] !== last.target[0] || target[1] !== last.target[1] || target[2] !== last.target[2] ||
      (pan?.[0] ?? 0) !== (last.pan?.[0] ?? 0) ||
      (pan?.[1] ?? 0) !== (last.pan?.[1] ?? 0);
    if (moved) {
      lastRef.current = cam;
      idleFramesRef.current = 0;
      dirtyRef.current = true;
      return;
    }
    if (!dirtyRef.current) return;
    idleFramesRef.current++;
    if (idleFramesRef.current >= IDLE_FRAMES) {
      onCameraChange(cam);
      dirtyRef.current = false;
    }
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
