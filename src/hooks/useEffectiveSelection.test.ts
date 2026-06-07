import { describe, it, expect } from 'vitest';
import { deriveEffectiveSelection } from './useEffectiveSelection';
import type { NeuronDataset, SelectionState } from '../data/types';

// deriveEffectiveSelection only reads data for truthiness, so a bare cast
// stands in for "a dataset is loaded".
const DATA = {} as NeuronDataset;
const EMPTY: SelectionState = { indices: new Uint32Array(0), source: 'all' };

describe('deriveEffectiveSelection', () => {
  it('returns the raw selection unchanged while data is still loading', () => {
    const sel: SelectionState = { indices: new Uint32Array([1, 2]), source: 'umap' };
    expect(deriveEffectiveSelection(null, sel, new Uint32Array([9]))).toBe(sel);
  });

  it('prefers a non-empty user selection over the filter intersection', () => {
    const sel: SelectionState = { indices: new Uint32Array([3, 4]), source: 'umap' };
    expect(deriveEffectiveSelection(DATA, sel, new Uint32Array([7, 8]))).toBe(sel);
  });

  it('falls back to the filter intersection when the user selection is empty', () => {
    const filterSel = new Uint32Array([5, 6, 7]);
    const out = deriveEffectiveSelection(DATA, EMPTY, filterSel);
    expect(out.source).toBe('filter');
    expect(out.indices).toBe(filterSel);
  });

  it('uses the all-cells sentinel when nothing is selected or filtered', () => {
    const out = deriveEffectiveSelection(DATA, EMPTY, null);
    expect(out.source).toBe('all');
    expect(out.indices.length).toBe(0);
  });
});
