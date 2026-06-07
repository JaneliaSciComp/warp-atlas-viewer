import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Panel resize bounds. The defaults also act as the expand-without-
// history target when no URL value is restored. Persisted values are
// clamped to these static bounds, while the live layout also caps the
// bottom row to the currently visible app height so it cannot be clipped
// by the root viewport. Exported so the URL writer can drop them from the
// hash when a panel sits at its default size.
export const BOTTOM_HEIGHT_DEFAULT = 352;
const BOTTOM_HEIGHT_MIN = 120;
const BOTTOM_HEIGHT_MAX = 1200;
export const DETAIL_WIDTH_DEFAULT = 360;
const DETAIL_WIDTH_MIN = 240;
const DETAIL_WIDTH_MAX = 800;

export interface PanelLayoutInitial {
  detailOpen?: boolean;
  bottomOpen?: boolean;
  bottomHeight?: number;
  detailWidth?: number;
}

export interface PanelLayout {
  detailOpen: boolean;
  setDetailOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bottomOpen: boolean;
  setBottomOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Persisted bottom-row height (pre-clamp to the visible area). */
  bottomHeight: number;
  /** Persisted detail-panel width. */
  detailWidth: number;
  /** Attach to the main grid container so the bottom-row cap can track
   *  the visible height. */
  mainAreaRef: React.RefObject<HTMLDivElement>;
  /** Inline grid-template for the outer (main | detail) columns. */
  outerLayout: { gridTemplateColumns: string };
  /** Inline grid-template for the main column's (viewer / bottom) rows. */
  mainLayout: { gridTemplateColumns: string; gridTemplateRows: string };
  onResizeDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDetailResizeDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDetailResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDetailResizeUp: (e: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * Owns the resizable panel layout: detail/bottom open state, their
 * persisted sizes, the measured main-area height, the derived CSS grid
 * templates, and the pointer-capture drag handlers for both resize
 * strips. Pure layout plumbing lifted out of App so the component reads
 * as composition.
 */
export function usePanelLayout(initial: PanelLayoutInitial = {}): PanelLayout {
  const [detailOpen, setDetailOpen] = useState(initial.detailOpen ?? true);
  const [bottomOpen, setBottomOpen] = useState(initial.bottomOpen ?? true);
  // Bottom-row height in pixels. Persisted so a share link reproduces
  // the original layout, and so a collapse → re-expand cycle restores
  // the user's last dragged size rather than the default.
  const [bottomHeight, setBottomHeight] = useState(
    initial.bottomHeight ?? BOTTOM_HEIGHT_DEFAULT,
  );
  const [detailWidth, setDetailWidth] = useState(
    initial.detailWidth ?? DETAIL_WIDTH_DEFAULT,
  );

  // Height available to the main viewer area after the header. The bottom
  // panel can be restored from a large URL/window value, but the rendered
  // row must never exceed this visible area; otherwise the t-SNE canvas
  // measures off-screen pixels and "reset view" recenters into clipped
  // space.
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const [mainAreaHeight, setMainAreaHeight] = useState(0);
  useEffect(() => {
    const el = mainAreaRef.current;
    if (!el) return;
    const setMeasuredHeight = (height: number) => {
      const next = Math.max(0, Math.floor(height));
      setMainAreaHeight((prev) => (prev === next ? prev : next));
    };
    setMeasuredHeight(el.getBoundingClientRect().height);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setMeasuredHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Outer 2-column grid: main content on the left, detail panel on the
  // right (full screen height) when open. minmax(0, 1fr) lets the main
  // column actually shrink below its content's intrinsic size — plain
  // `1fr` defaults to minmax(auto, 1fr) which pins the min to
  // min-content and breaks horizontal resize once the window goes
  // below the initial width.
  const outerLayout = useMemo(
    () => ({
      gridTemplateColumns: detailOpen
        ? `minmax(0, 1fr) ${detailWidth}px`
        : 'minmax(0, 1fr)',
    }),
    [detailOpen, detailWidth],
  );
  const liveBottomHeightMax = mainAreaHeight > 0
    ? Math.max(BOTTOM_HEIGHT_MIN, Math.min(BOTTOM_HEIGHT_MAX, mainAreaHeight))
    : BOTTOM_HEIGHT_MAX;
  const visibleBottomHeight = mainAreaHeight > 0
    ? Math.min(bottomHeight, mainAreaHeight)
    : bottomHeight;

  // Drag handler for the bottom-panel resize strip. Records the
  // pointerdown anchor and updates bottomHeight in real time via
  // setPointerCapture so the cursor can travel anywhere without
  // losing the gesture. The live upper bound also respects the current
  // app height so dragging cannot allocate an off-screen bottom row.
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  const onResizeDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, h: bottomHeight };
    e.preventDefault();
  }, [bottomHeight]);
  const onResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const next = Math.max(
      BOTTOM_HEIGHT_MIN,
      Math.min(liveBottomHeightMax, d.h - (e.clientY - d.y)),
    );
    setBottomHeight(next);
  }, [liveBottomHeightMax]);
  const onResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  // Detail-panel resize: same setPointerCapture pattern, X axis,
  // negated delta so dragging left grows the panel.
  const detailDragRef = useRef<{ x: number; w: number } | null>(null);
  const onDetailResizeDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    detailDragRef.current = { x: e.clientX, w: detailWidth };
    e.preventDefault();
  }, [detailWidth]);
  const onDetailResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = detailDragRef.current;
    if (!d) return;
    const next = Math.max(
      DETAIL_WIDTH_MIN,
      Math.min(DETAIL_WIDTH_MAX, d.w - (e.clientX - d.x)),
    );
    setDetailWidth(next);
  }, []);
  const onDetailResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    detailDragRef.current = null;
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  // Inside the main column, two rows: brain viewer + bottom bar
  // (filters + t-SNE). When the bottom bar is hidden the second row
  // collapses and the brain viewer reclaims the full height.
  const mainLayout = useMemo(
    () => ({
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: bottomOpen
        ? `minmax(0, 1fr) ${visibleBottomHeight}px`
        : 'minmax(0, 1fr)',
    }),
    [bottomOpen, visibleBottomHeight],
  );

  return {
    detailOpen,
    setDetailOpen,
    bottomOpen,
    setBottomOpen,
    bottomHeight,
    detailWidth,
    mainAreaRef,
    outerLayout,
    mainLayout,
    onResizeDown,
    onResizeMove,
    onResizeUp,
    onDetailResizeDown,
    onDetailResizeMove,
    onDetailResizeUp,
  };
}
