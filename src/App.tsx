import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { FilterState, SelectionState } from './data/types';
import { useNeuronData } from './hooks/useNeuronData';
import { useSelection } from './hooks/useSelection';
import { BrainViewer } from './components/BrainViewer';
import { DetailPanel } from './components/DetailPanel';
import { FilterControls } from './components/FilterControls';
import { UmapPanel } from './components/UmapPanel';
import { ColorLegend } from './components/ColorLegend';
import { anyFilterActive, cellInSet } from './utils/coloring';

const INITIAL_FILTER: FilterState = {
  colorMode: 'region',
  geneScale: 'log',
  isolatedRegion: -1,
  txMode: 'gene',
  selectedGene: 0,
  geneAll: true,
  geneStrict: true,
  selectedCluster: 0,
  clusterAll: true,
  selectedStimulus: 0,
  stimulusAll: true,
};

const DETAIL_PANEL_WIDTH = 360;

export default function App() {
  const { data, error, progress } = useNeuronData();
  const [filter, setFilter] = useState<FilterState>(INITIAL_FILTER);
  const { selection, setIndices, clear } = useSelection();
  // The detail panel floats over the right edge of the viewer and can be
  // hidden when not in use to give the brain viewer / t-SNE the full width.
  const [detailOpen, setDetailOpen] = useState(true);
  // Single-neuron focus is independent of the group selection so a
  // t-SNE drag can persist while the user clicks through individual
  // neurons. Click on a neuron → focus it (DetailPanel shows just that
  // cell). Click on empty space → unfocus (DetailPanel reverts to the
  // group). Clear button clears both.
  const [focusedNeuron, setFocusedNeuron] = useState<number | null>(null);

  // Mirror selection.source into a ref so we can read it inside the
  // filter-derived selection effect WITHOUT making it a dep — adding it
  // as a dep caused the effect to re-fire whenever the user clicked a
  // neuron (source: cluster → 3d), which immediately reverted the
  // single-cell selection back to the whole cluster.
  const selectionSourceRef = useRef<SelectionState['source']>(null);
  useEffect(() => {
    selectionSourceRef.current = selection.source;
  }, [selection.source]);

  // When any non-color filter is constraining (anatomy / transcriptomics
  // / activity), reflect the intersection of every active predicate as
  // the active selection so the detail panel updates. Filter-derived
  // selections must NOT outlive the filters that produced them — when
  // every filter goes back to "all", drop the filter-derived selection
  // but leave 3D/t-SNE selections in place.
  useEffect(() => {
    if (!data) return;
    if (anyFilterActive(filter)) {
      const out: number[] = [];
      for (let i = 0; i < data.count; i++) {
        if (cellInSet(data, filter, i)) out.push(i);
      }
      setIndices(new Uint32Array(out), 'filter');
      return;
    }
    if (selectionSourceRef.current === 'filter') {
      clear();
    }
  }, [
    data,
    // colorMode and geneScale are pure visual choices and don't affect
    // cellInSet; listing every predicate-relevant field instead of the
    // whole filter avoids redundant setIndices() calls when the user
    // just changes the color scheme.
    filter.isolatedRegion,
    filter.txMode,
    filter.selectedGene,
    filter.geneAll,
    filter.selectedCluster,
    filter.clusterAll,
    filter.selectedStimulus,
    filter.stimulusAll,
    setIndices,
    clear,
  ]);

  const handleUmapSelect = useCallback(
    (indices: Uint32Array) => {
      if (indices.length === 0) clear();
      else setIndices(indices, 'umap');
    },
    [setIndices, clear],
  );
  const handleClearAll = useCallback(() => {
    clear();
    setFocusedNeuron(null);
  }, [clear]);
  // Resets filters only. The user's 3D-click focus and t-SNE drag
  // selection are independent and must survive a filter reset — there's
  // a separate "clear selection" button for those.
  const handleResetFilters = useCallback(() => {
    setFilter(INITIAL_FILTER);
  }, []);

  const layout = useMemo(
    () => ({
      // minmax(0, 1fr) lets the column actually shrink below its
      // content's intrinsic size; plain `1fr` defaults to
      // minmax(auto, 1fr) which pins the min to min-content and breaks
      // horizontal resize once the window goes below the initial width.
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: 'minmax(0, 1fr) 352px',
    }),
    [],
  );

  // When the detail panel is open it floats over the right edge of the
  // brain viewer; nudge any right-anchored UI (legend, clear button) inside
  // the brain viewer left so it isn't covered.
  const rightInset = detailOpen ? DETAIL_PANEL_WIDTH + 8 : 8;

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
    <div
      className="h-full w-full grid overflow-hidden"
      style={layout}
    >
      {/* Top: 3D viewer + legend + floating detail panel. The aside is
          anchored inside this container so it spans exactly the brain
          viewer row — leaving the t-SNE / filters bar fully usable. */}
      <div className="relative min-h-0 min-w-0 row-start-1 col-start-1">
        <div className="absolute inset-0">
          <BrainViewer
            data={data}
            filter={filter}
            selection={selection}
            focusedNeuron={focusedNeuron}
            onFocus={setFocusedNeuron}
          />
          <ColorLegend data={data} filter={filter} rightOffset={rightInset} />
          {(focusedNeuron != null ||
            (selection.source === 'umap' && selection.indices.length > 0)) && (
            <button
              onClick={handleClearAll}
              style={{ right: rightInset }}
              className="absolute bottom-2 text-[11px] font-mono bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-2 py-1 rounded hover:bg-neutral-800 transition-[right] duration-200"
            >
              clear selection
            </button>
          )}
        </div>

        {/* Floating detail panel — slides off-screen to the right when hidden. */}
        <aside
          aria-hidden={!detailOpen}
          style={{ width: DETAIL_PANEL_WIDTH }}
          className={
            'absolute top-0 right-0 bottom-0 z-20 shadow-2xl transition-transform duration-200 ease-in-out ' +
            (detailOpen ? 'translate-x-0' : 'translate-x-full')
          }
        >
          <button
            onClick={() => setDetailOpen(false)}
            title="hide details"
            aria-label="hide details panel"
            className="absolute top-1.5 right-2 z-10 w-6 h-6 flex items-center justify-center text-lg leading-none text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 rounded"
          >
            ×
          </button>
          <DetailPanel data={data} selection={selection} focusedNeuron={focusedNeuron} />
        </aside>

        {/* Tab to reopen the panel when it's hidden, vertically centered on
            the brain viewer row. */}
        {!detailOpen && (
          <button
            onClick={() => setDetailOpen(true)}
            title="show details"
            aria-label="show details panel"
            className="absolute top-1/2 -translate-y-1/2 right-0 z-30 bg-neutral-900/90 border border-r-0 border-neutral-700 text-neutral-200 py-3 px-1.5 rounded-l text-xs font-mono hover:bg-neutral-800"
          >
            ‹
          </button>
        )}
      </div>

      {/* Bottom split: filters + t-SNE */}
      <div
        className="row-start-2 col-start-1 grid min-h-0 min-w-0"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}
      >
        <div className="flex flex-col bg-neutral-800 min-h-0 min-w-0 overflow-y-auto">
          <FilterControls
            data={data}
            filter={filter}
            setFilter={setFilter}
            onReset={handleResetFilters}
          />
          <div className="p-3 text-[11px] font-mono text-neutral-400">
            <div className="mb-1 text-neutral-500">Tips</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>3D: drag to orbit, wheel to zoom, right-drag to pan</li>
              <li>3D: hover for ID, region, top genes; click to focus</li>
              <li>t-SNE: drag to box-select, links to 3D view</li>
              <li>t-SNE: right-drag or shift+drag to pan, wheel to zoom</li>
              <li>Subtype filter: pull a functional cluster as a group</li>
              <li>Co-coding: cells that both express a gene and track a stimulus</li>
            </ul>
          </div>
        </div>
        <UmapPanel
          data={data}
          filter={filter}
          selection={selection}
          onSelect={handleUmapSelect}
        />
      </div>
    </div>
  );
}
