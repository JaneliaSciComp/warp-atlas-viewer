import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import type { NeuronDataset, FilterState, SelectionState, SettingsState } from '../data/types';
import { allocColoring, applyColoring } from '../utils/coloring';

interface Props {
  data: NeuronDataset;
  filter: FilterState;
  settings: SettingsState;
  selection: SelectionState;
  onSelect: (indices: Uint32Array, source: 'umap') => void;
}

interface Viewport {
  /** Scale multiplier on top of the natural fit-to-panel scale. 1 = fit. */
  zoom: number;
  /** Pan offset in panel pixels (added to the projected pixel position). */
  panX: number;
  panY: number;
}

const INITIAL_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

/** Standard ray-casting point-in-polygon test. The polygon is assumed
 *  closed (the last vertex implicitly connects back to the first). */
function pointInPolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function UmapPanel({ data, filter, settings, selection, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 400, h: 200 });
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);
  // Refs mirroring viewport so handlers (which capture closures) and the
  // wheel listener (passive: false on the DOM node) see the latest values
  // without re-binding.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Drag state distinguishes "select" (left button) from "pan" (right or
  // middle button); pan also fires on shift+left for users without a
  // multi-button mouse.
  const [drag, setDrag] = useState<
    | { kind: 'select'; pts: Array<[number, number]> }
    | { kind: 'pan'; lastX: number; lastY: number }
    | null
  >(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

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

  // UMAP → pixel coords. Uniform-scale fit-to-panel + viewport zoom + pan.
  // Both the renderer and the box-select use this so they stay in sync.
  const project = useCallback(
    (x: number, y: number, w: number, h: number, vp: Viewport) => {
      const dataW = umapBounds.xmax - umapBounds.xmin;
      const dataH = umapBounds.ymax - umapBounds.ymin;
      const baseScale = Math.min(w / dataW, h / dataH);
      const scale = baseScale * vp.zoom;
      const offsetX = (w - dataW * scale) / 2 + vp.panX;
      const offsetY = (h - dataH * scale) / 2 + vp.panY;
      const px = offsetX + (x - umapBounds.xmin) * scale;
      const py = offsetY + (umapBounds.ymax - y) * scale;
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

    applyColoring(data, filter, settings, selection, buffers);

    const colors = buffers.colors;
    const alphas = buffers.alphas;
    const dotSize = Math.max(1.2, 1.5 * Math.sqrt(viewport.zoom));
    for (let i = 0; i < data.count; i++) {
      const a = alphas[i];
      if (a < 0.05) continue;
      const [px, py] = project(data.umap[i * 2], data.umap[i * 2 + 1], size.w, size.h, viewport);
      // Skip points outside the panel; minor speedup at high zoom.
      if (px < -2 || py < -2 || px > size.w + 2 || py > size.h + 2) continue;
      const r = Math.round(colors[i * 3] * 255);
      const g = Math.round(colors[i * 3 + 1] * 255);
      const b = Math.round(colors[i * 3 + 2] * 255);
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`;
      ctx.fillRect(px, py, dotSize, dotSize);
    }

    if (drag && drag.kind === 'select' && drag.pts.length > 1) {
      const pts = drag.pts;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p][0], pts[p][1]);
      // Visually close the polygon back to the start so the enclosed
      // region reads as a shape, not an open scribble. Don't include
      // the closing edge when there are only 2 points (it'd just be a
      // line back over itself).
      if (pts.length >= 3) ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      if (pts.length >= 3) ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 2]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [data, filter, settings, selection, buffers, size, viewport, project, drag]);

  // Wheel: zoom anchored at the cursor so the data point under the mouse
  // stays put. Native non-passive listener (React's onWheel is passive in
  // React 17+, so preventDefault has no effect).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const vp = viewportRef.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newZoom = Math.max(0.25, Math.min(40, vp.zoom * factor));
      const ratio = newZoom / vp.zoom;
      // Anchor: keep the point under the cursor fixed during zoom.
      // px_new = (panX_new) + (px_old - panX_old) * ratio  (approx — see
      // derivation below). Solving so cursor stays put:
      //   panX_new = mx - ratio * (mx - panX_old_with_centering)
      // We treat the natural-fit centering as part of the offset by using
      // the same project() math: the easier route is to back out the data
      // point under the cursor at the OLD viewport and re-project at the
      // NEW viewport, then shift pan by the delta.
      const dataW = umapBounds.xmax - umapBounds.xmin;
      const dataH = umapBounds.ymax - umapBounds.ymin;
      const baseScale = Math.min(size.w / dataW, size.h / dataH);
      const oldScale = baseScale * vp.zoom;
      const oldOffsetX = (size.w - dataW * oldScale) / 2 + vp.panX;
      const oldOffsetY = (size.h - dataH * oldScale) / 2 + vp.panY;
      const dataX = (mx - oldOffsetX) / oldScale + umapBounds.xmin;
      const dataY = umapBounds.ymax - (my - oldOffsetY) / oldScale;
      const newScale = baseScale * newZoom;
      const newCenterOffX = (size.w - dataW * newScale) / 2;
      const newCenterOffY = (size.h - dataH * newScale) / 2;
      const newPanX = mx - (dataX - umapBounds.xmin) * newScale - newCenterOffX;
      const newPanY = my - (umapBounds.ymax - dataY) * newScale - newCenterOffY;
      setViewport({ zoom: newZoom, panX: newPanX, panY: newPanY });
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [umapBounds, size]);

  const onDown = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Right button (2) or middle button (1) or shift+left → pan.
    const isPan = e.button === 2 || e.button === 1 || e.shiftKey;
    if (isPan) {
      setDrag({ kind: 'pan', lastX: x, lastY: y });
    } else {
      setDrag({ kind: 'select', pts: [[x, y]] });
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (d.kind === 'pan') {
      const dx = x - d.lastX;
      const dy = y - d.lastY;
      setViewport((vp) => ({ ...vp, panX: vp.panX + dx, panY: vp.panY + dy }));
      setDrag({ kind: 'pan', lastX: x, lastY: y });
    } else {
      // Subsample: only append a new vertex if the cursor moved far
      // enough from the last one. Keeps the polyline readable and the
      // point-in-polygon hit test cheap.
      const last = d.pts[d.pts.length - 1];
      const dx = x - last[0];
      const dy = y - last[1];
      if (dx * dx + dy * dy < 4) return;
      setDrag({ kind: 'select', pts: [...d.pts, [x, y]] });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (d.kind === 'pan') {
      setDrag(null);
      return;
    }
    const pts = d.pts;
    setDrag(null);
    // Need at least a triangle to enclose anything; treat tiny lassos
    // (clicks or near-clicks) as "clear selection".
    if (pts.length < 3) {
      onSelect(new Uint32Array(0), 'umap');
      return;
    }
    // Bounding box for a quick reject before the polygon test.
    let bxmin = pts[0][0], bxmax = pts[0][0];
    let bymin = pts[0][1], bymax = pts[0][1];
    for (let p = 1; p < pts.length; p++) {
      const px = pts[p][0], py = pts[p][1];
      if (px < bxmin) bxmin = px; else if (px > bxmax) bxmax = px;
      if (py < bymin) bymin = py; else if (py > bymax) bymax = py;
    }
    if (bxmax - bxmin < 3 || bymax - bymin < 3) {
      onSelect(new Uint32Array(0), 'umap');
      return;
    }
    const out: number[] = [];
    for (let i = 0; i < data.count; i++) {
      const [px, py] = project(data.umap[i * 2], data.umap[i * 2 + 1], size.w, size.h, viewport);
      if (px < bxmin || px > bxmax || py < bymin || py > bymax) continue;
      if (pointInPolygon(px, py, pts)) out.push(i);
    }
    onSelect(new Uint32Array(out), 'umap');
  };

  const resetView = () => setViewport(INITIAL_VIEWPORT);
  const zoomedIn = viewport.zoom !== 1 || viewport.panX !== 0 || viewport.panY !== 0;

  return (
    <div className="relative w-full h-full bg-neutral-900 border-t border-l border-neutral-700 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-2 py-1 min-h-8 text-[10px] text-neutral-400 font-mono flex-shrink-0">
        <span className="truncate">t-SNE</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {selection.source === 'umap' && selection.indices.length > 0 && (
            <button
              onClick={() => onSelect(new Uint32Array(0), 'umap')}
              className="font-mono bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-800"
            >
              clear selection
            </button>
          )}
          {zoomedIn && (
            <button
              onClick={resetView}
              className="font-mono bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-800"
            >
              reset view
            </button>
          )}
        </div>
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-0 min-w-0">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onContextMenu={(e) => e.preventDefault()}
          className={'block ' + (drag?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-crosshair')}
        />
      </div>
    </div>
  );
}
