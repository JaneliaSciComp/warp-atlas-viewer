import { describe, it, expect } from 'vitest';
import {
  allocColoring,
  anyFilterActive,
  applyColoring,
  cellInSet,
  cellIsRenderable,
  cellPasses,
} from './coloring';
import {
  DEFAULT_SETTINGS,
  type FilterState,
  type NeuronDataset,
} from '../data/types';

// 4-cell synthetic dataset with hand-picked values so every filter
// dimension can be exercised independently:
//
//   cell  region  cluster  fish  g0 (bin)  g1 (bin)  stim0  stim1  swim
//   ----  ------  -------  ----  --------  --------  -----  -----  ----
//   0     0       0        0     5  (1)    0  (0)    0.5    0.0    +0.3
//   1     0       1        0     0  (0)    3  (1)    0.0    0.5    -0.3
//   2     1       0        1     4  (1)    4  (1)    0.5    0.5     0.0
//   3     1       1        1     0  (0)    0  (0)    0.0    0.0     0.0
const TEST_DATA: NeuronDataset = {
  count: 4,
  positions: new Float32Array(12),
  regionIds: new Int16Array([0, 0, 1, 1]),
  clusterIds: new Int16Array([0, 1, 0, 1]),
  fishIds: new Uint8Array([0, 0, 1, 1]),
  geneCounts: new Float32Array([5, 0, 0, 3, 4, 4, 0, 0]),
  geneBinary: new Uint8Array([1, 0, 0, 1, 1, 1, 0, 0]),
  umap: new Float32Array(8),
  stimulusCorr: new Float32Array([0.5, 0.0, 0.0, 0.5, 0.5, 0.5, 0.0, 0.0]),
  swimCorr: new Float32Array([0.3, -0.3, 0.0, 0.0]),
  activityTrace: new Float32Array(4),
  traceLength: 1,
  traceSampleRateHz: 1,
  geneNames: ['g0', 'g1'],
  regionNames: ['r0', 'r1'],
  stimulusNames: ['stim_0', 'stim_1'],
  clusterNames: ['c0', 'c1'],
  bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  source: 'mock',
};

const BASE_FILTER: FilterState = {
  colorMode: 'highlight',
  geneScale: 'log',
  showUnassignedRegion: true,
  regionPalette: 'nipy_spectral',
  isolatedRegion: -1,
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

function passes(filter: FilterState): number[] {
  const out: number[] = [];
  for (let i = 0; i < TEST_DATA.count; i++) {
    if (cellInSet(TEST_DATA, filter, DEFAULT_SETTINGS, i)) out.push(i);
  }
  return out;
}

describe('cellPasses', () => {
  it('passes every cell when no filter is constraining', () => {
    expect(passes(BASE_FILTER)).toEqual([0, 1, 2, 3]);
  });

  it('isolates a region', () => {
    expect(passes({ ...BASE_FILTER, isolatedRegion: 0 })).toEqual([0, 1]);
    expect(passes({ ...BASE_FILTER, isolatedRegion: 1 })).toEqual([2, 3]);
  });

  it('isolates a fish', () => {
    expect(passes({ ...BASE_FILTER, isolatedFish: 0 })).toEqual([0, 1]);
    expect(passes({ ...BASE_FILTER, isolatedFish: 1 })).toEqual([2, 3]);
  });

  it('filters by a single gene under the binary predicate', () => {
    const f = { ...BASE_FILTER, txMode: 'gene' as const, selectedGenes: [0] };
    expect(passes(f)).toEqual([0, 2]);
  });

  it('combines multiple genes with OR', () => {
    const f = { ...BASE_FILTER, txMode: 'gene' as const, selectedGenes: [0, 1], geneLogic: 'or' as const };
    expect(passes(f)).toEqual([0, 1, 2]);
  });

  it('combines multiple genes with AND', () => {
    const f = { ...BASE_FILTER, txMode: 'gene' as const, selectedGenes: [0, 1], geneLogic: 'and' as const };
    expect(passes(f)).toEqual([2]);
  });

  it('respects the gene-strict (binary call) toggle', () => {
    const f = { ...BASE_FILTER, txMode: 'gene' as const, selectedGenes: [0] };
    const lax = passes(f);
    expect(lax).toEqual([0, 2]); // binary == 1 only at cells 0, 2
    const lenient = (() => {
      const out: number[] = [];
      for (let i = 0; i < TEST_DATA.count; i++) {
        if (cellInSet(TEST_DATA, f, { ...DEFAULT_SETTINGS, geneThresholdMode: 'global', geneThresholdGlobal: 1 }, i)) out.push(i);
      }
      return out;
    })();
    // Cells with raw count > 0 for g0: 0, 2 — same here, since g0 binary
    // and "any detected" align in this fixture. Inverse case for g1
    // would diverge; this assertion just locks the path runs without
    // crashing.
    expect(lenient).toEqual([0, 2]);
  });

  it('filters by a cluster in Subtype mode', () => {
    const f = { ...BASE_FILTER, txMode: 'subtype' as const, selectedCluster: 0 };
    expect(passes(f)).toEqual([0, 2]);
  });

  it('Subtype mode ignores selectedGenes (mode-gated)', () => {
    const f = { ...BASE_FILTER, txMode: 'subtype' as const, selectedCluster: 0, selectedGenes: [1] };
    // Still filters by cluster, not by gene.
    expect(passes(f)).toEqual([0, 2]);
  });

  it('All mode applies no transcriptomics filter regardless of selections', () => {
    const f: FilterState = {
      ...BASE_FILTER,
      txMode: 'all',
      selectedGenes: [0],
      selectedCluster: 0,
    };
    expect(passes(f)).toEqual([0, 1, 2, 3]);
  });

  it('filters by a single stimulus above the responsive floor', () => {
    const f = { ...BASE_FILTER, selectedStimuli: [0], stimMode: 'positive' as const };
    expect(passes(f)).toEqual([0, 2]);
  });

  it('combines stimuli with AND', () => {
    const f = {
      ...BASE_FILTER,
      selectedStimuli: [0, 1],
      stimLogic: 'and' as const,
      stimMode: 'positive' as const,
    };
    expect(passes(f)).toEqual([2]);
  });

  it('keeps positively swim-correlated cells', () => {
    const f = { ...BASE_FILTER, swimMode: 'positive' as const };
    expect(passes(f)).toEqual([0]);
  });

  it('keeps anti-swim-correlated cells', () => {
    const f = { ...BASE_FILTER, swimMode: 'negative' as const };
    expect(passes(f)).toEqual([1]);
  });

  it('keeps the union under swimMode=both', () => {
    const f = { ...BASE_FILTER, swimMode: 'both' as const };
    expect(passes(f)).toEqual([0, 1]);
  });

  it('intersects multiple filter dimensions', () => {
    const f: FilterState = {
      ...BASE_FILTER,
      isolatedRegion: 1,
      txMode: 'gene',
      selectedGenes: [0],
    };
    // region 1 → {2, 3}; gene 0 → {0, 2}; intersection → {2}
    expect(passes(f)).toEqual([2]);
  });

  it('exposes per-axis predicates', () => {
    const f: FilterState = {
      ...BASE_FILTER,
      isolatedRegion: 0,
      selectedStimuli: [0],
      stimMode: 'positive',
    };
    // cell 1 is in region 0 but fails stim 0 (corr 0.0 < floor)
    const p = cellPasses(TEST_DATA, f, DEFAULT_SETTINGS, 1);
    expect(p.inRegion).toBe(true);
    expect(p.passesStim).toBe(false);
  });

  it('excludes unassigned cells when Region hides them', () => {
    const f: FilterState = {
      ...BASE_FILTER,
      colorMode: 'region',
      showUnassignedRegion: false,
    };

    expect(cellIsRenderable(TEST_DATA, f, 0)).toBe(false);
    expect(cellIsRenderable(TEST_DATA, f, 2)).toBe(true);
    expect(passes(f)).toEqual([2, 3]);
  });
});

describe('anyFilterActive', () => {
  it('is false when nothing is constraining', () => {
    expect(anyFilterActive(TEST_DATA, BASE_FILTER)).toBe(false);
  });

  it('is true once any filter dimension is constraining', () => {
    expect(anyFilterActive(TEST_DATA, { ...BASE_FILTER, isolatedRegion: 0 })).toBe(true);
    expect(anyFilterActive(TEST_DATA, { ...BASE_FILTER, isolatedFish: 1 })).toBe(true);
    expect(
      anyFilterActive(TEST_DATA, { ...BASE_FILTER, txMode: 'gene', selectedGenes: [0] }),
    ).toBe(true);
    expect(anyFilterActive(TEST_DATA, { ...BASE_FILTER, txMode: 'subtype' })).toBe(true);
    expect(anyFilterActive(TEST_DATA, { ...BASE_FILTER, selectedStimuli: [0] })).toBe(false);
    expect(
      anyFilterActive(TEST_DATA, {
        ...BASE_FILTER,
        selectedStimuli: [0],
        stimMode: 'positive',
      }),
    ).toBe(true);
    expect(anyFilterActive(TEST_DATA, { ...BASE_FILTER, swimMode: 'positive' })).toBe(true);
    expect(
      anyFilterActive(TEST_DATA, {
        ...BASE_FILTER,
        colorMode: 'region',
        showUnassignedRegion: false,
      }),
    ).toBe(true);
  });

  it('Gene mode with no genes is NOT active', () => {
    expect(
      anyFilterActive(TEST_DATA, { ...BASE_FILTER, txMode: 'gene', selectedGenes: [] }),
    ).toBe(false);
  });
});

describe('applyColoring stats', () => {
  const emptySelection = { indices: new Uint32Array(0), source: null };

  // Use the upper auto-mode anchor so tests don't drift if the lerp
  // endpoints change — at this canvas size auto/manual produce the
  // same in-set sizes (9 px) and ghost visibility (1.0).
  const CW = 1512;
  const CH = 478;

  it('uses null filterSelection only when no filters are active', () => {
    const out = allocColoring(TEST_DATA.count);
    const stats = applyColoring(TEST_DATA, BASE_FILTER, DEFAULT_SETTINGS, emptySelection, CW, CH, out);

    expect(stats.filterSelection).toBeNull();
  });

  it('returns an empty filterSelection when active filters match zero cells', () => {
    const out = allocColoring(TEST_DATA.count);
    const impossibleFilter: FilterState = {
      ...BASE_FILTER,
      txMode: 'gene',
      selectedGenes: [0, 1],
      geneLogic: 'and',
      isolatedRegion: 0,
    };
    const stats = applyColoring(TEST_DATA, impossibleFilter, DEFAULT_SETTINGS, emptySelection, CW, CH, out);

    expect(stats.filterSelection).toBeInstanceOf(Uint32Array);
    expect(stats.filterSelection).toHaveLength(0);
  });

  it('hides unassigned Region cells and dims non-selected in-set cells', () => {
    const out = allocColoring(TEST_DATA.count);
    const filter: FilterState = {
      ...BASE_FILTER,
      colorMode: 'region',
      showUnassignedRegion: false,
    };
    // User-explicit selection on cell 2; cells 0/1 are unassigned and
    // hidden by the filter; cell 3 is in-set but not selected, so it
    // should drop to the selection-driven dim alpha (≤ 0.18) regardless
    // of the selection size.
    const stats = applyColoring(
      TEST_DATA,
      filter,
      DEFAULT_SETTINGS,
      { indices: new Uint32Array([2]), source: 'umap' },
      CW,
      CH,
      out,
    );

    expect(out.alphas[0]).toBe(0);
    expect(out.alphas[1]).toBe(0);
    expect(out.alphas[2]).toBeGreaterThan(0.5);
    // Float32 storage rounds 0.18 to ~0.180000007, so allow a tiny tolerance.
    expect(out.alphas[3]).toBeLessThanOrEqual(0.1801);
    // Only cell 2 clears the visible-alpha threshold; 0/1 are hidden,
    // 3 is dimmed by the selection.
    expect(stats.visibleCount).toBe(1);
    // filterSelection still reflects the filter intersection (both
    // renderable cells), independent of the user selection.
    expect(stats.filterSelection).toBeInstanceOf(Uint32Array);
    expect(Array.from(stats.filterSelection ?? []).sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it('applies opaqueActiveCells in shared coloring and visibleCount', () => {
    const out = allocColoring(TEST_DATA.count);
    const stats = applyColoring(
      TEST_DATA,
      { ...BASE_FILTER, colorMode: 'activity' },
      { ...DEFAULT_SETTINGS, opaqueActiveCells: true },
      emptySelection,
      CW,
      CH,
      out,
    );

    expect(Array.from(out.alphas)).toEqual([1, 1, 1, 1]);
    expect(stats.visibleCount).toBe(4);
  });
});
