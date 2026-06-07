import { describe, it, expect } from 'vitest';
import {
  dedupePreserveOrder,
  toggleStimulus,
  replaceGeneAtRow,
  removeGeneAtRow,
  addFirstAvailableGene,
  geneRowOptions,
  clusterForSubtypeMode,
} from './filterModel';

// Genes deliberately out of alphabetical index order so "first available
// alphabetically" differs from "first available by index".
const GENE_NAMES = ['charlie', 'alpha', 'delta', 'bravo']; // idx 0..3
const CLUSTERS = ['Unassigned', 'Glut', 'GABA'];

describe('dedupePreserveOrder', () => {
  it('keeps first occurrences in order', () => {
    expect(dedupePreserveOrder([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
  });
  it('returns an empty array unchanged', () => {
    expect(dedupePreserveOrder([])).toEqual([]);
  });
});

describe('toggleStimulus', () => {
  it('adds a missing stimulus and keeps the list sorted', () => {
    expect(toggleStimulus([2, 0], 1)).toEqual([0, 1, 2]);
  });
  it('removes a present stimulus', () => {
    expect(toggleStimulus([0, 1, 2], 1)).toEqual([0, 2]);
  });
  it('does not mutate the input', () => {
    const input = [0, 2];
    toggleStimulus(input, 1);
    expect(input).toEqual([0, 2]);
  });
});

describe('replaceGeneAtRow', () => {
  it('replaces the gene at the given row', () => {
    expect(replaceGeneAtRow([0, 1, 2], 1, 3)).toEqual([0, 3, 2]);
  });
  it('collapses a duplicate when the replacement already exists', () => {
    // Replacing row 1 (gene 1) with gene 2 leaves [0, 2, 2] → deduped [0, 2].
    expect(replaceGeneAtRow([0, 1, 2], 1, 2)).toEqual([0, 2]);
  });
});

describe('removeGeneAtRow', () => {
  it('drops the gene at the given row', () => {
    expect(removeGeneAtRow([5, 6, 7], 1)).toEqual([5, 7]);
  });
});

describe('addFirstAvailableGene', () => {
  it('appends the first unused gene alphabetically', () => {
    // Unused: charlie(0), delta(2), bravo(3). Alphabetical first = bravo(3).
    expect(addFirstAvailableGene([1], GENE_NAMES)).toEqual([1, 3]);
  });
  it('returns the selection unchanged when every gene is selected', () => {
    const all = [0, 1, 2, 3];
    expect(addFirstAvailableGene(all, GENE_NAMES)).toBe(all);
  });
});

describe('geneRowOptions', () => {
  it('excludes genes used on other rows but keeps the current row gene', () => {
    // selected [0, 1] (charlie, alpha); options for row 0 exclude alpha(1).
    const opts = geneRowOptions([0, 1], GENE_NAMES, 0);
    const values = opts.map((o) => o.value);
    expect(values).not.toContain(1); // alpha used on row 1
    expect(values).toContain(0); // charlie is this row's own gene
    // Sorted alphabetically by label.
    expect(opts.map((o) => o.label)).toEqual([...opts.map((o) => o.label)].sort());
  });
});

describe('clusterForSubtypeMode', () => {
  it('promotes off the reserved Unassigned cluster to the first real one', () => {
    expect(clusterForSubtypeMode(0, CLUSTERS)).toBe(1);
  });
  it('keeps a cluster that is already a real one', () => {
    expect(clusterForSubtypeMode(2, CLUSTERS)).toBe(2);
  });
  it('keeps the current cluster when no real cluster exists', () => {
    expect(clusterForSubtypeMode(0, ['Unassigned', 'Unassigned'])).toBe(0);
  });
});
