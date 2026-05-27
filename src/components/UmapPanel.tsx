import { useEffect, useRef, useMemo, useCallback, useLayoutEffect, useState } from 'react';
import type { FilterState, NeuronDataset, SelectionState, SettingsState } from '../data/types';
import type { UmapViewport } from '../utils/urlState';
import type { SharedColoring } from '../hooks/useColoring';
import { anyFilterActive, cellInSet, cellIsRenderable } from '../utils/coloring';
import { pointInPolygon } from '../utils/polygon';

interface Props {
  data: NeuronDataset;
  /** Active filter state. Used to keep t-SNE click + lasso selection
   *  consistent with the 3D viewer: dimmed (out-of-filter) cells are
   *  not pickable when something visible is nearby, and the lasso
   *  ignores them entirely. */
  filter: FilterState;
  settings: SettingsState;
  selection: SelectionState;
  /** Shared base coloring (filter+settings+selection are baked in
   *  already) computed once in App and consumed read-only here — no
   *  in-place mutation. See `useColoring`. */
  coloring: SharedColoring | null;
  /** Single-neuron focus, mirrored from the 3D viewer. Click in
   *  t-SNE → focus; click empty space → unfocus. The lasso selection
   *  is independent and survives focus changes. */
  focusedNeuron: number | null;
  onFocus: (i: number | null) => void;
  /** Fires when the lasso closes (with the polygon in t-SNE data
   *  coords) or the selection is cleared (empty indices, null poly). */
  onSelect: (indices: Uint32Array, polygon: Float32Array | null) => void;
  /** Viewport state restored from URL on first mount. */
  initialViewport?: UmapViewport | null;
  /** Fired on every viewport change so App can mirror it to the URL. */
  onViewportChange?: (vp: UmapViewport) => void;
}

interface Viewport {
  /** Scale multiplier on top of the natural fit-to-panel scale. 1 = fit. */
  zoom: number;
  /** Pan offset in panel pixels (added to the projected pixel position). */
  panX: number;
  panY: number;
}

const INITIAL_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

export function UmapPanel({
  data,
  filter,
  settings,
  selection,
  coloring,
  focusedNeuron,
  onFocus,
  onSelect,
  initialViewport,
  onViewportChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 400, h: 200 });
  const [viewport, setViewport] = useState<Viewport>(initialViewport ?? INITIAL_VIEWPORT);
  const measureContainerSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const next = {
      w: Math.max(50, Math.floor(rect.width)),
      h: Math.max(50, Math.floor(rect.height)),
    };
    setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    return next;
  }, []);
  // Refs mirroring viewport so handlers (which capture closures) and the
  // wheel listener (passive: false on the DOM node) see the latest values
  // without re-binding.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  // Mirror viewport changes up to App so the URL hash can track them.
  // Skip the very first effect tick so we don't fire a no-op write back
  // on mount with the URL-restored value.
  const viewportEmittedRef = useRef(false);
  useEffect(() => {
    if (!onViewportChange) return;
    if (!viewportEmittedRef.current) {
      viewportEmittedRef.current = true;
      return;
    }
    onViewportChange(viewport);
  }, [viewport, onViewportChange]);

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

  // Resize observer. Use a layout effect and the live bounding rect so
  // canvas state tracks the visible plot area before paint. Reset also
  // calls this directly to avoid centering against a stale pre-resize size.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    measureContainerSize();
    const ro = new ResizeObserver((entries) => {
      if (entries.length > 0) measureContainerSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureContainerSize]);

  // Offscreen canvas caches the scatter render. During a lasso drag we
  // re-blit this onto the visible canvas (cheap) instead of looping
  // over all 274k cells per pointermove (expensive). The cache is
  // invalidated only when its inputs change (data/filter/viewport/etc.).
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  if (!offscreenRef.current && typeof document !== 'undefined') {
    offscreenRef.current = document.createElement('canvas');
  }

  // ImageData buffer reused across renders — allocating 19 MB
  // (1500×800@2dpr) per scatter rebuild adds noticeable overhead, so
  // we keep it in a ref and reallocate only when the canvas size
  // changes.
  const imageDataRef = useRef<ImageData | null>(null);

  // Effect A — render the scatter to the offscreen canvas. Re-runs only
  // when something that affects the scatter changes; crucially, NOT
  // when `drag` changes, so the lasso polyline doesn't trigger a
  // 274k-cell redraw.
  //
  // Per-cell drawing uses direct ImageData pixel stamping rather than
  // ctx.fillStyle/arc/fill. The canvas-state-change overhead (string
  // parse for fillStyle, path machinery for arc) was the bottleneck
  // at zoom 1 where ~all 274k cells have to be drawn — direct writes
  // are ~5-10× faster for the small (~1.5 px) dots typical of a
  // zoomed-out view.
  useEffect(() => {
    if (!coloring) return;
    const off = offscreenRef.current;
    if (!off) return;
    const dpr = window.devicePixelRatio || 1;
    const W = size.w * dpr;
    const H = size.h * dpr;
    off.width = W;
    off.height = H;
    const ctx = off.getContext('2d')!;

    let imageData = imageDataRef.current;
    if (!imageData || imageData.width !== W || imageData.height !== H) {
      imageData = ctx.createImageData(W, H);
      imageDataRef.current = imageData;
    }
    const buf = imageData.data;
    // Background fill (#0a0a0a, opaque) so unpainted areas match the
    // dot field. Single tight loop — ~9 ms for 19 MB on a modern CPU.
    for (let p = 0; p < buf.length; p += 4) {
      buf[p] = 0x0a;
      buf[p + 1] = 0x0a;
      buf[p + 2] = 0x0a;
      buf[p + 3] = 0xff;
    }

    // Precompute the dot stamp at the current radius. A flat
    // [dx, dy, weight, dx, dy, weight, ...] array of physical-pixel
    // offsets with smoothstep edge weights for AA. Built once per
    // render instead of per cell.
    const effPointSize = settings.umapPointSize;
    const dotSize = Math.max(1, effPointSize * 0.18 * Math.sqrt(viewport.zoom));
    const radius = dotSize / 2;
    const radiusPhys = radius * dpr;
    const stampR = Math.ceil(radiusPhys + 1);
    const stampTriples: number[] = [];
    for (let dy = -stampR; dy <= stampR; dy++) {
      for (let dx = -stampR; dx <= stampR; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        const w = Math.max(0, Math.min(1, radiusPhys - d + 0.5));
        if (w > 0.01) stampTriples.push(dx, dy, w);
      }
    }
    const stamp = stampTriples;
    const stampLen = stamp.length;

    // Inline the project() math so we avoid a function call per cell.
    const dataW = umapBounds.xmax - umapBounds.xmin;
    const dataH = umapBounds.ymax - umapBounds.ymin;
    const baseScale = Math.min(size.w / dataW, size.h / dataH);
    const scale = baseScale * viewport.zoom;
    const offsetX = (size.w - dataW * scale) / 2 + viewport.panX;
    const offsetY = (size.h - dataH * scale) / 2 + viewport.panY;
    const xmin = umapBounds.xmin;
    const ymax = umapBounds.ymax;

    const colors = coloring.result.colors;
    const alphas = coloring.result.alphas;
    const umap = data.umap;
    const count = data.count;
    // drawOrder (when present) places out-of-filter indices first and
    // in-filter ones last. Stamping in that order makes in-set cells
    // composite over the dim ghost haze. Falls back to natural index
    // order when no filter is active.
    const order = coloring.drawOrder;
    // Re-derive ghost alpha for t-SNE from settings.umapGhostIntensity,
    // independent of whatever 3D ghost intensity was baked in. The
    // partition boundary is at `inCursor`: indices in drawOrder[0..inCursor)
    // are ghosts, [inCursor..count) are in-set. We compute a per-cell
    // scale that maps the baked ghost alpha back to its base (DIM/LIFT)
    // and re-applies the t-SNE setting in one multiply.
    const inCursor = order ? count - (coloring.filterSelection?.length ?? 0) : 0;
    const bakedGhost = coloring.effectiveGhostIntensity || 1;
    const ghostScale = settings.umapGhostIntensity / bakedGhost;

    for (let k = 0; k < count; k++) {
      const i = order ? order[k] : k;
      let a = alphas[i];
      // When drawOrder is in use, cells before inCursor are ghosts and
      // their alpha should reflect the t-SNE ghost setting, not the 3D
      // one baked into the shared buffer. Faded-correlation in-set cells
      // (alpha < ALPHA_PASS_SPLIT but sitting in the in-set partition)
      // are left untouched.
      if (order && k < inCursor) a *= ghostScale;
      // Skip stamps only when alpha is so low the cell contributes no
      // visible pixels at this DPR — a stamp with weight ~0.001 still
      // changes a pixel by ≤ 1/255 even with full overlap. Above that
      // we draw normally so the ghost slider's bottom half doesn't
      // hard-cut to invisible.
      if (a < 0.002) continue;
      const px = offsetX + (umap[i * 2] - xmin) * scale;
      const py = offsetY + (ymax - umap[i * 2 + 1]) * scale;
      // Convert to physical pixel center.
      const cx = (px * dpr) | 0;
      const cy = (py * dpr) | 0;
      // Reject far-off-canvas cells before the stamp loop.
      if (cx < -stampR || cy < -stampR || cx > W + stampR || cy > H + stampR) continue;

      const r = colors[i * 3] * 255;
      const g = colors[i * 3 + 1] * 255;
      const b = colors[i * 3 + 2] * 255;

      for (let s = 0; s < stampLen; s += 3) {
        const tx = cx + stamp[s];
        const ty = cy + stamp[s + 1];
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const idx = (ty * W + tx) * 4;
        const aw = a * stamp[s + 2];
        const inv = 1 - aw;
        // Uint8ClampedArray clamps to 0-255 automatically.
        buf[idx] = buf[idx] * inv + r * aw;
        buf[idx + 1] = buf[idx + 1] * inv + g * aw;
        buf[idx + 2] = buf[idx + 2] * inv + b * aw;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Focused-neuron marker: a small white ring drawn on top of the
    // scatter so the cell stands out regardless of color scheme.
    // Single cell — ctx.arc is fine here.
    if (focusedNeuron != null && focusedNeuron >= 0 && focusedNeuron < data.count) {
      const [px, py] = project(
        data.umap[focusedNeuron * 2],
        data.umap[focusedNeuron * 2 + 1],
        size.w,
        size.h,
        viewport,
      );
      if (px >= -10 && py >= -10 && px <= size.w + 10 && py <= size.h + 10) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath();
        ctx.arc(px, py, Math.max(6, radius + 2), 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }, [data, settings.umapPointSize, settings.umapGhostIntensity, coloring, focusedNeuron, size, viewport, project, umapBounds]);

  // Effect B — composite the cached scatter onto the visible canvas
  // and overlay the in-progress lasso. Cheap (drawImage + a polyline),
  // safe to run on every pointermove.
  useEffect(() => {
    const canvas = canvasRef.current;
    const off = offscreenRef.current;
    if (!canvas || !off) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(off, 0, 0, size.w, size.h);

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
  }, [size, drag, coloring, focusedNeuron, viewport]);

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
      const newZoom = Math.max(0.25, Math.min(1000, vp.zoom * factor));
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
    // Bounding box: distinguishes a tap (≤ 3 px in either dimension)
    // from a real lasso. A tap also captures the case of < 3 vertices
    // since you can't have an enclosing polygon below that.
    let bxmin = pts[0][0], bxmax = pts[0][0];
    let bymin = pts[0][1], bymax = pts[0][1];
    for (let p = 1; p < pts.length; p++) {
      const px = pts[p][0], py = pts[p][1];
      if (px < bxmin) bxmin = px; else if (px > bxmax) bxmax = px;
      if (py < bymin) bymin = py; else if (py > bymax) bymax = py;
    }
    const isTap = pts.length < 3 || (bxmax - bxmin < 3 && bymax - bymin < 3);
    if (isTap) {
      // Click handling: find the nearest neuron within ~16 px and
      // focus it (mirrors the 3D viewer's click-to-focus). When a
      // filter is active, in-filter cells outrank out-of-filter ones
      // regardless of distance — dimmed cells should not steal a
      // click that's also near a coloured cell. Out-of-filter cells
      // are only considered if no in-filter cell is in the window,
      // and not at all when ghost mode is on (they're invisible).
      const cx = pts[0][0], cy = pts[0][1];
      const PIX_THRESH_SQ = 16 * 16;
      const filterActive = anyFilterActive(data, filter);
      // t-SNE picker tracks the t-SNE ghost setting (not the 3D one).
      // Below half-visibility, ghosts are too faint to aim at and the
      // picker excludes them so clicks land on cells the user can see.
      const ghost = filterActive && settings.umapGhostIntensity < 0.5;
      let bestI = -1;
      let bestD2 = PIX_THRESH_SQ;
      let bestInFilter = false;
      for (let i = 0; i < data.count; i++) {
        if (!cellIsRenderable(data, filter, i)) continue;
        const [px, py] = project(data.umap[i * 2], data.umap[i * 2 + 1], size.w, size.h, viewport);
        if (px < cx - 16 || px > cx + 16 || py < cy - 16 || py > cy + 16) continue;
        const dx = px - cx;
        const dy = py - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= PIX_THRESH_SQ) continue;
        const inFilter = !filterActive || cellInSet(data, filter, settings, i);
        if (inFilter) {
          if (!bestInFilter || d2 < bestD2) {
            bestInFilter = true;
            bestD2 = d2;
            bestI = i;
          }
        } else if (!bestInFilter && !ghost && d2 < bestD2) {
          bestD2 = d2;
          bestI = i;
        }
      }
      onFocus(bestI >= 0 ? bestI : null);
      return;
    }
    // Flatten the pixel-space polygon once; the shared pointInPolygon
    // expects [x0,y0,x1,y1,…] for a stride-friendly hot loop.
    const polyPx = new Float32Array(pts.length * 2);
    for (let p = 0; p < pts.length; p++) {
      polyPx[p * 2] = pts[p][0];
      polyPx[p * 2 + 1] = pts[p][1];
    }
    // Lassoing across dimmed (out-of-filter) cells should not pull
    // them into the selection — they aren't visibly there. When a
    // filter is active, exclude cells that fail the filter predicate.
    const filterActive = anyFilterActive(data, filter);
    const out: number[] = [];
    for (let i = 0; i < data.count; i++) {
      if (!cellIsRenderable(data, filter, i)) continue;
      const [px, py] = project(data.umap[i * 2], data.umap[i * 2 + 1], size.w, size.h, viewport);
      if (px < bxmin || px > bxmax || py < bymin || py > bymax) continue;
      if (!pointInPolygon(px, py, polyPx)) continue;
      if (filterActive && !cellInSet(data, filter, settings, i)) continue;
      out.push(i);
    }
    // Capture the polygon in t-SNE data coords too — App round-trips
    // it through the URL hash, way smaller than serializing thousands
    // of indices. Inverse of project()'s pixel mapping:
    //   px = offsetX + (x - xmin) * scale
    //   py = offsetY + (ymax - y) * scale
    const dataW = umapBounds.xmax - umapBounds.xmin;
    const dataH = umapBounds.ymax - umapBounds.ymin;
    const baseScale = Math.min(size.w / dataW, size.h / dataH);
    const scale = baseScale * viewport.zoom;
    const offsetX = (size.w - dataW * scale) / 2 + viewport.panX;
    const offsetY = (size.h - dataH * scale) / 2 + viewport.panY;
    const dataPoly = new Float32Array(pts.length * 2);
    for (let p = 0; p < pts.length; p++) {
      dataPoly[p * 2] = (pts[p][0] - offsetX) / scale + umapBounds.xmin;
      dataPoly[p * 2 + 1] = umapBounds.ymax - (pts[p][1] - offsetY) / scale;
    }
    onSelect(new Uint32Array(out), dataPoly);
  };

  const resetView = () => {
    measureContainerSize();
    setViewport(INITIAL_VIEWPORT);
  };
  const zoomedIn = viewport.zoom !== 1 || viewport.panX !== 0 || viewport.panY !== 0;

  return (
    <div className="relative w-full h-full bg-neutral-900 border-t border-l border-neutral-700 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-2 py-1 min-h-8 text-[10px] text-neutral-400 font-mono flex-shrink-0">
        <span className="truncate">t-SNE</span>
        <div className="flex items-center gap-2 flex-shrink-0">
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
      <div ref={containerRef} className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onContextMenu={(e) => e.preventDefault()}
          className={'absolute left-0 top-0 block ' + (drag?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-crosshair')}
        />
        {selection.indices.length > 0 && (
          <div className="absolute top-2 right-2 text-xs text-neutral-400 font-mono pointer-events-none leading-tight">
            {selection.indices.length.toLocaleString()} selected
          </div>
        )}
      </div>
    </div>
  );
}
