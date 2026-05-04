import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { FilterState, SelectionState } from './data/types';
import { useNeuronData } from './hooks/useNeuronData';
import { useSelection } from './hooks/useSelection';
import { BrainViewer } from './components/BrainViewer';
import { DetailPanel } from './components/DetailPanel';
import { FilterControls } from './components/FilterControls';
import { UmapPanel } from './components/UmapPanel';
import { ColorLegend } from './components/ColorLegend';

const INITIAL_FILTER: FilterState = {
  colorMode: 'region',
  selectedGene: 0,
  selectedStimulus: 0,
  selectedCluster: -1,
  isolatedRegion: -1,
};

export default function App() {
  const { data, error } = useNeuronData();
  const [filter, setFilter] = useState<FilterState>(INITIAL_FILTER);
  const { selection, setIndices, clear } = useSelection();
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

  // When the filter picks an actionable handle (cluster or region),
  // reflect it as the active selection so the detail panel updates.
  // Filter-derived selections must NOT outlive the filter that produced them
  // (e.g. a cluster pick should not still be highlighting cells once the
  // user has switched to Co-coding mode). User-explicit selections (3D
  // click, t-SNE box-drag) are preserved across filter changes.
  useEffect(() => {
    if (!data) return;
    if (filter.colorMode === 'cluster' && filter.selectedCluster >= 0) {
      const out: number[] = [];
      for (let i = 0; i < data.count; i++) {
        if (data.clusterIds[i] === filter.selectedCluster) out.push(i);
      }
      setIndices(new Uint32Array(out), 'cluster');
      return;
    }
    if (filter.isolatedRegion >= 0) {
      const out: number[] = [];
      for (let i = 0; i < data.count; i++) {
        if (data.regionIds[i] === filter.isolatedRegion) out.push(i);
      }
      setIndices(new Uint32Array(out), 'region');
      return;
    }
    // No filter-derived handle is active. Clear any stale filter-derived
    // selection (cluster/region) but leave 3D/t-SNE selections in place.
    const src = selectionSourceRef.current;
    if (src === 'cluster' || src === 'region') {
      clear();
    }
  }, [
    data,
    filter.colorMode,
    filter.selectedCluster,
    filter.isolatedRegion,
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

  const layout = useMemo(
    () => ({
      // minmax(0, 1fr) lets the column actually shrink below its
      // content's intrinsic size; plain `1fr` defaults to
      // minmax(auto, 1fr) which pins the min to min-content and breaks
      // horizontal resize once the window goes below the initial width.
      gridTemplateColumns: 'minmax(0, 1fr) 360px',
      gridTemplateRows: 'minmax(0, 1fr) 280px',
    }),
    [],
  );

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 font-mono text-sm">
        Error loading data: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-400 font-mono text-sm">
        Loading WARP atlas…
      </div>
    );
  }

  return (
    <div
      className="h-full w-full grid overflow-hidden"
      style={layout}
    >
      {/* Top-left: 3D viewer + filter controls + legend */}
      <div className="relative flex flex-col min-h-0 min-w-0 row-start-1 col-start-1">
        <div className="relative flex-1 min-h-0 min-w-0">
          <BrainViewer
            data={data}
            filter={filter}
            selection={selection}
            focusedNeuron={focusedNeuron}
            onFocus={setFocusedNeuron}
          />
          <ColorLegend data={data} filter={filter} />
          {(focusedNeuron != null ||
            (selection.source === 'umap' && selection.indices.length > 0)) && (
            <button
              onClick={handleClearAll}
              className="absolute bottom-2 right-2 text-[11px] font-mono bg-neutral-900/85 border border-neutral-700 text-neutral-200 px-2 py-1 rounded hover:bg-neutral-800"
            >
              clear selection
            </button>
          )}
        </div>
      </div>

      {/* Right column: detail panel spans both rows */}
      <div className="row-start-1 row-span-2 col-start-2 min-h-0 min-w-0">
        <DetailPanel data={data} selection={selection} focusedNeuron={focusedNeuron} />
      </div>

      {/* Bottom-left split: filters + UMAP */}
      <div
        className="row-start-2 col-start-1 grid min-h-0 min-w-0"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
      >
        <div className="flex flex-col bg-neutral-800 min-h-0 min-w-0">
          <FilterControls data={data} filter={filter} setFilter={setFilter} />
          <div className="flex-1 p-3 text-[11px] font-mono text-neutral-400 overflow-y-auto">
            <div className="mb-1 text-neutral-500">Tips</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>orbit: drag • zoom: wheel • pan: right-drag</li>
              <li>hover a point for ID, region, top genes</li>
              <li>t-SNE: drag to box-select, links to 3D view</li>
              <li>Cluster mode + dropdown: pull a functional group</li>
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
