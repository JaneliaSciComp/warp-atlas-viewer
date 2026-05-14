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

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: fragSrc,
      transparent: true,
      depthWrite: false,
      uniforms: {
        pixelRatio: { value: gl.getPixelRatio() },
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
        baseSize: { value: settings.pointSize },
      },
    });
    // settings.pointSize is captured only as the initial uniform
    // value; later changes flow through the effect below by mutating
    // markerMaterial.uniforms.baseSize.value. Re-creating the whole
    // ShaderMaterial on every slider tick would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useEffect(() => {
    markerMaterial.uniforms.baseSize.value = settings.pointSize;
  }, [markerMaterial, settings.pointSize]);

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
    // no in-filter cell is within the pick window.
    const filterActive = anyFilterActive(data, filter);
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
      } else if (!bestInFilter) {
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
      <points geometry={geometry} material={material} />
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
  const camPosition = useMemo(() => {
    if (initialCamera) return initialCamera.pos;
    return defaultCamPosition;
    // initialCamera intentionally only consulted on first mount; we
    // don't want a remote URL update yanking the camera mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          noPan={!settings.enablePan}
        />
        <CameraSync
          initialCamera={initialCamera ?? null}
          onCameraChange={onCameraChange}
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

/** Reads/writes the camera-controls + camera state so App can mirror
 *  it to the URL hash. Restores `initialCamera` once on mount;
 *  thereafter polls the camera each frame and fires `onCameraChange`
 *  only after a few idle frames so the URL update lands when the user
 *  has truly stopped moving (covers TrackballControls' damping settle
 *  without spamming a write per frame). */
function CameraSync({
  initialCamera,
  onCameraChange,
}: {
  initialCamera: CameraState | null;
  onCameraChange?: (cam: CameraState) => void;
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
      controls.target.set(...initialCamera.target);
      controls.update();
    }
    restoredRef.current = true;
  }, [controls, camera, initialCamera]);

  useFrame(() => {
    if (!controls || !onCameraChange) return;
    const pos: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    const target: [number, number, number] = [controls.target.x, controls.target.y, controls.target.z];
    const last = lastRef.current;
    const moved =
      !last ||
      pos[0] !== last.pos[0] || pos[1] !== last.pos[1] || pos[2] !== last.pos[2] ||
      target[0] !== last.target[0] || target[1] !== last.target[1] || target[2] !== last.target[2];
    if (moved) {
      lastRef.current = { pos, target };
      idleFramesRef.current = 0;
      dirtyRef.current = true;
      return;
    }
    if (!dirtyRef.current) return;
    idleFramesRef.current++;
    if (idleFramesRef.current >= IDLE_FRAMES) {
      onCameraChange({ pos, target });
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
