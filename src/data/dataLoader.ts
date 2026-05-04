import type { NeuronDataset } from './types';
import { generateMockData } from './mockData';

interface ManifestV2 {
  version: 2;
  count: number;
  traceLength: number;
  traceSampleRateHz?: number;
  stimulusWindowsSec?: Array<[number, number]>;
  nStimuli: number;
  geneNames: string[];
  regionNames: string[];
  stimulusNames: string[];
  clusterNames: string[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  files: {
    positions: string;
    regionIds: string;
    clusterIds: string;
    fishIds: string;
    geneCounts: string;
    geneBinary: string;
    umap: string;
    stimulusCorr: string;
    activityTrace: string;
    regressors?: string;
  };
}

const PREPROCESSED_BASE = './preprocessed/';

export async function loadNeuronDataset(): Promise<NeuronDataset> {
  try {
    const res = await fetch(`${PREPROCESSED_BASE}neurons.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    const manifest = (await res.json()) as ManifestV2;
    if (manifest.version !== 2) throw new Error(`unsupported manifest version ${manifest.version}`);
    return await loadFromManifest(manifest);
  } catch (err) {
    console.info('[dataLoader] using mock data:', (err as Error).message);
    return generateMockData(10000);
  }
}

async function fetchBin(name: string): Promise<ArrayBuffer> {
  const r = await fetch(`${PREPROCESSED_BASE}${name}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${name} ${r.status}`);
  return await r.arrayBuffer();
}

async function loadFromManifest(m: ManifestV2): Promise<NeuronDataset> {
  console.info(
    `[dataLoader] loading real WARP data: ${m.count} cells, ${m.geneNames.length} genes, ` +
    `${m.clusterNames.length} clusters, ${m.nStimuli} stimuli`,
  );
  const t0 = performance.now();

  const [
    positionsBuf, regionIdsBuf, clusterIdsBuf, fishIdsBuf,
    geneCountsBuf, geneBinaryBuf, umapBuf, stimulusCorrBuf, activityTraceBuf,
    regressorsBuf,
  ] = await Promise.all([
    fetchBin(m.files.positions),
    fetchBin(m.files.regionIds),
    fetchBin(m.files.clusterIds),
    fetchBin(m.files.fishIds),
    fetchBin(m.files.geneCounts),
    fetchBin(m.files.geneBinary),
    fetchBin(m.files.umap),
    fetchBin(m.files.stimulusCorr),
    fetchBin(m.files.activityTrace),
    m.files.regressors ? fetchBin(m.files.regressors) : Promise.resolve(null),
  ]);

  const ds: NeuronDataset = {
    count: m.count,
    positions: new Float32Array(positionsBuf),
    regionIds: new Int16Array(regionIdsBuf),
    clusterIds: new Int16Array(clusterIdsBuf),
    fishIds: new Uint8Array(fishIdsBuf),
    geneCounts: new Float32Array(geneCountsBuf),
    geneBinary: new Uint8Array(geneBinaryBuf),
    umap: new Float32Array(umapBuf),
    stimulusCorr: new Float32Array(stimulusCorrBuf),
    activityTrace: new Float32Array(activityTraceBuf),
    traceLength: m.traceLength,
    traceSampleRateHz: m.traceSampleRateHz ?? 1.0,
    stimulusWindowsSec: m.stimulusWindowsSec,
    regressors: regressorsBuf ? new Float32Array(regressorsBuf) : undefined,
    geneNames: m.geneNames,
    regionNames: m.regionNames,
    stimulusNames: m.stimulusNames,
    clusterNames: m.clusterNames,
    bounds: m.bounds,
    source: 'real',
  };
  const dt = performance.now() - t0;
  console.info(`[dataLoader] loaded in ${(dt / 1000).toFixed(1)}s`);
  return ds;
}
