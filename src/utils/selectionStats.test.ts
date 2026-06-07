import { describe, it, expect } from 'vitest';
import { computeSelectionStats, computeSwimPartition } from './selectionStats';
import type { NeuronDataset } from '../data/types';

// 4-cell synthetic dataset shaped to exercise every code path:
//   - per-gene means (2 genes, hand-picked values)
//   - per-stim means (2 stimuli)
//   - per-cell mean trace (2 samples, distinct values)
//   - region / cluster / fish counts (two of each)
//   - swim partition: cell 0 is pro (≥ +swimLo), cell 1 is anti
//     (≤ −swimLo), cells 2 and 3 are off (|r| < swimLo)
// A fresh dataset object is built per test (makeData) so the per-dataset
// all-cells cache in computeSelectionStats can't leak between tests.
function makeData(overrides: Partial<NeuronDataset> = {}): NeuronDataset {
  return {
    count: 4,
    positions: new Float32Array(12),
    regionIds: new Int16Array([0, 0, 1, 1]),
    clusterIds: new Int16Array([0, 1, 0, 1]),
    fishIds: new Uint8Array([0, 0, 1, 1]),
    geneCounts: new Float32Array([5, 0, 0, 3, 4, 4, 0, 0]),
    geneBinary: new Uint8Array([1, 0, 0, 1, 1, 1, 0, 0]),
    umap: new Float32Array(8),
    stimulusCorr: new Float32Array([0.5, 0.0, 0.0, 0.5, 0.5, 0.5, 0.0, 0.0]),
    swimCorr: new Float32Array([0.3, -0.3, 0.0, 0.05]),
    activityTrace: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]),
    traceLength: 2,
    traceSampleRateHz: 1,
    atlasRegionMask: new Uint8Array(4),
    atlasRegionNames: [],
    geneNames: ['g0', 'g1'],
    regionNames: ['r0', 'r1'],
    stimulusNames: ['stim_0', 'stim_1'],
    clusterNames: ['c0', 'c1'],
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    source: 'mock',
    ...overrides,
  } as NeuronDataset;
}

const SWIM_LO = 0.1;

describe('computeSelectionStats', () => {
  it('returns null when given an empty indices array', () => {
    expect(computeSelectionStats(makeData(), new Uint32Array(0))).toBeNull();
  });

  it('returns null when count is zero and indices is null', () => {
    expect(computeSelectionStats(makeData({ count: 0 }), null)).toBeNull();
  });

  it('aggregates over all cells when indices is null', () => {
    const stats = computeSelectionStats(makeData(), null);
    expect(stats).not.toBeNull();
    if (!stats) return;

    expect(stats.count).toBe(4);
    // g0 mean = (5 + 0 + 4 + 0) / 4 = 2.25
    // g1 mean = (0 + 3 + 4 + 0) / 4 = 1.75
    expect(Array.from(stats.geneMeans)).toEqual([2.25, 1.75]);

    // stim_0 mean = (0.5 + 0.0 + 0.5 + 0.0) / 4 = 0.25
    // stim_1 mean = (0.0 + 0.5 + 0.5 + 0.0) / 4 = 0.25
    expect(Array.from(stats.stimulusMeans)).toEqual([0.25, 0.25]);

    // mean trace = [(1+3+5+7)/4, (2+4+6+8)/4] = [4, 5]
    expect(Array.from(stats.meanTrace)).toEqual([4, 5]);

    // 2 cells each in regions 0/1, clusters 0/1, fish 0/1
    expect(stats.regionCounts.get(0)).toBe(2);
    expect(stats.regionCounts.get(1)).toBe(2);
    expect(stats.clusterCounts.get(0)).toBe(2);
    expect(stats.clusterCounts.get(1)).toBe(2);
    expect(stats.fishCounts.get(0)).toBe(2);
    expect(stats.fishCounts.get(1)).toBe(2);

    expect(stats.swimMin).toBeCloseTo(-0.3);
    expect(stats.swimMax).toBeCloseTo(0.3);
    expect(stats.swimMean).toBeCloseTo(0.0125);
  });

  it('produces the same result for null and an explicit 0..N-1 indices array', () => {
    const data = makeData();
    const a = computeSelectionStats(data, null);
    const b = computeSelectionStats(data, new Uint32Array([0, 1, 2, 3]));
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    if (!a || !b) return;

    expect(Array.from(a.geneMeans)).toEqual(Array.from(b.geneMeans));
    expect(Array.from(a.stimulusMeans)).toEqual(Array.from(b.stimulusMeans));
    expect(Array.from(a.meanTrace)).toEqual(Array.from(b.meanTrace));
    expect(Array.from(a.swimBins)).toEqual(Array.from(b.swimBins));
    expect(a.swimMean).toEqual(b.swimMean);
    expect(a.swimMin).toEqual(b.swimMin);
    expect(a.swimMax).toEqual(b.swimMax);
  });

  it('aggregates over a subset when indices is a partial array', () => {
    // Just cells 0 and 2 — both region 0/cluster 0 cells, dropping the
    // cluster-1 / region-1 cells from the count.
    const stats = computeSelectionStats(makeData(), new Uint32Array([0, 2]));
    expect(stats).not.toBeNull();
    if (!stats) return;

    expect(stats.count).toBe(2);
    // g0 mean = (5 + 4) / 2 = 4.5; g1 mean = (0 + 4) / 2 = 2.0
    expect(Array.from(stats.geneMeans)).toEqual([4.5, 2.0]);
    // Mean trace = [(1+5)/2, (2+6)/2] = [3, 4]
    expect(Array.from(stats.meanTrace)).toEqual([3, 4]);
    // Cell 0 is region 0/cluster 0/fish 0; cell 2 is region 1/cluster 0/fish 1
    expect(stats.regionCounts.get(0)).toBe(1);
    expect(stats.regionCounts.get(1)).toBe(1);
    expect(stats.clusterCounts.get(0)).toBe(2);
    expect(stats.clusterCounts.get(1)).toBeUndefined();
  });

  it('places every cell into exactly one histogram bin', () => {
    // 40 bins over [-1, +1]. Bin indices land on or near 0.05-multiples
    // and pick up Float32 quantization noise at bin boundaries, so we
    // assert the invariant that matters: every cell is binned exactly
    // once.
    const data = makeData();
    const stats = computeSelectionStats(data, null);
    expect(stats).not.toBeNull();
    if (!stats) return;
    let total = 0;
    for (let b = 0; b < stats.swimBins.length; b++) total += stats.swimBins[b];
    expect(total).toBe(data.count);
  });

  it('clamps swim correlations outside [-1, +1] into the edge bins', () => {
    const data = makeData({ count: 2, swimCorr: new Float32Array([-1.5, 1.5]) });
    const stats = computeSelectionStats(data, new Uint32Array([0, 1]));
    expect(stats).not.toBeNull();
    if (!stats) return;
    expect(stats.swimBins[0]).toBe(1);
    expect(stats.swimBins[stats.swimBins.length - 1]).toBe(1);
  });

  it('caches the all-cells summary per dataset and recomputes for a different dataset', () => {
    const data = makeData();
    const first = computeSelectionStats(data, null);
    const second = computeSelectionStats(data, null);
    // Same dataset, all-cells sentinel → identical cached reference.
    expect(first).toBe(second);
    // An explicit index list bypasses the cache (fresh computation).
    expect(computeSelectionStats(data, new Uint32Array([0, 1, 2, 3]))).not.toBe(first);
    // A different dataset object is a different cache key.
    expect(computeSelectionStats(makeData(), null)).not.toBe(first);
  });
});

describe('computeSwimPartition', () => {
  it('partitions all cells by the responsive floor', () => {
    // Swim: pro = {0.3}, anti = {-0.3}, off = {0.0, 0.05}
    const part = computeSwimPartition(makeData(), null, SWIM_LO);
    expect(part.swimPos).toBe(1);
    expect(part.swimNeg).toBe(1);
    expect(part.swimOff).toBe(2);
  });

  it('partitions a subset', () => {
    // Cell 0 = 0.3 (pro), cell 2 = 0.0 (off)
    const part = computeSwimPartition(makeData(), new Uint32Array([0, 2]), SWIM_LO);
    expect(part.swimPos).toBe(1);
    expect(part.swimNeg).toBe(0);
    expect(part.swimOff).toBe(1);
  });

  it('drops a swim correlation of exactly +swimLo into the pro bucket', () => {
    // Boundary check: cell 0 has r = 0.3, swimLo = 0.3 → pro (>= swimLo)
    const part = computeSwimPartition(makeData(), new Uint32Array([0]), 0.3);
    expect(part.swimPos).toBe(1);
    expect(part.swimOff).toBe(0);
  });

  it('reacts to swimLo without touching the heavy aggregation', () => {
    const data = makeData();
    // A high floor pushes the pro cell (0.3) into the off band.
    const tight = computeSwimPartition(data, null, 0.5);
    expect(tight.swimPos).toBe(0);
    expect(tight.swimNeg).toBe(0);
    expect(tight.swimOff).toBe(4);
  });

  it('yields all-zero counts for an empty selection', () => {
    expect(computeSwimPartition(makeData(), new Uint32Array(0), SWIM_LO)).toEqual({
      swimPos: 0,
      swimNeg: 0,
      swimOff: 0,
    });
  });
});
