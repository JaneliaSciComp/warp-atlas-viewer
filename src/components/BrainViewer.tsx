import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { NeuronDataset, FilterState, SelectionState, SettingsState, Orientation } from '../data/types';
import { allocColoring, applyColoring } from '../utils/coloring';
import vertSrc from '../shaders/neuron.vert.glsl?raw';
import fragSrc from '../shaders/neuron.frag.glsl?raw';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  selection: SelectionState;
  /** Single-neuron focus, separate from the group selection. */
  focusedNeuron: number | null;
  /** Click on a neuron sets focus; click on empty space sets to null. */
  onFocus: (i: number | null) => void;
}

interface PickState {
  /** Mouse position in canvas pixel coords, or null if mouse outside. */
  pos: { x: number; y: number } | null;
  /** Most recently picked neuron, or -1. Updated by useFrame in PointCloud. */
  hovered: number;
}


/** Inner R3F component: owns the Points object and shader updates. */
function PointCloud({
  data,
  filter,
  settings,
  selection,
  focusedNeuron,
  pickRef,
  onHoverChange,
  orientation,
}: {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  selection: SelectionState;
  focusedNeuron: number | null;
  pickRef: React.MutableRefObject<PickState>;
  onHoverChange: (i: number) => void;
  orientation: Orientation;
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
    applyColoring(data, filter, settings, selection, buffers);
    // Stamp the focused neuron on top of whatever group coloring chose
    // for it: full alpha, brightened, big enough to be unmistakable
    // even when the surrounding group is dimmed.
    if (focusedNeuron != null && focusedNeuron >= 0 && focusedNeuron < data.count) {
      const i = focusedNeuron;
      buffers.colors[i * 3] = Math.min(1, buffers.colors[i * 3] * 1.2 + 0.25);
      buffers.colors[i * 3 + 1] = Math.min(1, buffers.colors[i * 3 + 1] * 1.2 + 0.25);
      buffers.colors[i * 3 + 2] = Math.min(1, buffers.colors[i * 3 + 2] * 1.2 + 0.25);
      buffers.alphas[i] = 1.0;
      buffers.sizes[i] = Math.max(buffers.sizes[i], 7) * 2.5;
    }
    (geometry.attributes.instColor as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instAlpha as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instSize as THREE.BufferAttribute).needsUpdate = true;
  }, [data, filter, settings, selection, focusedNeuron, buffers, geometry]);

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

    // Match the world-rotation applied by <group> below: rotate +90° around
    // Z (so AP/world-y → screen-x, ML/world-x → screen-y) for landscape.
    const isLandscape = orientation === 'landscape';

    let bestI = -1;
    let bestZ = Infinity;
    for (let i = 0; i < data.count; i++) {
      let x = positions[i * 3];
      let y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      if (isLandscape) {
        const ox = x;
        x = -y;
        y = ox;
      }
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
      if (d2 < PIX_THRESH_SQ && -cz < bestZ) {
        bestZ = -cz;
        bestI = i;
      }
    }

    if (bestI !== pickRef.current.hovered) {
      pickRef.current.hovered = bestI;
      onHoverChange(bestI);
    }
  });

  return (
    <group rotation={[0, 0, orientation === 'landscape' ? Math.PI / 2 : 0]}>
      <points geometry={geometry} material={material} />
    </group>
  );
}

export function BrainViewer({ data, filter, settings, selection, focusedNeuron, onFocus }: Props) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const orientation: Orientation = settings.orientation;
  const pickRef = useRef<PickState>({ pos: null, hovered: -1 });

  const camPosition = useMemo(() => {
    const { min, max } = data.bounds;
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    // Straight-on dorsal view: camera directly above the brain looking
    // down -z. Distance picked so the brain comfortably fills a landscape
    // panel; portrait users can wheel out.
    return [0, 0, span * 0.95] as [number, number, number];
  }, [data]);

  // Count of cells visibly highlighted (i.e. not rendered with the dim
  // background style) in the current view. Region mode without an
  // isolate filter shows nothing — the whole brain is colored equally.
  const highlightCount = useMemo(() => {
    if (selection.indices.length > 0) return selection.indices.length;
    const G = data.geneNames.length;
    const S = data.stimulusNames.length;
    if (filter.colorMode === 'gene') {
      let n = 0;
      for (let i = 0; i < data.count; i++) {
        if (data.geneCounts[i * G + filter.selectedGene] > 0) n++;
      }
      return n;
    }
    if (filter.colorMode === 'stim') {
      // Cells that light up: those above the responsive floor (r > 0.30)
      // for whichever stimulus the scheme is keying off of. Mirrors
      // applyColoring: a single selected stim → that one; anything else
      // (zero, all, or a subset) → max across the corresponding set.
      const sel = filter.selectedStimuli;
      const useMax = sel.length !== 1;
      const maxSet =
        !useMax ? null : sel.length > 0 && sel.length < S ? sel : null;
      let n = 0;
      const STIM_LO = settings.stimLo;
      for (let i = 0; i < data.count; i++) {
        let r: number;
        if (!useMax) {
          r = data.stimulusCorr[i * S + sel[0]];
        } else if (maxSet === null) {
          const base = i * S;
          let m = data.stimulusCorr[base];
          for (let j = 1; j < S; j++) {
            const c = data.stimulusCorr[base + j];
            if (c > m) m = c;
          }
          r = m;
        } else {
          const base = i * S;
          let m = data.stimulusCorr[base + maxSet[0]];
          for (let k = 1; k < maxSet.length; k++) {
            const c = data.stimulusCorr[base + maxSet[k]];
            if (c > m) m = c;
          }
          r = m;
        }
        if (r > STIM_LO) n++;
      }
      return n;
    }
    return 0;
  }, [data, filter.colorMode, filter.selectedGene, filter.selectedStimuli, settings.stimLo, selection.indices]);

  // Track the pointer-down position so we can distinguish a click (no
  // movement) from a drag (rotate / pan). Without this, a drag-rotate
  // ending over a neuron fires the same DOM click event a true click
  // would, and the user accidentally selects that neuron.
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
          selection={selection}
          focusedNeuron={focusedNeuron}
          pickRef={pickRef}
          onHoverChange={handleHoverChange}
          orientation={orientation}
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      </Canvas>
      {tooltip && hover && (
        <div className="neuron-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {tooltip}
        </div>
      )}
      <div className="absolute top-2 left-2 text-xs text-neutral-400 font-mono pointer-events-none leading-tight">
        <div>{data.count.toLocaleString()} neurons {data.source === 'mock' ? '(mock)' : ''}</div>
        {highlightCount > 0 && (
          <div>{highlightCount.toLocaleString()} highlighted</div>
        )}
      </div>
    </div>
  );
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
  return `neuron ${i}\nfish ${fish}  cluster ${cluster}\nregion ${region}\ntop ${topStr || '-'}`;
}
