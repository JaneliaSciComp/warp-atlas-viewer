import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import type { NeuronDataset, FilterState, SelectionState } from '../data/types';
import { allocColoring, applyColoring } from '../utils/coloring';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  selection: SelectionState;
  onSelect: (indices: Uint32Array, source: 'umap') => void;
}

export function UmapPanel({ data, filter, selection, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 400, h: 200 });
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  // Compute UMAP bounds once.
  const umapBounds = useMemo(() => {
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (let i = 0; i < data.count; i++) {
      const x = data.umap[i * 2];
      const y = data.umap[i * 2 + 1];
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }
    const padX = (xmax - xmin) * 0.05;
    const padY = (ymax - ymin) * 0.05;
    return { xmin: xmin - padX, xmax: xmax + padX, ymin: ymin - padY, ymax: ymax + padY };
  }, [data]);

  // Reusable color buffer mirroring 3D viewer coloring rules.
  const buffers = useMemo(() => allocColoring(data.count), [data]);

  // Map UMAP → pixel coords.
  const project = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const px = ((x - umapBounds.xmin) / (umapBounds.xmax - umapBounds.xmin)) * w;
      const py = h - ((y - umapBounds.ymin) / (umapBounds.ymax - umapBounds.ymin)) * h;
      return [px, py];
    },
    [umapBounds],
  );

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const r = e.contentRect;
        setSize({ w: Math.max(50, Math.floor(r.width)), h: Math.max(50, Math.floor(r.height)) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Render scatter
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, size.w, size.h);

    applyColoring(data, filter, selection, buffers);

    // Draw points using fillRect for speed at 238k. 1.5px squares.
    const colors = buffers.colors;
    const alphas = buffers.alphas;
    for (let i = 0; i < data.count; i++) {
      const a = alphas[i];
      if (a < 0.05) continue;
      const [px, py] = project(data.umap[i * 2], data.umap[i * 2 + 1], size.w, size.h);
      const r = Math.round(colors[i * 3] * 255);
      const g = Math.round(colors[i * 3 + 1] * 255);
      const b = Math.round(colors[i * 3 + 2] * 255);
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`;
      ctx.fillRect(px, py, 1.5, 1.5);
    }

    // Draw drag rectangle on top
    if (drag) {
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 2]);
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.min(drag.x0, drag.x1),
        Math.min(drag.y0, drag.y1),
        Math.abs(drag.x1 - drag.x0),
        Math.abs(drag.y1 - drag.y0),
      );
      ctx.setLineDash([]);
    }
  }, [data, filter, selection, buffers, size, project, drag]);

  // Drag-to-select
  const onDown = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrag({ x0: x, y0: y, x1: x, y1: y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDrag({ ...drag, x1: e.clientX - rect.left, y1: e.clientY - rect.top });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const x0 = Math.min(drag.x0, drag.x1);
    const x1 = Math.max(drag.x0, drag.x1);
    const y0 = Math.min(drag.y0, drag.y1);
    const y1 = Math.max(drag.y0, drag.y1);
    setDrag(null);
    if (x1 - x0 < 3 || y1 - y0 < 3) {
      onSelect(new Uint32Array(0), 'umap');
      return;
    }
    const out: number[] = [];
    for (let i = 0; i < data.count; i++) {
      const [px, py] = project(data.umap[i * 2], data.umap[i * 2 + 1], size.w, size.h);
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) out.push(i);
    }
    onSelect(new Uint32Array(out), 'umap');
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-neutral-900 border-t border-l border-neutral-700">
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="block cursor-crosshair"
      />
      <div className="absolute top-1 left-2 text-[10px] text-neutral-400 font-mono pointer-events-none">
        t-SNE — drag to select
      </div>
    </div>
  );
}
