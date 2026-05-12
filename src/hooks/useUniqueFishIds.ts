import { useMemo } from 'react';
import type { NeuronDataset } from '../data/types';

/** Sorted unique fish ids present in the dataset, computed once per
 *  `data` reference. `fishIds` is a flat Uint8Array — there's no
 *  guarantee values are 0..N-1 dense for future datasets, so
 *  consumers shouldn't derive nFish as max+1 (a sparse {0, 2} would
 *  list a nonexistent fish). Use `.length` for count and iterate with
 *  the actual id (not the index) when displaying labels or assigning
 *  colors. */
const EMPTY = new Uint8Array(0);

export function useUniqueFishIds(data: NeuronDataset | null): Uint8Array {
  return useMemo(() => {
    if (!data) return EMPTY;
    const seen = new Set<number>();
    for (let i = 0; i < data.fishIds.length; i++) seen.add(data.fishIds[i]);
    return Uint8Array.from(Array.from(seen).sort((a, b) => a - b));
  }, [data]);
}
