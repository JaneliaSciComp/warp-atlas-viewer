import type { NeuronDataset } from './types';
import {
  GENE_NAMES,
  REGION_NAMES,
  STIMULUS_NAMES,
  N_GENES,
  N_REGIONS,
  N_STIMULI,
  MOCK_N_CLUSTERS,
} from '../utils/constants';

// Seedable PRNG so mock data is deterministic across reloads.
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const TIMEPOINTS = 268;

export function generateMockData(n: number = 10000): NeuronDataset {
  const rand = mulberry32(42);
  const randn = () => {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const positions = new Float32Array(n * 3);
  const regionIds = new Int16Array(n);
  const clusterIds = new Int16Array(n);
  const fishIds = new Uint8Array(n);
  const geneCounts = new Float32Array(n * N_GENES);
  const geneBinary = new Uint8Array(n * N_GENES);
  const umap = new Float32Array(n * 2);
  const stimulusCorr = new Float32Array(n * N_STIMULI);
  const swimCorr = new Float32Array(n);
  const activityTrace = new Float32Array(n * TIMEPOINTS);

  // Brain shape: ellipsoid.
  const AP = 600;
  const ML = 300;
  const DV = 200;

  const clusterCenters: Array<{
    x: number; y: number; z: number;
    region: number;
    geneSig: number[];
    stimSig: number[];
    swimSig: number;
  }> = [];
  for (let c = 0; c < MOCK_N_CLUSTERS; c++) {
    const region = Math.floor(rand() * N_REGIONS);
    const apFrac = (region + 0.5) / N_REGIONS;
    clusterCenters.push({
      x: apFrac * AP + (rand() - 0.5) * 80,
      y: ML * 0.5 + (rand() - 0.5) * ML * 0.6,
      z: DV * 0.5 + (rand() - 0.5) * DV * 0.6,
      region,
      geneSig: pickK(N_GENES, 2 + Math.floor(rand() * 4), rand),
      stimSig: Array.from({ length: N_STIMULI }, () => rand() * 0.9 - 0.1),
      swimSig: (rand() - 0.5) * 0.8,
    });
  }

  for (let i = 0; i < n; i++) {
    const cid = Math.floor(rand() * MOCK_N_CLUSTERS);
    const c = clusterCenters[cid];
    clusterIds[i] = cid;
    regionIds[i] = c.region;
    fishIds[i] = i % 3;

    const dx = randn() * 30;
    const dy = randn() * 25;
    const dz = randn() * 18;
    positions[i * 3] = c.x + dx;
    positions[i * 3 + 1] = c.y + dy;
    positions[i * 3 + 2] = c.z + dz;

    for (let g = 0; g < N_GENES; g++) {
      const inSig = c.geneSig.includes(g);
      const p = inSig ? 0.85 : 0.04;
      if (rand() < p) {
        const lambda = inSig ? 6 : 1.5;
        const k = poisson(lambda, rand);
        geneCounts[i * N_GENES + g] = k;
        geneBinary[i * N_GENES + g] = k > 0 ? 1 : 0;
      }
    }

    // Per-cell trace: gaussian bumps at each stimulus onset, scaled by the
    // cluster's per-stimulus signature, plus a slow carrier and noise.
    for (let s = 0; s < N_STIMULI; s++) {
      stimulusCorr[i * N_STIMULI + s] = c.stimSig[s] + randn() * 0.05;
    }
    swimCorr[i] = c.swimSig + randn() * 0.08;
    const phase = cid * 0.3;
    for (let t = 0; t < TIMEPOINTS; t++) {
      const x = t / TIMEPOINTS;
      let y = 0;
      for (let s = 0; s < N_STIMULI; s++) {
        const center = (s + 0.5) / N_STIMULI;
        y += c.stimSig[s] * Math.exp(-Math.pow((x - center) / 0.04, 2));
      }
      const carrier = 0.15 * Math.sin(2 * Math.PI * (x * 3 + phase));
      activityTrace[i * TIMEPOINTS + t] = y + carrier + randn() * 0.04;
    }

    const angle = (cid / MOCK_N_CLUSTERS) * Math.PI * 2;
    const r = 4 + (cid % 5);
    umap[i * 2] = Math.cos(angle) * r + randn() * 0.6;
    umap[i * 2 + 1] = Math.sin(angle) * r + randn() * 0.6;
  }

  // Center positions on origin.
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i * 3 + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  for (let i = 0; i < n; i++) {
    positions[i * 3] -= cx;
    positions[i * 3 + 1] -= cy;
    positions[i * 3 + 2] -= cz;
  }

  // Mock per-stimulus regressors: simple gaussians at each stimulus onset.
  const regressors = new Float32Array(N_STIMULI * TIMEPOINTS);
  for (let s = 0; s < N_STIMULI; s++) {
    const center = (s + 0.5) / N_STIMULI;
    for (let t = 0; t < TIMEPOINTS; t++) {
      const x = t / TIMEPOINTS;
      regressors[s * TIMEPOINTS + t] = Math.exp(-Math.pow((x - center) / 0.04, 2));
    }
  }

  return {
    count: n,
    positions,
    regionIds,
    clusterIds,
    fishIds,
    geneCounts,
    geneBinary,
    umap,
    stimulusCorr,
    swimCorr,
    activityTrace,
    traceLength: TIMEPOINTS,
    traceSampleRateHz: 1.0,
    stimulusWindowsSec: Array.from({ length: N_STIMULI }, (_, s) => {
      const center = ((s + 0.5) / N_STIMULI) * TIMEPOINTS;
      return [center - 4, center + 4] as [number, number];
    }),
    regressors,
    geneNames: [...GENE_NAMES],
    regionNames: [...REGION_NAMES],
    stimulusNames: [...STIMULUS_NAMES],
    clusterNames: Array.from({ length: MOCK_N_CLUSTERS }, (_, i) => `cluster_${i.toString().padStart(3, '0')}`),
    bounds: {
      min: [min[0] - cx, min[1] - cy, min[2] - cz],
      max: [max[0] - cx, max[1] - cy, max[2] - cz],
    },
    source: 'mock',
  };
}

function poisson(lambda: number, rand: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  while (true) {
    k += 1;
    p *= rand();
    if (p <= L) return k - 1;
    if (k > 200) return k - 1;
  }
}

function pickK(n: number, k: number, rand: () => number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, k).sort((a, b) => a - b);
}
