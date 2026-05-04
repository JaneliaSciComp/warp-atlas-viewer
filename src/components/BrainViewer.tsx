import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { NeuronDataset, FilterState, SelectionState } from '../data/types';
import { allocColoring, applyColoring } from '../utils/coloring';
import vertSrc from '../shaders/neuron.vert.glsl?raw';
import fragSrc from '../shaders/neuron.frag.glsl?raw';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  selection: SelectionState;
  onSelect: (indices: Uint32Array, source: 'cluster' | 'region' | '3d') => void;
}

interface PickState {
  /** Mouse position in canvas pixel coords, or null if mouse outside. */
  pos: { x: number; y: number } | null;
  /** Most recently picked neuron, or -1. Updated by useFrame in PointCloud. */
  hovered: number;
}

export type Orientation = 'portrait' | 'landscape';

/** Inner R3F component: owns the Points object and shader updates. */
function PointCloud({
  data,
  filter,
  selection,
  pickRef,
  onHoverChange,
  orientation,
}: {
  data: NeuronDataset;
  filter: FilterState;
  selection: SelectionState;
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
    applyColoring(data, filter, selection, buffers);
    (geometry.attributes.instColor as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instAlpha as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.instSize as THREE.BufferAttribute).needsUpdate = true;
  }, [data, filter, selection, buffers, geometry]);

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

export function BrainViewer({ data, filter, selection, onSelect }: Props) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const pickRef = useRef<PickState>({ pos: null, hovered: -1 });

  const camPosition = useMemo(() => {
    const { min, max } = data.bounds;
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    return [span * 1.0, span * 0.8, span * 1.4] as [number, number, number];
  }, [data]);

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
      // interpreted as "select this neuron".
      draggedRef.current = false;
      return;
    }
    const i = pickRef.current.hovered;
    if (i >= 0) {
      onSelect(new Uint32Array([i]), '3d');
      e.stopPropagation();
    }
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
          selection={selection}
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
      <div className="absolute top-2 left-2 text-xs text-neutral-400 font-mono pointer-events-none">
        {data.count.toLocaleString()} neurons {data.source === 'mock' ? '(mock)' : ''}
      </div>
      {/* orientation toggle — bottom-right corner. Both views are dorsal
          (top-down) horizontal sections; the arrow shows where the anterior
          end of the brain points on screen. */}
      <div
        className="absolute bottom-2 right-2 flex bg-neutral-900/85 border border-neutral-700 rounded font-mono overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {(
          [
            { id: 'portrait', label: '↑', aria: 'anterior up' },
            { id: 'landscape', label: '←', aria: 'anterior left' },
          ] as Array<{ id: Orientation; label: string; aria: string }>
        ).map((o) => (
          <button
            key={o.id}
            onClick={() => setOrientation(o.id)}
            className={
              'px-3 py-1 text-base leading-none ' +
              (orientation === o.id
                ? 'bg-neutral-100 text-neutral-900'
                : 'text-neutral-300 hover:bg-neutral-700')
            }
            aria-label={`orientation: ${o.aria}`}
            title={`orientation: ${o.aria}`}
          >
            {o.label}
          </button>
        ))}
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
