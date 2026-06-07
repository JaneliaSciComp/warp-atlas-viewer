import { useMemo } from 'react';
import type { NeuronDataset, SelectionState } from '../data/types';
import type { SharedColoring } from './useColoring';

const EMPTY_INDICES = new Uint32Array(0);

export interface EffectiveSelection {
  /** Selection to display in the Detail panel and export. */
  effectiveSelection: SelectionState;
  /** Cells passing the active filter (= data.count when no filter). */
  visibleCount: number;
}

/**
 * Derive the "effective" selection shown in the Detail panel / export.
 *
 * The user selection (t-SNE lasso / cluster / region) wins when present.
 * Otherwise we fall back to the filter-derived intersection so the panel
 * describes what the filter cards select even before the user gestures.
 * With neither, the 'all' source is a sentinel: an empty indices array
 * that consumers read as "every cell in the dataset" (count = data.count),
 * so no 0..N-1 buffer is allocated for the common unfiltered view.
 *
 * Pure so it can be unit-tested without React; the hook below wraps it in
 * a useMemo.
 */
export function deriveEffectiveSelection(
  data: NeuronDataset | null,
  selection: SelectionState,
  filterSelection: Uint32Array | null,
): SelectionState {
  if (!data) return selection;
  if (selection.indices.length > 0) return selection;
  if (filterSelection) return { indices: filterSelection, source: 'filter' };
  return { indices: EMPTY_INDICES, source: 'all' };
}

/**
 * Both effectiveSelection and visibleCount come out of the same
 * applyColoring pass via useColoring, so there's no separate full-dataset
 * walk here.
 */
export function useEffectiveSelection(
  data: NeuronDataset | null,
  selection: SelectionState,
  coloring: SharedColoring | null,
): EffectiveSelection {
  const filterSelection = coloring?.filterSelection ?? null;
  const effectiveSelection = useMemo(
    () => deriveEffectiveSelection(data, selection, filterSelection),
    [data, selection, filterSelection],
  );
  const visibleCount = data ? coloring?.visibleCount ?? data.count : 0;
  return { effectiveSelection, visibleCount };
}
