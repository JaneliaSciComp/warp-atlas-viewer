import { useEffect, useMemo, useRef, useState } from 'react';
import type { FilterState, NeuronDataset, SelectionState, SettingsState } from '../data/types';
import { allocColoring, applyColoring, type ColoringResult } from '../utils/coloring';

export interface SharedColoring {
  /** Per-cell color/alpha/size buffers — the "base" coloring shared
   *  by every renderer. Buffers are reused across filter changes (no
   *  realloc per update). Consumers that need per-render tweaks
   *  (e.g. BrainViewer's focus-stamp on top) should copy into their
   *  own buffers; do NOT mutate `result` in place. */
  result: ColoringResult;
  /** Monotonically bumped each time `applyColoring` writes new values
   *  into `result`. Use as a useEffect dep — `result`'s identity is
   *  stable across updates, so depending on it directly wouldn't
   *  re-fire effects. */
  revision: number;
  /** Cells passing the active filter intersection (= every cell when
   *  no filter is active). Counted inside the same hot loop that
   *  paints, so consumers don't have to re-walk the cell array. */
  visibleCount: number;
  /** Indices of cells in the filter intersection, or null when no
   *  filter is active. Drives the filter-derived fallback for the
   *  DetailPanel selection. */
  filterSelection: Uint32Array | null;
}

/** Shared per-cell coloring keyed on (data, filter, settings,
 *  selection). Both BrainViewer and UmapPanel consume the same base
 *  buffers, so the 274k-cell `applyColoring` pass runs at most once
 *  per interaction regardless of how many renderers display the data. */
export function useColoring(
  data: NeuronDataset | null,
  filter: FilterState,
  settings: SettingsState,
  selection: SelectionState,
): SharedColoring | null {
  // One buffer reused across all updates; reallocated only when the
  // dataset changes (different `count`).
  const result = useMemo(() => (data ? allocColoring(data.count) : null), [data]);
  const [revision, setRevision] = useState(0);
  // Stats produced by applyColoring (visibleCount, filterSelection)
  // come out of the same pass that paints. Stash them in a ref keyed
  // to the published revision so consumers reading them stay in sync.
  const statsRef = useRef<{ visibleCount: number; filterSelection: Uint32Array | null }>(
    { visibleCount: 0, filterSelection: null },
  );
  useEffect(() => {
    if (!data || !result) return;
    statsRef.current = applyColoring(data, filter, settings, selection, result);
    setRevision((r) => r + 1);
  }, [data, filter, settings, selection, result]);
  // Memoize the wrapper so its identity tracks (result, revision) — not
  // App's render cadence. Without this, consumers that put `coloring`
  // in an effect dep list see a new object every parent render and
  // re-fire the (expensive) effect even when the buffers haven't moved.
  return useMemo(
    () =>
      result
        ? {
            result,
            revision,
            visibleCount: statsRef.current.visibleCount,
            filterSelection: statsRef.current.filterSelection,
          }
        : null,
    [result, revision],
  );
}
