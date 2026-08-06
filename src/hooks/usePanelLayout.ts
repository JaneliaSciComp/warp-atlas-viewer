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
/** Embedded mode opens the detail panel wider. Its charts and region lists sit
 *  next to a much narrower 3D view there, and 360 leaves them cramped. Within
 *  the same DETAIL_WIDTH_MIN/MAX drag bounds as the standalone default. */
export const EMBEDDED_DETAIL_WIDTH_DEFAULT = 413;
/** The default width for a mode. Used for the initial value, for
 *  double-click-to-reset, and by the URL writer to decide when the width is at
 *  its default and can be dropped from the hash — those three must agree, or a
 *  reset lands somewhere the hash then records as a deviation. */
export function detailWidthDefaultFor(embedded: boolean): number {
  return embedded ? EMBEDDED_DETAIL_WIDTH_DEFAULT : DETAIL_WIDTH_DEFAULT;
}
const DETAIL_WIDTH_MIN = 240;
const DETAIL_WIDTH_MAX = 800;
// Width of the t-SNE panel (bottom-right of the bottom row). The grid
// also clamps it to the row width at render time, so these static bounds
// only bracket the dragged value.
export const UMAP_WIDTH_DEFAULT = 320;
const UMAP_WIDTH_MIN = 200;
const UMAP_WIDTH_MAX = 760;

// Left sidebar (embedded mode only) — the bottom panel relocated to the side.
// 360 rather than mapZebrain's own 440 because embedded mode also shows the
// detail panel: at a 1280px iframe, 440 would leave only 410px for the 3D view.
// mapZebrain's width is one drag away for anyone who wants it.
export const SIDEBAR_WIDTH_DEFAULT = 360;
const SIDEBAR_WIDTH_MIN = 280;
const SIDEBAR_WIDTH_MAX = 700;
// Width of the edge collapse rails, matching mapZebrain's `.side-menu-btn`
// (assets/css/sideMenu.css:36).
export const RAIL_WIDTH = 35;

/**
 * Next sidebar width for a drag that began at `startWidth` and has moved `dx`
 * CSS pixels horizontally.
 *
 * The sign matters: the sidebar's resize strip is on its RIGHT edge, so
 * dragging right (positive dx) grows it. The detail panel's strip is on its
 * LEFT edge and therefore negates its delta — do not copy that here.
 */
export function nextSidebarWidth(startWidth: number, dx: number): number {
  return Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, startWidth + dx));
}

// Share of the post-rail width a single embedded panel track may take. Two
// panels at 0.4 leave 0.2 of it for the viewer, at ANY container width — the
// `- 28px` below is 0.4 of the 70px the two rails consume, so the percentage
// is really 40% of (container − rails). Without this cap the fixed tracks
// could out-total the container: the `minmax(0, 1fr)` viewer would resolve to
// 0px and the right rail — the detail panel's only toggle in embedded mode —
// would be pushed outside the root `overflow-hidden` and become unclickable.
// Reached at 500x700 with the *default* 360/360, not just hostile values.
const PANEL_TRACK_SHARE = 0.4;
function panelTrack(width: number): string {
  return `min(${width}px, calc(${PANEL_TRACK_SHARE * 100}% - ${PANEL_TRACK_SHARE * 2 * RAIL_WIDTH}px))`;
}

/**
 * Inline `grid-template-columns` for the outer app grid.
 *
 * Standalone is the original two-track layout, unchanged. Embedded is five
 * tracks — rail, sidebar, viewer, detail, rail — with a collapsed panel
 * dropping its track entirely (the element is not rendered either, so grid
 * auto-placement still lines up). The rails are always present so there is
 * always something to click, except in screenshot mode where they are not
 * rendered at all and so must not get tracks either (a track with no child
 * would shift every later child one column left; a dummy child to fill it
 * would paint a 35px gutter into the one mode meant for clean capture).
 */
export function outerGridTemplate({
  embedded,
  sidebarOpen,
  sidebarWidth,
  detailOpen,
  detailWidth,
  screenshotMode = false,
}: {
  embedded: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
  detailOpen: boolean;
  detailWidth: number;
  screenshotMode?: boolean;
}): string {
  if (!embedded) {
    return detailOpen ? `minmax(0, 1fr) ${detailWidth}px` : 'minmax(0, 1fr)';
  }
  const rails = !screenshotMode;
  const tracks = rails ? [`${RAIL_WIDTH}px`] : [];
  if (sidebarOpen) tracks.push(panelTrack(sidebarWidth));
  tracks.push('minmax(0, 1fr)');
  if (detailOpen) tracks.push(panelTrack(detailWidth));
  if (rails) tracks.push(`${RAIL_WIDTH}px`);
  return tracks.join(' ');
}

export interface PanelLayoutInitial {
  detailOpen?: boolean;
  bottomOpen?: boolean;
  bottomHeight?: number;
  detailWidth?: number;
  umapWidth?: number;
  sidebarOpen?: boolean;
  sidebarWidth?: number;
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
  /** Persisted t-SNE (bottom-right) panel width. */
  umapWidth: number;
  /** Attach to the main grid container so the bottom-row cap can track
   *  the visible height. */
  mainAreaRef: React.RefCallback<HTMLDivElement>;
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
  onUmapResizeDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onUmapResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onUmapResizeUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Double-click a resize handle to snap that panel back to its default
   *  size. */
  onResizeDoubleClick: () => void;
  onDetailResizeDoubleClick: () => void;
  onUmapResizeDoubleClick: () => void;
  /** Left-sidebar open state (embedded mode only). */
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Persisted left-sidebar width (embedded mode only). */
  sidebarWidth: number;
  onSidebarResizeDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSidebarResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSidebarResizeUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSidebarResizeDoubleClick: () => void;
}

/**
 * Owns the resizable panel layout: detail/bottom open state, their
 * persisted sizes, the measured main-area height, the derived CSS grid
 * templates, and the pointer-capture drag handlers for both resize
 * strips. Pure layout plumbing lifted out of App so the component reads
 * as composition.
 */
export function usePanelLayout(
  initial: PanelLayoutInitial = {},
  embedded = false,
  // Live, unlike `embedded`: screenshot mode drops the rails (and their
  // tracks) mid-session, and the grid has to follow on the same render.
  screenshotMode = false,
): PanelLayout {
  const [detailOpen, setDetailOpen] = useState(initial.detailOpen ?? true);
  const [bottomOpen, setBottomOpen] = useState(initial.bottomOpen ?? true);
  // Bottom-row height in pixels. Persisted so a share link reproduces
  // the original layout, and so a collapse → re-expand cycle restores
  // the user's last dragged size rather than the default.
  const [bottomHeight, setBottomHeight] = useState(
    initial.bottomHeight ?? BOTTOM_HEIGHT_DEFAULT,
  );
  const detailDefault = detailWidthDefaultFor(embedded);
  const [detailWidth, setDetailWidth] = useState(
    initial.detailWidth ?? detailDefault,
  );
  const [umapWidth, setUmapWidth] = useState(
    initial.umapWidth ?? UMAP_WIDTH_DEFAULT,
  );
  const [sidebarOpen, setSidebarOpen] = useState(initial.sidebarOpen ?? true);
  const [sidebarWidth, setSidebarWidth] = useState(
    initial.sidebarWidth ?? SIDEBAR_WIDTH_DEFAULT,
  );

  // Height available to the main viewer area after the header. The bottom
  // panel can be restored from a large URL/window value, but the rendered
  // row must never exceed this visible area; otherwise the t-SNE canvas
  // measures off-screen pixels and "reset view" recenters into clipped
  // space.
  const [mainAreaEl, setMainAreaEl] = useState<HTMLDivElement | null>(null);
  // Callback ref instead of a RefObject + [] effect: App renders the
  // loading shell before the main grid exists, so a one-shot effect can
  // see `null` and never observe the element that mounts after data load.
  const mainAreaRef = useCallback((node: HTMLDivElement | null) => {
    setMainAreaEl((prev) => (prev === node ? prev : node));
  }, []);
  const [mainAreaHeight, setMainAreaHeight] = useState(0);
  useEffect(() => {
    if (!mainAreaEl) return;
    const setMeasuredHeight = (height: number) => {
      const next = Math.max(0, Math.floor(height));
      setMainAreaHeight((prev) => (prev === next ? prev : next));
    };
    setMeasuredHeight(mainAreaEl.getBoundingClientRect().height);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setMeasuredHeight(entry.contentRect.height);
    });
    ro.observe(mainAreaEl);
    return () => ro.disconnect();
  }, [mainAreaEl]);

  // Outer 2-column grid: main content on the left, detail panel on the
  // right (full screen height) when open. minmax(0, 1fr) lets the main
  // column actually shrink below its content's intrinsic size — plain
  // `1fr` defaults to minmax(auto, 1fr) which pins the min to
  // min-content and breaks horizontal resize once the window goes
  // below the initial width.
  const outerLayout = useMemo(
    () => ({
      gridTemplateColumns: outerGridTemplate({
        embedded,
        sidebarOpen,
        sidebarWidth,
        detailOpen,
        detailWidth,
        screenshotMode,
      }),
    }),
    [embedded, sidebarOpen, sidebarWidth, detailOpen, detailWidth, screenshotMode],
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

  // t-SNE panel resize: a strip on the panel's LEFT edge. Same
  // setPointerCapture pattern and negated delta as the detail panel —
  // dragging left grows the t-SNE (and shrinks the filter column beside
  // it).
  const umapDragRef = useRef<{ x: number; w: number } | null>(null);
  const onUmapResizeDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    umapDragRef.current = { x: e.clientX, w: umapWidth };
    e.preventDefault();
  }, [umapWidth]);
  const onUmapResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = umapDragRef.current;
    if (!d) return;
    const next = Math.max(
      UMAP_WIDTH_MIN,
      Math.min(UMAP_WIDTH_MAX, d.w - (e.clientX - d.x)),
    );
    setUmapWidth(next);
  }, []);
  const onUmapResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    umapDragRef.current = null;
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  // Sidebar resize: a strip on the sidebar's RIGHT edge. Same
  // setPointerCapture pattern as the other two, but the delta is NOT
  // negated — dragging right grows the sidebar. See nextSidebarWidth.
  const sidebarDragRef = useRef<{ x: number; w: number } | null>(null);
  const onSidebarResizeDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    sidebarDragRef.current = { x: e.clientX, w: sidebarWidth };
    e.preventDefault();
  }, [sidebarWidth]);
  const onSidebarResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = sidebarDragRef.current;
    if (!d) return;
    setSidebarWidth(nextSidebarWidth(d.w, e.clientX - d.x));
  }, []);
  const onSidebarResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    sidebarDragRef.current = null;
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  // Double-click any handle to snap that panel back to its default size.
  // A click carries no pointer movement, so the drag handlers leave the
  // size untouched and only this fires.
  const onResizeDoubleClick = useCallback(() => setBottomHeight(BOTTOM_HEIGHT_DEFAULT), []);
  const onDetailResizeDoubleClick = useCallback(
    () => setDetailWidth(detailDefault),
    [detailDefault],
  );
  const onUmapResizeDoubleClick = useCallback(() => setUmapWidth(UMAP_WIDTH_DEFAULT), []);
  const onSidebarResizeDoubleClick = useCallback(
    () => setSidebarWidth(SIDEBAR_WIDTH_DEFAULT),
    [],
  );

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
    umapWidth,
    mainAreaRef,
    outerLayout,
    mainLayout,
    onResizeDown,
    onResizeMove,
    onResizeUp,
    onDetailResizeDown,
    onDetailResizeMove,
    onDetailResizeUp,
    onUmapResizeDown,
    onUmapResizeMove,
    onUmapResizeUp,
    onResizeDoubleClick,
    onDetailResizeDoubleClick,
    onUmapResizeDoubleClick,
    sidebarOpen,
    setSidebarOpen,
    sidebarWidth,
    onSidebarResizeDown,
    onSidebarResizeMove,
    onSidebarResizeUp,
    onSidebarResizeDoubleClick,
  };
}
