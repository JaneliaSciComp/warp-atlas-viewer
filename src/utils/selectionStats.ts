import type { NeuronDataset } from '../data/types';

// Swim-correlation histogram: 40 bins over [-1, +1], used by the Detail
// panel's swim chart. Bin width 0.05.
const SWIM_BINS = 40;
const SWIM_BIN_WIDTH = 2 / SWIM_BINS;

/** Heavy, swimLo-independent aggregation over a cell selection. Every
 *  field here is a function of (dataset, selected indices) only — none
 *  depend on UI settings — so the whole struct can be memoized on the
 *  selection alone and the all-cells variant cached per dataset. */
export interface SelectionStats {
  /** Number of cells aggregated. */
  count: number;
  /** Mean spot count per gene, length geneNames.length. */
  geneMeans: Float32Array;
  /** Mean per-stimulus correlation, length stimulusNames.length. */
  stimulusMeans: Float32Array;
  /** Mean activity trace, length traceLength. */
  meanTrace: Float32Array;
  regionCounts: Map<number, number>;
  atlasRegionCounts: Map<number, number>;
  clusterCounts: Map<number, number>;
  fishCounts: Map<number, number>;
  swimMean: number;
  swimMin: number;
  swimMax: number;
  swimBins: Uint32Array;
  swimBinWidth: number;
}

/** swimLo-dependent partition of the selection by swim-correlation sign.
 *  Split out from SelectionStats because it's the only summary that
 *  reacts to the responsive-floor setting. */
export interface SwimPartition {
  /** Cells with r ≥ +swimLo (swim-driven). */
  swimPos: number;
  /** Cells with r ≤ −swimLo (anti-correlated). */
  swimNeg: number;
  /** Cells inside the deadband |r| < swimLo. */
  swimOff: number;
}

// All-dataset summary cache, keyed by dataset identity. The
// swimLo-independent aggregation over every cell is the single most
// expensive thing the Detail panel does — O(count × (genes + stimuli +
// trace + atlas regions)) over hundreds of thousands of cells with the
// real dataset — and it recurs whenever the selection falls back to "all
// neurons" (clearing a filter, or closing and reopening the panel).
// Computing it once per loaded dataset and reusing the result keeps those
// interactions cheap. A WeakMap lets the entry drop when the dataset is
// garbage-collected.
const allStatsCache = new WeakMap<NeuronDataset, SelectionStats>();

/**
 * Aggregate the swimLo-independent Detail-panel statistics over a
 * selection.
 *
 * `indices === null` is the all-cells sentinel: walk 0..count-1 directly
 * so the caller doesn't allocate a redundant identity buffer for the
 * common "no filter, no selection" view, and cache the result by dataset
 * identity. Returns null for an empty selection.
 */
export function computeSelectionStats(
  data: NeuronDataset,
  indices: Uint32Array | null,
): SelectionStats | null {
  const n = indices === null ? data.count : indices.length;
  if (n === 0) return null;
  if (indices === null) {
    const cached = allStatsCache.get(data);
    if (cached) return cached;
  }

  const G = data.geneNames.length;
  const S = data.stimulusNames.length;
  const T = data.traceLength;
  // Atlas membership is a packed bitfield: 14 bytes / 112 bits per cell
  // in WARP. Derive sizing from the dataset so a future atlas with a
  // different region count still works.
  const A = data.atlasRegionNames.length;
  const atlasBytes = Math.ceil(A / 8);

  const geneMeans = new Float32Array(G);
  const stimulusMeans = new Float32Array(S);
  const meanTrace = new Float32Array(T);
  const regionCounts = new Map<number, number>();
  const atlasRegionCounts = new Map<number, number>();
  const clusterCounts = new Map<number, number>();
  const fishCounts = new Map<number, number>();
  const swimBins = new Uint32Array(SWIM_BINS);
  let swimSum = 0;
  let swimMin = Infinity;
  let swimMax = -Infinity;

  for (let k = 0; k < n; k++) {
    const i = indices === null ? k : indices[k];
    for (let g = 0; g < G; g++) geneMeans[g] += data.geneCounts[i * G + g];
    for (let s = 0; s < S; s++) stimulusMeans[s] += data.stimulusCorr[i * S + s];
    const traceBase = i * T;
    for (let t = 0; t < T; t++) meanTrace[t] += data.activityTrace[traceBase + t];
    const sr = data.swimCorr[i];
    swimSum += sr;
    if (sr < swimMin) swimMin = sr;
    if (sr > swimMax) swimMax = sr;
    // Map [-1, +1] to bin index [0, SWIM_BINS-1]; values outside the
    // range clamp to the edge bins so e.g. r=−1.05 doesn't underflow.
    let bin = Math.floor((sr + 1) / SWIM_BIN_WIDTH);
    if (bin < 0) bin = 0;
    if (bin >= SWIM_BINS) bin = SWIM_BINS - 1;
    swimBins[bin]++;
    inc(regionCounts, data.regionIds[i]);
    inc(clusterCounts, data.clusterIds[i]);
    inc(fishCounts, data.fishIds[i]);
    const atlasBase = i * atlasBytes;
    for (let r = 0; r < A; r++) {
      if ((data.atlasRegionMask[atlasBase + (r >> 3)] >> (r & 7)) & 1) {
        inc(atlasRegionCounts, r);
      }
    }
  }
  const inv = 1 / n;
  for (let g = 0; g < G; g++) geneMeans[g] *= inv;
  for (let s = 0; s < S; s++) stimulusMeans[s] *= inv;
  for (let t = 0; t < T; t++) meanTrace[t] *= inv;

  const stats: SelectionStats = {
    count: n,
    geneMeans,
    stimulusMeans,
    meanTrace,
    regionCounts,
    atlasRegionCounts,
    clusterCounts,
    fishCounts,
    swimMean: swimSum * inv,
    swimMin,
    swimMax,
    swimBins,
    swimBinWidth: SWIM_BIN_WIDTH,
  };
  if (indices === null) allStatsCache.set(data, stats);
  return stats;
}

/**
 * Partition a selection by swim-correlation sign against the responsive
 * floor. O(count) and intentionally separate from computeSelectionStats:
 * it's the only Detail-panel summary that depends on the swimLo setting,
 * so a swimLo slider drag re-runs just this cheap pass instead of the
 * full heavy aggregation. An empty selection yields all-zero counts.
 */
export function computeSwimPartition(
  data: NeuronDataset,
  indices: Uint32Array | null,
  swimLo: number,
): SwimPartition {
  const n = indices === null ? data.count : indices.length;
  let swimPos = 0;
  let swimNeg = 0;
  for (let k = 0; k < n; k++) {
    const i = indices === null ? k : indices[k];
    const sr = data.swimCorr[i];
    if (sr >= swimLo) swimPos++;
    else if (sr <= -swimLo) swimNeg++;
  }
  return { swimPos, swimNeg, swimOff: n - swimPos - swimNeg };
}

function inc<K>(m: Map<K, number>, k: K) {
  m.set(k, (m.get(k) ?? 0) + 1);
}
