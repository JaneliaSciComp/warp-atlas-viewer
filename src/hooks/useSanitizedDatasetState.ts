import { useMemo } from 'react';
import type { FilterState, NeuronDataset } from '../data/types';
import { sanitizeFilterAgainstDataset, sanitizeFocusedNeuron } from '../utils/urlState';

export interface SanitizedDatasetState {
  /** Filter with every dataset-indexed field (genes, stimuli, regions,
   *  cluster, fish, activity sample) clamped to the loaded dataset's
   *  arity. Identical to the raw filter until `data` resolves. */
  effectiveFilter: FilterState;
  /** Focused-neuron index clamped to [0, data.count); null when out of
   *  range or unset. */
  effectiveFocusedNeuron: number | null;
}

/**
 * Synchronously reconcile URL-derived filter / focused-neuron state with
 * the loaded dataset.
 *
 * URL state is decoded at module load, before dataset metadata exists, so
 * the raw `filter` / `focusedNeuron` can momentarily carry indices that
 * are out of range for the dataset that actually loaded — e.g. a share
 * link generated against a different gene panel, stimulus list, atlas, or
 * cell count. Deriving the sanitized values here, rather than committing
 * them in an effect a render later, means no render ever feeds an
 * out-of-range index into coloring, picking, export, or the typed-array
 * reads downstream. The clamp is a no-op once the raw state has itself
 * been sanitized, so this stays cheap on steady-state interaction.
 */
export function useSanitizedDatasetState(
  data: NeuronDataset | null,
  filter: FilterState,
  focusedNeuron: number | null,
): SanitizedDatasetState {
  const effectiveFilter = useMemo(
    () => (data ? sanitizeFilterAgainstDataset(filter, data) : filter),
    [data, filter],
  );
  const effectiveFocusedNeuron = useMemo(
    () => (data ? sanitizeFocusedNeuron(focusedNeuron, data) : focusedNeuron),
    [data, focusedNeuron],
  );
  return { effectiveFilter, effectiveFocusedNeuron };
}
