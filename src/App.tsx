import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react';
import type { FilterState, SettingsState } from './data/types';
import { DEFAULT_SETTINGS } from './data/types';
import { useColoring } from './hooks/useColoring';
import { useNeuronData } from './hooks/useNeuronData';
import { useSanitizedDatasetState } from './hooks/useSanitizedDatasetState';
import { useEffectiveSelection } from './hooks/useEffectiveSelection';
import {
  usePanelLayout,
  BOTTOM_HEIGHT_DEFAULT,
  detailWidthDefaultFor,
  UMAP_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_DEFAULT,
} from './hooks/usePanelLayout';
import { useSelection } from './hooks/useSelection';
import { useUrlSync } from './hooks/useUrlSync';
import { useUniqueFishIds } from './hooks/useUniqueFishIds';
import { FilterControls, type Tab } from './components/FilterControls';
import { LinksMenu } from './components/LinksMenu';
import { ExportButton, ExportDialog } from './components/ExportButton';
import { ColorLegend } from './components/ColorLegend';
import { anyFilterActive, cellInSet } from './utils/coloring';
import {
  decodeHash,
  isEmbedRequested,
  sanitizeFilterAgainstDataset,
  sanitizeFocusedNeuron,
} from './utils/urlState';
import { cellsInPolygon } from './utils/polygon';
import janeliaLogoUrl from '../images/janelia_logo.png';

// Load visualization-heavy panels only after the dataset is available so
// the loading shell can paint without pulling Three/Recharts into the
// entry chunk.
const BrainViewer = lazy(() =>
  import('./components/BrainViewer').then((module) => ({ default: module.BrainViewer })),
);
const DetailPanel = lazy(() =>
  import('./components/DetailPanel').then((module) => ({ default: module.DetailPanel })),
);
const UmapPanel = lazy(() =>
  import('./components/UmapPanel').then((module) => ({ default: module.UmapPanel })),
);

function LoadingPane({ label }: { label: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-neutral-950 text-neutral-500 font-mono text-xs">
      {label}
    </div>
  );
}

const INITIAL_FILTER: FilterState = {
  colorMode: 'region',
  geneScale: 'log',
  showUnassignedRegion: true,
  regionPalette: 'nipy_spectral',
  anatomyAtlas: 'manuscript',
  isolatedRegion: -1,
  isolatedAtlasRegion: -1,
  isolatedFish: -1,
  txMode: 'all',
  selectedGenes: [],
  geneLogic: 'or',
  selectedCluster: 0,
  selectedStimuli: [],
  stimLogic: 'or',
  stimMode: 'off',
  activitySample: 0,
  swimMode: 'off',
};

// Read the URL hash exactly once at module load. Subsequent updates go
// through history.replaceState so the in-app state is always the source
// of truth and the URL just mirrors it.
const INITIAL_URL_STATE =
  typeof window !== 'undefined' ? decodeHash(window.location.hash) : null;

// Materialize the merged-with-defaults initial filter/settings at module
// load too, so the useState initializers and the lasso-restore effect
// (which re-applies the filter-aware predicate at mount time) share one
// source of truth. Effects can read these without pulling React state
// into their dep arrays.
const INITIAL_FILTER_STATE: FilterState = {
  ...INITIAL_FILTER,
  ...(INITIAL_URL_STATE?.filter ?? {}),
};
const EMBED_REQUESTED = isEmbedRequested(window.location.search);
const INITIAL_SETTINGS_STATE: SettingsState = {
  ...DEFAULT_SETTINGS,
  // Embedded DEFAULT (not an override): the whole-brain outline is the
  // anatomical context mapZebrain's own 3D view always shows, so an embedded
  // viewer that opens without it looks like a bare point cloud next to their
  // page. Spread BEFORE the hash so an explicit `brainOutline: false` in a
  // share URL still wins — unlike embeddedMode below, this setting IS
  // persisted.
  ...(EMBED_REQUESTED
    ? {
        brainOutline: true,
        // mapZebrain's own 3D view rotates freely with no damping, so the
        // embedded viewer matches it: object-centric rotation off (native
        // trackball pan and free orbit target) and no momentum coast.
        objectCentricRotation: false,
        rotationMomentum: 0,
        // mapZebrain's own view shows only the cells you asked for, so the
        // embedded viewer opens without the ghost haze. Also a default, not
        // an override — `showGhosts: true` in a share link still wins.
        showGhosts: false,
      }
    : {}),
  ...(INITIAL_URL_STATE?.settings ?? {}),
  // ?embed=1 wins: the hash never carries embeddedMode.
  ...(EMBED_REQUESTED ? { embeddedMode: true } : {}),
};

// Layout mode, fixed at module load. `?embed=1` is the only thing that sets it
// — there is deliberately no Settings toggle — so today this is equal to the
// live `settings.embeddedMode` for the whole session. Reading the module-load
// value anyway keeps that a property of this line rather than an assumption
// spread across the layout, palette, camera default, and preserveDrawingBuffer:
// if anything ever does make the mode mutable (a postMessage bridge is the
// obvious candidate), none of them should reshuffle under a live camera.
const EMBEDDED = INITIAL_SETTINGS_STATE.embeddedMode;

/** mapZebrain's own collapse affordance: a full-height 35px arrow button
 *  pinned to a viewport edge (assets/css/sideMenu.css:29-58). Used in
 *  embedded mode in place of the small tab handles that stick into the 3D
 *  view. */
function CollapseRail({
  side,
  open,
  onToggle,
  label,
  testId,
}: {
  side: 'left' | 'right';
  open: boolean;
  onToggle: () => void;
  label: string;
  testId: string;
}) {
  // Points the way the click will move the panel edge.
  const pointsLeft = side === 'left' ? open : !open;
  return (
    <button
      onClick={onToggle}
      title={`${open ? 'hide' : 'show'} ${label}`}
      aria-label={`${open ? 'hide' : 'show'} ${label}`}
      aria-expanded={open}
      data-testid={testId}
      className={
        'h-full w-full flex items-center justify-center ' +
        'bg-[#111] border border-black text-neutral-200 hover:bg-[#444] ' +
        (side === 'left' ? 'rounded-r-[3px]' : 'rounded-l-[3px]')
      }
    >
      <ArrowGlyph pointsLeft={pointsLeft} />
    </button>
  );
}

/** Approximates Bootstrap 3's `glyphicon glyphicon-arrow-left/right`, which is
 *  what mapZebrain's own side-menu buttons use (left-menu.component.html:313).
 *  Drawn rather than imported: pulling in the Glyphicons webfont for two
 *  arrows would cost a font request for a single pair of shapes. A solid
 *  arrow, not a chevron — `‹`/`›` read as much lighter weight than theirs. */
function ArrowGlyph({ pointsLeft }: { pointsLeft: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="26"
      height="26"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path
        d={
          pointsLeft
            ? 'M7.1 1.9 1 8l6.1 6.1v-3.9H15V5.8H7.1z'
            : 'M8.9 1.9 15 8l-6.1 6.1v-3.9H1V5.8h7.9z'
        }
      />
    </svg>
  );
}

/** A panel's drag-to-resize strip. Four of these differ only in position,
 *  axis, and which handler trio they drive — including the `onPointerCancel`
 *  wiring, which is easy to forget when copying the block. `className` and
 *  `orientation` stay per-call-site: the bottom strip is horizontal and the
 *  positioning classes are what pin each strip to its own panel edge. */
function ResizeStrip({
  label,
  className,
  orientation = 'vertical',
  onDown,
  onMove,
  onUp,
  onDoubleClick,
}: {
  label: string;
  className: string;
  orientation?: 'vertical' | 'horizontal';
  onDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · double-click to reset"
      className={className}
    />
  );
}

export default function App() {
  const { data, error, progress } = useNeuronData();
  const uniqueFishIds = useUniqueFishIds(data);
  const [filter, setFilter] = useState<FilterState>(INITIAL_FILTER_STATE);
  const [settings, setSettings] = useState<SettingsState>(INITIAL_SETTINGS_STATE);
  const { selection, setIndices, clear } = useSelection();
  // 3D canvas size — reported up from BrainViewer so the auto-mode
  // formulas in applyColoring (point size and ghost intensity) can
  // adapt to the actual canvas height. Width is tracked too for the
  // debug overlay but doesn't feed the formulas.
  const [brainCanvasSize, setBrainCanvasSize] = useState<{ w: number; h: number }>(
    { w: 1512, h: 478 },
  );
  // Activity playback state — lifted from ActivityTimeRow so a tab
  // switch (or any other unmount of that row) doesn't reset it. The
  // interval engine below runs in App for the same reason.
  const [activityPlaying, setActivityPlaying] = useState(false);
  const [activitySpeed, setActivitySpeed] = useState(
    INITIAL_URL_STATE?.activitySpeed ?? 10,
  );
  // Sidebar/bottom-panel active tab. Lifted out of FilterControls so the
  // 3D view's gear icon (embedded mode) can select the Settings tab.
  const [panelTab, setPanelTab] = useState<Tab>('filters');
  // Export dialog, opened by the orientation bar's export icon (embedded
  // mode). Standalone mode's header ExportButton keeps its own state.
  const [exportOpen, setExportOpen] = useState(false);
  // Single-neuron focus is independent of the group selection so a
  // t-SNE drag can persist while the user clicks through individual
  // neurons. Click on a neuron → focus it (DetailPanel shows just that
  // cell). Click on empty space → unfocus (DetailPanel reverts to the
  // group). The t-SNE clear-selection button drops the lasso only;
  // focus is cleared separately by clicking empty space.
  const [focusedNeuron, setFocusedNeuron] = useState<number | null>(
    INITIAL_URL_STATE?.focusedNeuron ?? null,
  );
  // Reconcile URL-derived filter / focus with the loaded dataset
  // synchronously: the raw state above is restored before `data` exists,
  // so it can carry indices that are out of range for the dataset that
  // actually loaded. Every read below uses the sanitized values so no
  // render feeds an out-of-range index into coloring, picking, or export.
  // The raw state is committed back once (see the restore effect) so the
  // editable filter and the URL converge on the clamped values.
  const { effectiveFilter, effectiveFocusedNeuron } = useSanitizedDatasetState(
    data,
    filter,
    focusedNeuron,
  );
  // Shared per-cell coloring (colors / alphas / sizes) — computed once
  // per filter/settings/selection/canvas-size change and passed to both
  // BrainViewer and UmapPanel so neither has to repeat the 274k-cell
  // applyColoring pass on every interaction.
  const coloring = useColoring(
    data,
    effectiveFilter,
    settings,
    selection,
    brainCanvasSize.h,
    activityPlaying &&
      effectiveFilter.colorMode === 'activity' &&
      settings.projectionMode === 'off',
  );
  // Resizable panel layout: detail/bottom open state, persisted sizes,
  // the measured main-area height, the derived CSS grid templates, and
  // the pointer-capture resize handlers all live in usePanelLayout.
  const {
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
    // The sidebar names below only have a consumer in embedded mode, and
    // `embedded` only makes sense once the rails/sidebar JSX exists: the
    // flag flips the outer grid to five tracks, so it must land together
    // with the five children CSS auto-placement seats into them.
    sidebarOpen,
    setSidebarOpen,
    sidebarWidth,
    onSidebarResizeDown,
    onSidebarResizeMove,
    onSidebarResizeUp,
    onSidebarResizeDoubleClick,
  } = usePanelLayout(
    {
      detailOpen: INITIAL_URL_STATE?.detail,
      bottomOpen: INITIAL_URL_STATE?.bottom,
      bottomHeight: INITIAL_URL_STATE?.bottomHeight,
      detailWidth: INITIAL_URL_STATE?.detailWidth,
      umapWidth: INITIAL_URL_STATE?.umapWidth,
      sidebarOpen: INITIAL_URL_STATE?.sidebarOpen,
      sidebarWidth: INITIAL_URL_STATE?.sidebarWidth,
    },
    EMBEDDED,
    // Screenshot mode drops the rails, so the grid must drop their tracks.
    settings.screenshotMode,
  );

  // Lasso polygon (in t-SNE data coords) for the current selection.
  // Persisting the polygon — not the index list — keeps share URLs
  // tiny: a typical lasso is 30-150 vertices regardless of how many
  // cells fall inside.
  const [lassoPoly, setLassoPoly] = useState<Float32Array | null>(null);

  // Restore lasso selection from URL once data is loaded: re-run
  // point-in-polygon over the persisted vertices to derive indices.
  // Reads of filter/focusedNeuron are already clamped synchronously by
  // useSanitizedDatasetState above; the setFilter/setFocusedNeuron calls
  // here only commit that clamp back into the editable React state so the
  // filter cards and the URL writer converge on the in-range values and
  // never spread a stale out-of-range index forward.
  const selectionRestoredRef = useRef(false);
  useEffect(() => {
    if (selectionRestoredRef.current) return;
    if (!data) return;
    setFilter((prev) => sanitizeFilterAgainstDataset(prev, data));
    setFocusedNeuron((prev) => sanitizeFocusedNeuron(prev, data));
    const lasso = INITIAL_URL_STATE?.lasso;
    if (lasso && lasso.length >= 6 && lasso.length % 2 === 0) {
      const poly = new Float32Array(lasso);
      let indices = cellsInPolygon(data.umap, data.count, poly);
      // Match the live lasso semantics: when a filter is active, the
      // selection excludes out-of-filter (dim) cells inside the
      // polygon. We read INITIAL_FILTER_STATE / INITIAL_SETTINGS_STATE
      // directly (instead of the React `filter`/`settings`) so this
      // restore is unambiguously a one-shot mount-time computation —
      // future filter changes can't reach back in and re-fire it.
      const sanitized = sanitizeFilterAgainstDataset(INITIAL_FILTER_STATE, data);
      if (anyFilterActive(data, sanitized)) {
        const kept: number[] = [];
        for (let k = 0; k < indices.length; k++) {
          if (cellInSet(data, sanitized, INITIAL_SETTINGS_STATE, indices[k])) kept.push(indices[k]);
        }
        indices = new Uint32Array(kept);
      }
      if (indices.length > 0) {
        setIndices(indices, 'umap');
        setLassoPoly(poly);
      }
    }
    selectionRestoredRef.current = true;
  }, [data, setIndices]);

  // Stop playback when the Color scheme leaves Activity — there's
  // nothing on screen driven by activitySample outside that mode, so
  // running an interval would just churn React state for no payoff.
  useEffect(() => {
    if (filter.colorMode !== 'activity' && activityPlaying) {
      setActivityPlaying(false);
    }
  }, [filter.colorMode, activityPlaying]);

  // Mirror all persisted view state into the URL hash and route camera /
  // t-SNE viewport changes (which live in refs) into the same debounced
  // writer. All the timer/snapshot-ref machinery lives in useUrlSync.
  const { handleCameraChange, handleUmapViewportChange, umapViewportRef } = useUrlSync(
    {
      filter: effectiveFilter,
      settings,
      focusedNeuron: effectiveFocusedNeuron,
      detailOpen,
      bottomOpen,
      bottomHeight,
      detailWidth,
      umapWidth,
      sidebarOpen,
      sidebarWidth,
      lassoPoly,
      activitySpeed,
      activityPlaying,
    },
    {
      defaultFilter: INITIAL_FILTER,
      bottomHeightDefault: BOTTOM_HEIGHT_DEFAULT,
      // Mode-aware so an embedded session at its own 413 default keeps the key
      // out of the hash, and so dragging to the standalone 360 there IS
      // recorded — the writer's notion of "default" has to match the hook's.
      detailWidthDefault: detailWidthDefaultFor(EMBEDDED),
      umapWidthDefault: UMAP_WIDTH_DEFAULT,
      sidebarWidthDefault: SIDEBAR_WIDTH_DEFAULT,
      initialCamera: INITIAL_URL_STATE?.camera ?? null,
      initialUmap: INITIAL_URL_STATE?.umap ?? null,
    },
  );

  // Sample-advance interval. Sits in App (not in ActivityTimeRow) so
  // visible playback survives the row unmounting on tab switches or
  // anywhere else its parents drop it.
  useEffect(() => {
    if (!activityPlaying || !data) return;
    const maxSample = Math.max(0, data.traceLength - 1);
    // Real-time playback would step one sample every 1/sampleRateHz s.
    // At high multipliers that drops below what setInterval can cleanly
    // deliver, so cap the tick at ~60 fps and advance several samples
    // per tick instead.
    const idealMs = 1000 / Math.max(0.1, data.traceSampleRateHz * activitySpeed);
    const MIN_TICK_MS = 16;
    const tickMs = idealMs >= MIN_TICK_MS ? idealMs : MIN_TICK_MS;
    const samplesPerTick =
      idealMs >= MIN_TICK_MS ? 1 : Math.max(1, Math.round(MIN_TICK_MS / idealMs));
    const wrap = maxSample + 1;
    const id = setInterval(() => {
      setFilter((prev) => ({
        ...prev,
        activitySample: (prev.activitySample + samplesPerTick) % wrap,
      }));
    }, tickMs);
    return () => clearInterval(id);
  }, [activityPlaying, activitySpeed, data]);

  // The selection state is USER-EXPLICIT only (3D click → focused
  // neuron handled separately; t-SNE drag → setIndices(_, 'umap')).
  // We never write a filter-derived selection back into it, so the
  // user's gesture survives every filter change — order of operations
  // is commutative (anatomy → drag and drag → anatomy land in the
  // same state). useEffectiveSelection then layers the filter-derived
  // fallback on top for the Detail panel / export.
  const { effectiveSelection, visibleCount } = useEffectiveSelection(
    data,
    selection,
    coloring,
  );

  const handleUmapSelect = useCallback(
    (indices: Uint32Array, polygon: Float32Array | null) => {
      if (indices.length === 0) {
        clear();
        setLassoPoly(null);
      } else {
        setIndices(indices, 'umap');
        setLassoPoly(polygon);
      }
    },
    [setIndices, clear],
  );
  const handleClearSelection = useCallback(() => {
    clear();
    setLassoPoly(null);
  }, [clear]);
  // Resets filters only. The user's 3D-click focus (cleared by
  // clicking empty space in the 3D viewer) and t-SNE drag selection
  // (cleared via the "clear" button in the t-SNE panel header) are
  // independent and must survive a filter reset.
  const handleResetFilters = useCallback(() => {
    setFilter(INITIAL_FILTER);
  }, []);

  // About-tab "reproduce a finding" buttons jump straight into a preset
  // view: replace the filter (no merge — leftover state from prior
  // exploration would muddy the reproduction), and clear the
  // user-explicit selections so the preset's filter-derived intersection
  // is what's shown rather than an unrelated lasso/focus from before.
  const handleApplyView = useCallback((preset: Partial<FilterState>) => {
    setFilter({ ...INITIAL_FILTER, ...preset });
    setFocusedNeuron(null);
    setLassoPoly(null);
    clear();
  }, [clear]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 font-mono text-sm">
        Error loading data: {error}
      </div>
    );
  }
  if (!data) {
    const fmtMB = (b: number) => (b / 1024 / 1024).toFixed(1);
    const pct = progress ? Math.round(progress.fraction * 100) : 0;
    const knownTotal = progress && progress.totalBytes > 0;
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-neutral-300 font-mono text-sm">
        <div>Loading WARP atlas…</div>
        <div className="w-72 h-1.5 bg-neutral-800 rounded overflow-hidden border border-neutral-700">
          <div
            className="h-full bg-neutral-200 transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-[11px] text-neutral-500">
          {progress
            ? knownTotal
              ? `${pct}% · ${fmtMB(progress.receivedBytes)} / ${fmtMB(progress.totalBytes)} MB`
              : `${fmtMB(progress.receivedBytes)} MB received`
            : 'starting…'}
        </div>
      </div>
    );
  }

  // Hoisted so the standalone and embedded branches below compose the same
  // elements instead of duplicating them. Only one branch renders, so each
  // is created once.
  const viewer = (
    <>
      <Suspense fallback={<LoadingPane label="Loading 3D viewer…" />}>
        <BrainViewer
          data={data}
          filter={effectiveFilter}
          settings={settings}
          coloring={coloring}
          selection={selection}
          focusedNeuron={effectiveFocusedNeuron}
          onFocus={setFocusedNeuron}
          onCanvasSizeChange={setBrainCanvasSize}
          initialCamera={INITIAL_URL_STATE?.camera ?? null}
          onCameraChange={handleCameraChange}
          onProjectionModeChange={(mode) =>
            setSettings((s) => ({ ...s, projectionMode: mode }))
          }
          onOpenExport={() => setExportOpen(true)}
          onOpenSettings={() => {
            // Both, even though only the sidebar can host the tabs today.
            // The gear is gated on the LIVE settings.embeddedMode (see
            // BrainViewer) while the layout is gated on the module-load
            // EMBEDDED, and those are only equal because ?embed=1 is the sole
            // way in. If anything ever makes the mode mutable, the bar would
            // appear over the standalone layout, where the tabs live in the
            // bottom panel — opening one and not the other leaves the gear
            // dead there. Opening a panel that does not exist is a no-op.
            setSidebarOpen(true);
            setBottomOpen(true);
            setPanelTab('settings');
          }}
        />
      </Suspense>
      <ColorLegend
        data={data}
        filter={effectiveFilter}
        settings={settings}
        uniqueFishIds={uniqueFishIds}
      />
      {/* Opened by the orientation bar's export icon (embedded mode only).
          The dialog lives here rather than in the bar because the scope it
          exports is App's effective selection. */}
      {exportOpen && (
        <ExportDialog
          data={data}
          effectiveSelection={effectiveSelection}
          focusedNeuron={effectiveFocusedNeuron}
          onClose={() => setExportOpen(false)}
        />
      )}
    </>
  );

  const tsnePanel = (
    <Suspense fallback={<LoadingPane label="Loading t-SNE panel…" />}>
      <UmapPanel
        data={data}
        filter={effectiveFilter}
        settings={settings}
        selection={selection}
        coloring={coloring}
        pauseForActivityPlayback={
          activityPlaying && effectiveFilter.colorMode === 'activity'
        }
        focusedNeuron={effectiveFocusedNeuron}
        onFocus={setFocusedNeuron}
        onSelect={handleUmapSelect}
        // Reseed from the live viewport, not the module-load URL value: the
        // embedded t-SNE tab unmounts this panel on every tab switch, and
        // INITIAL_URL_STATE is frozen at page load.
        initialViewport={umapViewportRef.current ?? INITIAL_URL_STATE?.umap ?? null}
        onViewportChange={handleUmapViewportChange}
      />
    </Suspense>
  );

  const filterPanel = (
    <FilterControls
      data={data}
      filter={effectiveFilter}
      setFilter={setFilter}
      settings={settings}
      setSettings={setSettings}
      uniqueFishIds={uniqueFishIds}
      onReset={handleResetFilters}
      visibleCount={visibleCount}
      applyView={handleApplyView}
      activityPlaying={activityPlaying}
      setActivityPlaying={setActivityPlaying}
      activitySpeed={activitySpeed}
      setActivitySpeed={setActivitySpeed}
      selection={selection}
      onClearSelection={handleClearSelection}
      tab={panelTab}
      onTabChange={setPanelTab}
      tsneTab={EMBEDDED ? tsnePanel : undefined}
    />
  );

  const janeliaLogo = (
    <a
      href="https://www.janelia.org"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Janelia Research Campus"
    >
      <img src={janeliaLogoUrl} alt="Janelia Research Campus" className="h-10 block" />
    </a>
  );

  const cellCountLine = (
    <p
      className="font-mono text-[11px] text-neutral-500"
      title="Cells from each fish are registered into shared mapZebrain atlas coordinates."
    >
      {data.count.toLocaleString()} cells pooled from {uniqueFishIds.length} fish{data.source === 'mock' ? ' (mock)' : ''}
    </p>
  );

  // Embedded mode has no page header — mapZebrain's own nav sits above the
  // iframe. The header's contents move to a compact strip at the top of the
  // sidebar, mirroring mapZebrain's own "All items" heading, and the Janelia
  // logo becomes a corner overlay on the 3D view.
  const sidebarHeader = (
    <div data-testid="sidebar-header" className="flex-shrink-0 px-3 pt-2 pb-1.5">
      <h1 className="text-sm font-semibold text-neutral-100 leading-tight">
        WARP Atlas Viewer
      </h1>
      {cellCountLine}
      {!settings.screenshotMode && (
        <div className="flex items-center gap-3 mt-1.5">
          {/* No Export here: embedded mode exports from the orientation bar's
              icon instead, next to the screenshot and gear icons.
              Left-anchored: the menu sits near the left edge of a ~360px
              sidebar, so the header's default right-anchoring would run it out
              of the sidebar and under the collapse rail. */}
          <LinksMenu align="left" />
        </div>
      )}
    </div>
  );

  const detailAside = detailOpen && (
    <aside className="relative min-h-0 min-w-0 border-l border-neutral-800 bg-neutral-900">
      <ResizeStrip
        label="Resize detail panel"
        onDown={onDetailResizeDown}
        onMove={onDetailResizeMove}
        onUp={onDetailResizeUp}
        onDoubleClick={onDetailResizeDoubleClick}
        className="absolute top-0 bottom-0 left-0 w-1.5 z-20 cursor-col-resize bg-transparent hover:bg-yellow-300/30 transition-colors"
      />
      <Suspense fallback={<LoadingPane label="Loading details…" />}>
        <DetailPanel
          data={data}
          filter={effectiveFilter}
          settings={settings}
          selection={effectiveSelection}
          focusedNeuron={effectiveFocusedNeuron}
        />
      </Suspense>
    </aside>
  );

  return (
    <div
      className={
        'relative h-full w-full overflow-hidden flex flex-col' +
        (EMBEDDED ? ' embedded' : '')
      }
    >
      {!EMBEDDED && (
        <header className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-semibold text-neutral-100">WARP Atlas Viewer</h1>
            {cellCountLine}
          </div>
          <div className="flex items-center gap-4">
            {!settings.screenshotMode && (
              <>
                <ExportButton
                  data={data}
                  effectiveSelection={effectiveSelection}
                  focusedNeuron={effectiveFocusedNeuron}
                />
                <LinksMenu />
              </>
            )}
            {janeliaLogo}
          </div>
        </header>
      )}
      {EMBEDDED ? (
        <div ref={mainAreaRef} className="flex-1 grid min-h-0" style={outerLayout}>
          {/* The rails are grid items occupying the first and last tracks.
              Children are auto-placed, so child count must match track
              count — screenshot mode therefore drops the rail TRACKS too
              (outerGridTemplate takes screenshotMode) rather than filling
              them with placeholder divs, which had no background and
              painted two 35px neutral-900 gutters into the one mode meant
              for a clean capture. */}
          {!settings.screenshotMode && (
            <CollapseRail
              side="left"
              open={sidebarOpen}
              onToggle={() => setSidebarOpen((o) => !o)}
              label="filters sidebar"
              testId="rail-sidebar"
            />
          )}
          {sidebarOpen && (
            <div
              data-testid="embedded-sidebar"
              className="relative flex flex-col min-h-0 min-w-0 overflow-hidden bg-panel"
            >
              {sidebarHeader}
              <div className="flex-1 min-h-0">{filterPanel}</div>
              <ResizeStrip
                label="Resize filters sidebar"
                onDown={onSidebarResizeDown}
                onMove={onSidebarResizeMove}
                onUp={onSidebarResizeUp}
                onDoubleClick={onSidebarResizeDoubleClick}
                className="absolute top-0 bottom-0 right-0 w-1.5 z-20 cursor-col-resize bg-transparent hover:bg-yellow-300/30 transition-colors"
              />
            </div>
          )}
          <div className="relative min-h-0 min-w-0">
            {viewer}
            {!settings.screenshotMode && (
              <div className="absolute bottom-2 right-2 z-10">{janeliaLogo}</div>
            )}
          </div>
          {detailAside}
          {!settings.screenshotMode && (
            <CollapseRail
              side="right"
              open={detailOpen}
              onToggle={() => setDetailOpen((o) => !o)}
              label="details panel"
              testId="rail-detail"
            />
          )}
        </div>
      ) : (
        <div ref={mainAreaRef} className="flex-1 grid min-h-0" style={outerLayout}>
          {/* Main column: brain viewer on top, filters + t-SNE on bottom. */}
          <div className="grid min-h-0 min-w-0" style={mainLayout}>
            {/* Top: 3D viewer + legend + clear-selection button + the
                bottom-panel show/hide tab handle (sits flush at the
                bottom edge of the brain viewer area regardless of
                whether the bottom row is collapsed). */}
            <div className="relative min-h-0 min-w-0 row-start-1 col-start-1">
              <div className="absolute inset-0">{viewer}</div>
              {bottomOpen && (
                <ResizeStrip
                  label="Resize bottom panel"
                  orientation="horizontal"
                  onDown={onResizeDown}
                  onMove={onResizeMove}
                  onUp={onResizeUp}
                  onDoubleClick={onResizeDoubleClick}
                  className="absolute bottom-0 left-0 right-0 h-1.5 z-20 cursor-row-resize bg-transparent hover:bg-yellow-300/30 transition-colors"
                />
              )}
              {!settings.screenshotMode && (
                <button
                  onClick={() => setBottomOpen((o) => !o)}
                  title={bottomOpen ? 'hide bottom panel' : 'show bottom panel'}
                  aria-label={bottomOpen ? 'hide bottom panel' : 'show bottom panel'}
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 bg-neutral-900/90 border border-b-0 border-neutral-700 text-neutral-200 w-[42px] py-0.5 rounded-t text-xs font-mono hover:bg-neutral-800 leading-none"
                >
                  <span
                    aria-hidden
                    className={
                      'inline-block ' +
                      (bottomOpen ? 'translate-y-[-3px]' : 'translate-y-[3px]')
                    }
                  >
                    {bottomOpen ? '⌄' : '⌃'}
                  </span>
                </button>
              )}
            </div>

            {/* Bottom split: filters + t-SNE. Renders only when open;
                when hidden, the gridTemplateRows drops the second row
                and the brain viewer reclaims the height. */}
            {bottomOpen && (
              <div
                className="row-start-2 col-start-1 grid min-h-0 min-w-0"
                style={{ gridTemplateColumns: `minmax(0, 1fr) min(${umapWidth}px, 100%)` }}
              >
                <div className="flex flex-col bg-panel min-h-0 min-w-0 overflow-hidden">
                  {filterPanel}
                </div>
                {/* t-SNE column, with a draggable strip on its left edge.
                    Matches the other resizers: transparent until hover,
                    then a faint yellow highlight. */}
                <div className="relative min-h-0 min-w-0">
                  <ResizeStrip
                    label="Resize t-SNE panel"
                    onDown={onUmapResizeDown}
                    onMove={onUmapResizeMove}
                    onUp={onUmapResizeUp}
                    onDoubleClick={onUmapResizeDoubleClick}
                    className="absolute top-0 bottom-0 left-0 w-1.5 z-20 cursor-col-resize bg-transparent hover:bg-yellow-300/30 transition-colors"
                  />
                  {tsnePanel}
                </div>
              </div>
            )}
          </div>

          {/* Detail panel column — full-screen height. When closed the
              column collapses (gridTemplateColumns drops to '1fr') so the
              main column reclaims the width. */}
          {detailAside}
        </div>
      )}

      {/* Tab handle for the detail panel: when open it sits on the
          panel's left edge pointing right (click to close); when closed
          it sits on the viewport's right edge pointing left (click to
          open). Both are absolutely positioned against the outer
          container so they line up vertically regardless of where the
          panel boundary is. Hidden in screenshot mode along with the
          other panel chrome. In embedded mode the right rail replaces it. */}
      {!EMBEDDED && !settings.screenshotMode && (
        <button
          onClick={() => setDetailOpen((o) => !o)}
          title={detailOpen ? 'hide details' : 'show details'}
          aria-label={detailOpen ? 'hide details panel' : 'show details panel'}
          style={detailOpen ? { right: detailWidth } : { right: 0 }}
          className="absolute top-1/2 -translate-y-1/2 z-30 bg-neutral-900/90 border border-r-0 border-neutral-700 text-neutral-200 py-3 px-1.5 rounded-l text-xs font-mono hover:bg-neutral-800"
        >
          {detailOpen ? '›' : '‹'}
        </button>
      )}
    </div>
  );
}
