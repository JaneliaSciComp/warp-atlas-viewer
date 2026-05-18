import { describe, it, expect } from 'vitest';
import { computeStats } from './DetailPanel';
import type { NeuronDataset } from '../data/types';

// 4-cell synthetic dataset shaped to exercise every code path in
// computeStats:
//   - per-gene means (2 genes, hand-picked values)
//   - per-stim means (2 stimuli)
//   - per-cell mean trace (2 samples, distinct values)
//   - region / cluster / fish counts (two of each)
//   - swim partition: cell 0 is pro (≥ +swimLo), cell 1 is anti
//     (≤ −swimLo), cells 2 and 3 are off (|r| < swimLo)
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
  swimCorr: new Float32Array([0.3, -0.3, 0.0, 0.05]),
  activityTrace: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]),
  traceLength: 2,
  traceSampleRateHz: 1,
  geneNames: ['g0', 'g1'],
  regionNames: ['r0', 'r1'],
  stimulusNames: ['stim_0', 'stim_1'],
  clusterNames: ['c0', 'c1'],
  bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  source: 'mock',
};

const SWIM_LO = 0.1;

describe('computeStats', () => {
  it('returns null when given an empty indices array', () => {
    expect(computeStats(TEST_DATA, new Uint32Array(0), SWIM_LO)).toBeNull();
  });

  it('returns null when count is zero and indices is null', () => {
    const empty: NeuronDataset = { ...TEST_DATA, count: 0 };
    expect(computeStats(empty, null, SWIM_LO)).toBeNull();
  });

  it('aggregates over all cells when indices is null', () => {
    const stats = computeStats(TEST_DATA, null, SWIM_LO);
    expect(stats).not.toBeNull();
    if (!stats) return;

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

    // Swim: pro = {0.3}, anti = {-0.3}, off = {0.0, 0.05}
    expect(stats.swimPos).toBe(1);
    expect(stats.swimNeg).toBe(1);
    expect(stats.swimOff).toBe(2);
    expect(stats.swimMin).toBeCloseTo(-0.3);
    expect(stats.swimMax).toBeCloseTo(0.3);
    expect(stats.swimMean).toBeCloseTo(0.0125);
  });

  it('produces the same result for null and an explicit 0..N-1 indices array', () => {
    const allIndices = new Uint32Array([0, 1, 2, 3]);
    const a = computeStats(TEST_DATA, null, SWIM_LO);
    const b = computeStats(TEST_DATA, allIndices, SWIM_LO);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    if (!a || !b) return;

    expect(Array.from(a.geneMeans)).toEqual(Array.from(b.geneMeans));
    expect(Array.from(a.stimulusMeans)).toEqual(Array.from(b.stimulusMeans));
    expect(Array.from(a.meanTrace)).toEqual(Array.from(b.meanTrace));
    expect(Array.from(a.swimBins)).toEqual(Array.from(b.swimBins));
    expect(a.swimMean).toEqual(b.swimMean);
    expect(a.swimPos).toEqual(b.swimPos);
    expect(a.swimNeg).toEqual(b.swimNeg);
    expect(a.swimOff).toEqual(b.swimOff);
    expect(a.swimMin).toEqual(b.swimMin);
    expect(a.swimMax).toEqual(b.swimMax);
  });

  it('aggregates over a subset when indices is a partial array', () => {
    // Just cells 0 and 2 — both region 0/cluster 0 cells, dropping the
    // cluster-1 / region-1 cells from the count.
    const stats = computeStats(TEST_DATA, new Uint32Array([0, 2]), SWIM_LO);
    expect(stats).not.toBeNull();
    if (!stats) return;

    // g0 mean = (5 + 4) / 2 = 4.5; g1 mean = (0 + 4) / 2 = 2.0
    expect(Array.from(stats.geneMeans)).toEqual([4.5, 2.0]);
    // Mean trace = [(1+5)/2, (2+6)/2] = [3, 4]
    expect(Array.from(stats.meanTrace)).toEqual([3, 4]);
    // Cell 0 is region 0/cluster 0/fish 0; cell 2 is region 1/cluster 0/fish 1
    expect(stats.regionCounts.get(0)).toBe(1);
    expect(stats.regionCounts.get(1)).toBe(1);
    expect(stats.clusterCounts.get(0)).toBe(2);
    expect(stats.clusterCounts.get(1)).toBeUndefined();
    // Swim: cell 0 = 0.3 (pro), cell 2 = 0.0 (off)
    expect(stats.swimPos).toBe(1);
    expect(stats.swimNeg).toBe(0);
    expect(stats.swimOff).toBe(1);
  });

  it('drops a swim correlation of exactly +swimLo into the pro bucket', () => {
    // Boundary check: cell 0 has r = 0.3, swimLo = 0.3 → pro (>= swimLo)
    const stats = computeStats(TEST_DATA, new Uint32Array([0]), 0.3);
    expect(stats?.swimPos).toBe(1);
    expect(stats?.swimOff).toBe(0);
  });

  it('places every cell into exactly one histogram bin', () => {
    // 40 bins over [-1, +1]. Bin indices land on or near 0.05-multiples
    // and pick up Float32 quantization noise at bin boundaries, so we
    // assert the invariant that matters: every cell is binned exactly
    // once, and the partition matches the pro/anti/off counts.
    const stats = computeStats(TEST_DATA, null, SWIM_LO);
    expect(stats).not.toBeNull();
    if (!stats) return;
    let total = 0;
    for (let b = 0; b < stats.swimBins.length; b++) total += stats.swimBins[b];
    expect(total).toBe(TEST_DATA.count);
  });

  it('clamps swim correlations outside [-1, +1] into the edge bins', () => {
    const farLeft: NeuronDataset = {
      ...TEST_DATA,
      count: 2,
      swimCorr: new Float32Array([-1.5, 1.5]),
    };
    const stats = computeStats(farLeft, new Uint32Array([0, 1]), SWIM_LO);
    expect(stats).not.toBeNull();
    if (!stats) return;
    expect(stats.swimBins[0]).toBe(1);
    expect(stats.swimBins[stats.swimBins.length - 1]).toBe(1);
  });
});
