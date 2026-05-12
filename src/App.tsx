import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { FilterState, SelectionState, SettingsState } from './data/types';
import { DEFAULT_SETTINGS } from './data/types';
import { useNeuronData } from './hooks/useNeuronData';
import { useSelection } from './hooks/useSelection';
import { useUniqueFishIds } from './hooks/useUniqueFishIds';
import { BrainViewer } from './components/BrainViewer';
import { DetailPanel } from './components/DetailPanel';
import { FilterControls } from './components/FilterControls';
import { UmapPanel } from './components/UmapPanel';
import { ColorLegend } from './components/ColorLegend';
import { anyFilterActive, cellInSet } from './utils/coloring';
import {
  decodeHash,
  encodeHash,
  diffFilter,
  diffSettings,
  roundCamera,
  roundViewport,
  viewportIsDefault,
  roundLasso,
  sanitizeFilterAgainstDataset,
  sanitizeFocusedNeuron,
  type CameraState,
  type UmapViewport,
} from './utils/urlState';
import { cellsInPolygon } from './utils/polygon';
import janeliaLogoUrl from '../images/janelia_logo.png';

const INITIAL_FILTER: FilterState = {
  colorMode: 'region',
  geneScale: 'log',
  isolatedRegion: -1,
  isolatedFish: -1,
  txMode: 'gene',
  selectedGenes: [],
  geneLogic: 'or',
  selectedCluster: 0,
  clusterAll: true,
  selectedStimuli: [],
  stimLogic: 'or',
  activitySample: 0,
};

const DETAIL_PANEL_WIDTH = 360;

// Read the URL hash exactly once at module load. Subsequent updates go
// through history.replaceState so the in-app state is always the source
// of truth and the URL just mirrors it.
const INITIAL_URL_STATE =
  typeof window !== 'undefined' ? decodeHash(window.location.hash) : null;

export default function App() {
  const { data, error, progress } = useNeuronData();
  const uniqueFishIds = useUniqueFishIds(data);
  const [filter, setFilter] = useState<FilterState>(() => ({
    ...INITIAL_FILTER,
    ...(INITIAL_URL_STATE?.filter ?? {}),
  }));
  const [settings, setSettings] = useState<SettingsState>(() => ({
    ...DEFAULT_SETTINGS,
    ...(INITIAL_URL_STATE?.settings ?? {}),
  }));
  const { selection, setIndices, clear } = useSelection();
  // The detail panel floats over the right edge of the viewer and can be
  // hidden when not in use to give the brain viewer / t-SNE the full width.
  const [detailOpen, setDetailOpen] = useState(INITIAL_URL_STATE?.detail ?? true);
  const [bottomOpen, setBottomOpen] = useState(INITIAL_URL_STATE?.bottom ?? true);
  // Single-neuron focus is independent of the group selection so a
  // t-SNE drag can persist while the user clicks through individual
  // neurons. Click on a neuron → focus it (DetailPanel shows just that
  // cell). Click on empty space → unfocus (DetailPanel reverts to the
  // group). Clear button clears both.
  const [focusedNeuron, setFocusedNeuron] = useState<number | null>(
    INITIAL_URL_STATE?.focusedNeuron ?? null,
  );

  // Camera + t-SNE viewport are read continuously during interaction.
  // We keep them in refs (not React state) so they don't trigger
  // re-renders, and use a debounced URL writer that reads from these
  // refs alongside the React state.
  const cameraRef = useRef<CameraState | null>(INITIAL_URL_STATE?.camera ?? null);
  const umapRef = useRef<UmapViewport | null>(INITIAL_URL_STATE?.umap ?? null);

  // Lasso polygon (in t-SNE data coords) for the current selection.
  // Persisting the polygon — not the index list — keeps share URLs
  // tiny: a typical lasso is 30-150 vertices regardless of how many
  // cells fall inside.
  const [lassoPoly, setLassoPoly] = useState<Float32Array | null>(null);

  // Restore lasso selection from URL once data is loaded: re-run
  // point-in-polygon over the persisted vertices to derive indices.
  // Also sanitize URL-restored filter/settings/focusedNeuron against the
  // actual dataset arity — schema validation in decodeHash blocks
  // type-level garbage, but a URL generated against a different dataset
  // could still carry out-of-range gene/cluster/stim/cell indices that
  // would NaN typed-array reads downstream.
  const selectionRestoredRef = useRef(false);
  useEffect(() => {
    if (selectionRestoredRef.current) return;
    if (!data) return;
    setFilter((prev) => sanitizeFilterAgainstDataset(prev, data));
    setFocusedNeuron((prev) => sanitizeFocusedNeuron(prev, data));
    const lasso = INITIAL_URL_STATE?.lasso;
    if (lasso && lasso.length >= 6 && lasso.length % 2 === 0) {
      const poly = new Float32Array(lasso);
      const indices = cellsInPolygon(data.umap, data.count, poly);
      if (indices.length > 0) {
        setIndices(indices, 'umap');
        setLassoPoly(poly);
      }
    }
    selectionRestoredRef.current = true;
  }, [data, setIndices]);

  // Activity-playback in-progress flag. When true, the URL writer
  // skips writing so the looping activitySample doesn't pollute the
  // share URL or browser history. The final sample at the moment
  // playback stops is persisted via an explicit scheduleUrlWrite
  // triggered by setActivityPlaying(false).
  const isPlayingRef = useRef(false);

  // Debounced URL writer. Re-runs after every render so any state
  // change (including ref-driven camera/umap updates routed via
  // scheduleUrlWrite below) is captured. 50 ms is short enough that a
  // single click feels instant, long enough to coalesce camera-drag
  // bursts (the camera-controls 'change' fires 30-60×/sec while moving).
  const URL_DEBOUNCE_MS = 50;
  const urlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleUrlWrite = useCallback(() => {
    if (urlTimerRef.current) clearTimeout(urlTimerRef.current);
    urlTimerRef.current = setTimeout(() => {
      urlTimerRef.current = null;
      if (isPlayingRef.current) return;
      const filterDiff = diffFilter(filter, INITIAL_FILTER);
      const settingsDiff = diffSettings(settings, DEFAULT_SETTINGS);
      const cam = cameraRef.current ? roundCamera(cameraRef.current) : undefined;
      const umap = umapRef.current && !viewportIsDefault(umapRef.current)
        ? roundViewport(umapRef.current)
        : undefined;
      const lasso = lassoPoly ? roundLasso(lassoPoly) : undefined;
      const hash = encodeHash({
        filter: Object.keys(filterDiff).length > 0 ? filterDiff : undefined,
        settings: Object.keys(settingsDiff).length > 0 ? settingsDiff : undefined,
        focusedNeuron: focusedNeuron ?? undefined,
        detail: detailOpen ? undefined : false,
        bottom: bottomOpen ? undefined : false,
        camera: cam,
        umap,
        lasso,
      });
      const target = `${window.location.pathname}${window.location.search}${hash}`;
      window.history.replaceState(null, '', target);
    }, URL_DEBOUNCE_MS);
  }, [filter, settings, focusedNeuron, detailOpen, bottomOpen, lassoPoly]);
  // Schedule a URL write whenever React state changes.
  useEffect(() => {
    scheduleUrlWrite();
  }, [scheduleUrlWrite]);
  // Camera + t-SNE viewport changes go through refs; they call
  // scheduleUrlWrite directly so the URL still picks them up.
  const handleCameraChange = useCallback(
    (cam: CameraState) => {
      cameraRef.current = cam;
      scheduleUrlWrite();
    },
    [scheduleUrlWrite],
  );
  const handleUmapViewportChange = useCallback(
    (vp: UmapViewport) => {
      umapRef.current = vp;
      scheduleUrlWrite();
    },
    [scheduleUrlWrite],
  );
  const setActivityPlaying = useCallback(
    (playing: boolean) => {
      isPlayingRef.current = playing;
      if (!playing) scheduleUrlWrite();
    },
    [scheduleUrlWrite],
  );

  // The selection state is USER-EXPLICIT only (3D click → focused
  // neuron handled separately; t-SNE drag → setIndices(_, 'umap')).
  // We never write a filter-derived selection back into it, so the
  // user's gesture survives every filter change — order of operations
  // is commutative (anatomy → drag and drag → anatomy land in the
  // same state).
  //
  // For the DetailPanel we still want to display the filter
  // intersection when the user hasn't selected anything, so derive an
  // "effective" selection: user selection wins; otherwise fall back to
  // the filter intersection if any filter is active; otherwise empty.
  const effectiveSelection = useMemo<SelectionState>(() => {
    if (!data) return selection;
    if (selection.indices.length > 0) return selection;
    if (anyFilterActive(data, filter)) {
      const out: number[] = [];
      for (let i = 0; i < data.count; i++) {
        if (cellInSet(data, filter, settings, i)) out.push(i);
      }
      return { indices: new Uint32Array(out), source: 'filter' };
    }
    return selection;
  }, [data, selection, filter, settings]);

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
  // Resets filters only. The user's 3D-click focus (cleared by
  // clicking empty space in the 3D viewer) and t-SNE drag selection
  // (cleared via the "clear" button in the t-SNE panel header) are
  // independent and must survive a filter reset.
  const handleResetFilters = useCallback(() => {
    setFilter(INITIAL_FILTER);
  }, []);

  // Help-tab "reproduce a finding" buttons jump straight into a preset
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

  // Outer 2-column grid: main content on the left, detail panel on the
  // right (full screen height) when open. minmax(0, 1fr) lets the main
  // column actually shrink below its content's intrinsic size — plain
  // `1fr` defaults to minmax(auto, 1fr) which pins the min to
  // min-content and breaks horizontal resize once the window goes
  // below the initial width.
  const outerLayout = useMemo(
    () => ({
      gridTemplateColumns: detailOpen
        ? `minmax(0, 1fr) ${DETAIL_PANEL_WIDTH}px`
        : 'minmax(0, 1fr)',
    }),
    [detailOpen],
  );
  // Inside the main column, two rows: brain viewer + bottom bar
  // (filters + t-SNE). When the bottom bar is hidden the second row
  // collapses and the brain viewer reclaims the full height.
  const mainLayout = useMemo(
    () => ({
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: bottomOpen ? 'minmax(0, 1fr) 352px' : 'minmax(0, 1fr)',
    }),
    [bottomOpen],
  );

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

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col">
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-base tracking-wide text-neutral-100">WARP Atlas</h1>
          <p
            className="font-mono text-[11px] text-neutral-500"
            title="Cells from each fish are registered into shared mapzebrain atlas coordinates."
          >
            {data.count.toLocaleString()} cells pooled from {uniqueFishIds.length} fish{data.source === 'mock' ? ' (mock)' : ''}
          </p>
        </div>
        <a
          href="https://www.janelia.org"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Janelia Research Campus"
        >
          <img src={janeliaLogoUrl} alt="Janelia Research Campus" className="h-10 block" />
        </a>
      </header>
      <div className="flex-1 grid min-h-0" style={outerLayout}>
        {/* Main column: brain viewer on top, filters + t-SNE on bottom. */}
        <div className="grid min-h-0 min-w-0" style={mainLayout}>
          {/* Top: 3D viewer + legend + clear-selection button + the
              bottom-panel show/hide tab handle (sits flush at the
              bottom edge of the brain viewer area regardless of
              whether the bottom row is collapsed). */}
          <div className="relative min-h-0 min-w-0 row-start-1 col-start-1">
            <div className="absolute inset-0">
              <BrainViewer
                data={data}
                filter={filter}
                settings={settings}
                selection={selection}
                focusedNeuron={focusedNeuron}
                onFocus={setFocusedNeuron}
                initialCamera={INITIAL_URL_STATE?.camera ?? null}
                onCameraChange={handleCameraChange}
              />
              <ColorLegend
                data={data}
                filter={filter}
                settings={settings}
                uniqueFishIds={uniqueFishIds}
              />
            </div>
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
          </div>

          {/* Bottom split: filters + t-SNE. Renders only when open;
              when hidden, the gridTemplateRows drops the second row
              and the brain viewer reclaims the height. */}
          {bottomOpen && (
            <div
              className="row-start-2 col-start-1 grid min-h-0 min-w-0"
              style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}
            >
              <div className="flex flex-col bg-neutral-800 min-h-0 min-w-0 overflow-hidden">
                <FilterControls
                  data={data}
                  filter={filter}
                  setFilter={setFilter}
                  settings={settings}
                  setSettings={setSettings}
                  uniqueFishIds={uniqueFishIds}
                  onReset={handleResetFilters}
                  applyView={handleApplyView}
                  onActivityPlayingChange={setActivityPlaying}
                />
              </div>
              <UmapPanel
                data={data}
                filter={filter}
                settings={settings}
                selection={selection}
                focusedNeuron={focusedNeuron}
                onFocus={setFocusedNeuron}
                onSelect={handleUmapSelect}
                initialViewport={INITIAL_URL_STATE?.umap ?? null}
                onViewportChange={handleUmapViewportChange}
              />
            </div>
          )}
        </div>

        {/* Detail panel column — full-screen height. When closed the
            column collapses (gridTemplateColumns drops to '1fr') so the
            main column reclaims the width. */}
        {detailOpen && (
          <aside className="relative min-h-0 min-w-0 border-l border-neutral-800 bg-neutral-900">
            <DetailPanel data={data} filter={filter} selection={effectiveSelection} focusedNeuron={focusedNeuron} />
          </aside>
        )}
      </div>

      {/* Tab handle for the detail panel: when open it sits on the
          panel's left edge pointing right (click to close); when closed
          it sits on the viewport's right edge pointing left (click to
          open). Both are absolutely positioned against the outer
          container so they line up vertically regardless of where the
          panel boundary is. */}
      <button
        onClick={() => setDetailOpen((o) => !o)}
        title={detailOpen ? 'hide details' : 'show details'}
        aria-label={detailOpen ? 'hide details panel' : 'show details panel'}
        style={detailOpen ? { right: DETAIL_PANEL_WIDTH } : { right: 0 }}
        className="absolute top-1/2 -translate-y-1/2 z-30 bg-neutral-900/90 border border-r-0 border-neutral-700 text-neutral-200 py-3 px-1.5 rounded-l text-xs font-mono hover:bg-neutral-800"
      >
        {detailOpen ? '›' : '‹'}
      </button>
    </div>
  );
}
