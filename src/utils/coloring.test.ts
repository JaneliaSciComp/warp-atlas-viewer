import { describe, it, expect } from 'vitest';
import {
  allocColoring,
  anyFilterActive,
  applyColoring,
  cellInAtlasRegion,
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
  // 3 atlas regions, 1 byte/cell, bits little-endian:
  //   cell 0 in {a0, a2}  → 0b00000101 = 5
  //   cell 1 in {a1, a2}  → 0b00000110 = 6
  //   cell 2 in {a0, a2}  → 0b00000101 = 5
  //   cell 3 in {a1}      → 0b00000010 = 2
  atlasRegionMask: new Uint8Array([5, 6, 5, 2]),
  atlasRegionNames: ['a0', 'a1', 'a2'],
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
  anatomyAtlas: 'manuscript',
  isolatedRegion: -1,
  isolatedAtlasRegion: -1,
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

  it('isolates a mapzebrain atlas region when anatomyAtlas is mapzebrain', () => {
    const f = { ...BASE_FILTER, anatomyAtlas: 'mapzebrain' as const };
    expect(passes({ ...f, isolatedAtlasRegion: 0 })).toEqual([0, 2]);
    expect(passes({ ...f, isolatedAtlasRegion: 1 })).toEqual([1, 3]);
    expect(passes({ ...f, isolatedAtlasRegion: 2 })).toEqual([0, 1, 2]);
  });

  it('treats atlas and focal region as alternatives (only the selected atlas filters)', () => {
    // isolatedAtlasRegion is set but anatomyAtlas is 'manuscript' → ignored.
    expect(
      passes({ ...BASE_FILTER, isolatedAtlasRegion: 1 }),
    ).toEqual([0, 1, 2, 3]);
    // isolatedRegion is set but anatomyAtlas is 'mapzebrain' → ignored.
    expect(
      passes({
        ...BASE_FILTER,
        anatomyAtlas: 'mapzebrain' as const,
        isolatedRegion: 0,
      }),
    ).toEqual([0, 1, 2, 3]);
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

  it('does not constrain cells when selected stimuli are in no-filter mode', () => {
    const f = { ...BASE_FILTER, selectedStimuli: [0], stimMode: 'off' as const };
    expect(passes(f)).toEqual([0, 1, 2, 3]);
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

describe('cellInAtlasRegion', () => {
  it('decodes packed-bit membership for each cell × region pair', () => {
    // Per the TEST_DATA mask above:
    //   cell 0: regions {0, 2}
    //   cell 1: regions {1, 2}
    //   cell 2: regions {0, 2}
    //   cell 3: regions {1}
    expect(cellInAtlasRegion(TEST_DATA, 0, 0)).toBe(true);
    expect(cellInAtlasRegion(TEST_DATA, 0, 1)).toBe(false);
    expect(cellInAtlasRegion(TEST_DATA, 0, 2)).toBe(true);
    expect(cellInAtlasRegion(TEST_DATA, 1, 0)).toBe(false);
    expect(cellInAtlasRegion(TEST_DATA, 1, 1)).toBe(true);
    expect(cellInAtlasRegion(TEST_DATA, 1, 2)).toBe(true);
    expect(cellInAtlasRegion(TEST_DATA, 3, 1)).toBe(true);
    expect(cellInAtlasRegion(TEST_DATA, 3, 2)).toBe(false);
  });

  it('decodes memberships across packed-byte boundaries', () => {
    // 17 atlas regions → 3 bytes/cell. This catches off-by-one errors in
    // both halves of the bit address: byte index `(r >> 3)` and bit index
    // `(r & 7)`.
    const ds: NeuronDataset = {
      ...TEST_DATA,
      count: 2,
      atlasRegionNames: Array.from({ length: 17 }, (_, i) => `a${i}`),
      atlasRegionMask: new Uint8Array([
        // cell 0: regions {0, 8, 16}
        0b00000001, 0b00000001, 0b00000001,
        // cell 1: regions {7, 15}
        0b10000000, 0b10000000, 0b00000000,
      ]),
    };

    expect(cellInAtlasRegion(ds, 0, 0)).toBe(true);
    expect(cellInAtlasRegion(ds, 0, 8)).toBe(true);
    expect(cellInAtlasRegion(ds, 0, 16)).toBe(true);
    expect(cellInAtlasRegion(ds, 0, 7)).toBe(false);
    expect(cellInAtlasRegion(ds, 0, 15)).toBe(false);

    expect(cellInAtlasRegion(ds, 1, 7)).toBe(true);
    expect(cellInAtlasRegion(ds, 1, 15)).toBe(true);
    expect(cellInAtlasRegion(ds, 1, 8)).toBe(false);
    expect(cellInAtlasRegion(ds, 1, 16)).toBe(false);
  });
});

describe('anyFilterActive', () => {
  it('is false when nothing is constraining', () => {
    expect(anyFilterActive(TEST_DATA, BASE_FILTER)).toBe(false);
  });

  it('is true once any filter dimension is constraining', () => {
    expect(anyFilterActive(TEST_DATA, { ...BASE_FILTER, isolatedRegion: 0 })).toBe(true);
    expect(
      anyFilterActive(TEST_DATA, {
        ...BASE_FILTER,
        anatomyAtlas: 'mapzebrain',
        isolatedAtlasRegion: 0,
      }),
    ).toBe(true);
    // Atlas region set but mode still 'manuscript' → dormant, no filter.
    expect(
      anyFilterActive(TEST_DATA, { ...BASE_FILTER, isolatedAtlasRegion: 0 }),
    ).toBe(false);
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

  // Canvas height for the test fixture. The assertions below don't
  // depend on the specific auto-mode sizes/ghost at this height, only
  // on relative alpha/visibility behavior, so the exact value isn't
  // load-bearing — but pin it so refits of the auto curves can't
  // accidentally drag a test into a regime (e.g. h≈100) where ghost
  // clamps and the dim-tier math changes shape.
  const CH = 500;

  it('uses null filterSelection only when no filters are active', () => {
    const out = allocColoring(TEST_DATA.count);
    const stats = applyColoring(TEST_DATA, BASE_FILTER, DEFAULT_SETTINGS, emptySelection, CH, out);

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
    const stats = applyColoring(TEST_DATA, impossibleFilter, DEFAULT_SETTINGS, emptySelection, CH, out);

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
      CH,
      out,
    );

    expect(out.alphas[0]).toBe(0);
    expect(out.alphas[1]).toBe(0);
    expect(out.alphas[2]).toBeGreaterThan(0.5);
    // Float32 storage rounds 0.18 to ~0.180000007, so allow a tiny tolerance.
    expect(out.alphas[3]).toBeLessThanOrEqual(0.1801);
    // "Cells visible" reflects the filter intersection (both renderable
    // cells), independent of the user selection / alpha dimming.
    expect(stats.visibleCount).toBe(2);
    expect(stats.filterSelection).toBeInstanceOf(Uint32Array);
    expect(Array.from(stats.filterSelection ?? []).sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it('applies opaqueActiveCells in shared coloring without changing the filter count', () => {
    const out = allocColoring(TEST_DATA.count);
    const stats = applyColoring(
      TEST_DATA,
      { ...BASE_FILTER, colorMode: 'activity' },
      { ...DEFAULT_SETTINGS, opaqueActiveCells: true },
      emptySelection,
      CH,
      out,
    );

    expect(Array.from(out.alphas)).toEqual([1, 1, 1, 1]);
    expect(stats.visibleCount).toBe(4);
  });

  it('maps no-filter Stim coloring continuously from zero instead of like ± either', () => {
    const ds: NeuronDataset = {
      ...TEST_DATA,
      // Cell 3 has weak-but-nonzero stim0 correlation below the default
      // responsive floor. No-filter should still expose it as a scalar;
      // ± either should reject it from the active set.
      stimulusCorr: new Float32Array([0.5, 0.0, 0.0, 0.5, 0.5, 0.5, 0.05, 0.0]),
    };
    const noFilterOut = allocColoring(ds.count);
    const noFilterStats = applyColoring(
      ds,
      { ...BASE_FILTER, colorMode: 'stim', selectedStimuli: [0], stimMode: 'off' },
      DEFAULT_SETTINGS,
      emptySelection,
      CH,
      noFilterOut,
    );
    expect(noFilterStats.filterSelection).toBeNull();
    expect(noFilterStats.visibleCount).toBe(ds.count);
    expect(noFilterOut.scalarValues[3]).toBeCloseTo(0.05);
    expect(noFilterOut.intensities[3]).toBeGreaterThan(0);

    const eitherOut = allocColoring(ds.count);
    const eitherStats = applyColoring(
      ds,
      { ...BASE_FILTER, colorMode: 'stim', selectedStimuli: [0], stimMode: 'both' },
      DEFAULT_SETTINGS,
      emptySelection,
      CH,
      eitherOut,
    );
    expect(Array.from(eitherStats.filterSelection ?? []).sort((a, b) => a - b)).toEqual([0, 2]);
    expect(eitherStats.visibleCount).toBe(2);
    expect(eitherOut.scalarValues[3]).toBeNaN();
    expect(eitherOut.intensities[3]).toBe(0);
  });

  it('Stim split saturation gives each sign an independent intensity ramp', () => {
    // Cell 0 = +0.25 (stim0), cell 1 = −0.25 (stim0): equal magnitude,
    // opposite sign. No-filter mode (deadband 0) so the only thing
    // shaping intensity is the per-sign saturation anchor.
    const ds: NeuronDataset = {
      ...TEST_DATA,
      stimulusCorr: new Float32Array([0.25, 0, -0.25, 0, 0, 0, 0, 0]),
    };
    const filter = { ...BASE_FILTER, colorMode: 'stim' as const, selectedStimuli: [0], stimMode: 'off' as const };

    // Split off: one symmetric anchor → equal magnitude reads equal intensity.
    const symOut = allocColoring(ds.count);
    applyColoring(ds, filter, { ...DEFAULT_SETTINGS, stimHi: 0.5 }, emptySelection, CH, symOut);
    expect(symOut.intensities[0]).toBeCloseTo(0.5);
    expect(symOut.intensities[1]).toBeCloseTo(0.5);

    // Split on: positive anchored at 0.5, negative at 0.25 → the negative
    // cell saturates (v=1) while the positive cell is only half-way.
    const splitOut = allocColoring(ds.count);
    applyColoring(
      ds,
      filter,
      { ...DEFAULT_SETTINGS, stimSplitSaturation: true, stimHiPos: 0.5, stimHiNeg: 0.25 },
      emptySelection,
      CH,
      splitOut,
    );
    expect(splitOut.scalarValues[0]).toBeCloseTo(0.25);
    expect(splitOut.scalarValues[1]).toBeCloseTo(-0.25);
    expect(splitOut.intensities[0]).toBeCloseTo(0.5);
    expect(splitOut.intensities[1]).toBeCloseTo(1.0);
  });
});
