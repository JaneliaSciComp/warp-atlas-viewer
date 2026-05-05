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

export interface LoadProgress {
  /** 0..1 fraction of total bytes received. */
  fraction: number;
  /** Bytes received so far. */
  receivedBytes: number;
  /** Total bytes (sum of Content-Length across all binary files). 0 = unknown. */
  totalBytes: number;
}

export type LoadProgressCallback = (p: LoadProgress) => void;

export async function loadNeuronDataset(
  onProgress?: LoadProgressCallback,
): Promise<NeuronDataset> {
  try {
    const res = await fetch(`${PREPROCESSED_BASE}neurons.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    const manifest = (await res.json()) as ManifestV2;
    if (manifest.version !== 2) throw new Error(`unsupported manifest version ${manifest.version}`);
    return await loadFromManifest(manifest, onProgress);
  } catch (err) {
    console.info('[dataLoader] using mock data:', (err as Error).message);
    return generateMockData(10000);
  }
}

/**
 * Stream a binary response, calling `onChunk(deltaBytes)` for each chunk
 * received, then assemble into an ArrayBuffer.
 */
async function streamBin(
  response: Response,
  onChunk: (deltaBytes: number) => void,
): Promise<ArrayBuffer> {
  if (!response.body) {
    // Fallback: no streaming support, just read at once. We can't report
    // intermediate progress but we can at least credit the final size.
    const buf = await response.arrayBuffer();
    onChunk(buf.byteLength);
    return buf;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    onChunk(value.length);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out.buffer;
}

async function loadFromManifest(
  m: ManifestV2,
  onProgress?: LoadProgressCallback,
): Promise<NeuronDataset> {
  console.info(
    `[dataLoader] loading real WARP data: ${m.count} cells, ${m.geneNames.length} genes, ` +
    `${m.clusterNames.length} clusters, ${m.nStimuli} stimuli`,
  );
  const t0 = performance.now();

  // List of binary files we need (skip optional regressors if absent).
  const fileKeys: Array<keyof ManifestV2['files']> = [
    'positions', 'regionIds', 'clusterIds', 'fishIds',
    'geneCounts', 'geneBinary', 'umap', 'stimulusCorr', 'activityTrace',
  ];
  if (m.files.regressors) fileKeys.push('regressors');

  // Kick off all fetches in parallel; once headers arrive we can sum
  // Content-Length to know the grand total.
  const responses = await Promise.all(
    fileKeys.map((k) =>
      fetch(`${PREPROCESSED_BASE}${m.files[k]}`, { cache: 'no-cache' })
        .then((r) => {
          if (!r.ok) throw new Error(`${m.files[k]} ${r.status}`);
          return r;
        }),
    ),
  );
  const totalBytes = responses.reduce(
    (acc, r) => acc + (parseInt(r.headers.get('content-length') ?? '0', 10) || 0),
    0,
  );

  let received = 0;
  const reportProgress = () => {
    if (onProgress) {
      onProgress({
        fraction: totalBytes > 0 ? Math.min(1, received / totalBytes) : 0,
        receivedBytes: received,
        totalBytes,
      });
    }
  };
  reportProgress();

  // Stream each response body, accumulating bytes into the shared
  // counter. All fetches run in parallel.
  const buffers = await Promise.all(
    responses.map((r) =>
      streamBin(r, (delta) => {
        received += delta;
        reportProgress();
      }),
    ),
  );

  const lookup = new Map<string, ArrayBuffer>();
  fileKeys.forEach((k, i) => lookup.set(k, buffers[i]));

  const ds: NeuronDataset = {
    count: m.count,
    positions: new Float32Array(lookup.get('positions')!),
    regionIds: new Int16Array(lookup.get('regionIds')!),
    clusterIds: new Int16Array(lookup.get('clusterIds')!),
    fishIds: new Uint8Array(lookup.get('fishIds')!),
    geneCounts: new Float32Array(lookup.get('geneCounts')!),
    geneBinary: new Uint8Array(lookup.get('geneBinary')!),
    umap: new Float32Array(lookup.get('umap')!),
    stimulusCorr: new Float32Array(lookup.get('stimulusCorr')!),
    activityTrace: new Float32Array(lookup.get('activityTrace')!),
    traceLength: m.traceLength,
    traceSampleRateHz: m.traceSampleRateHz ?? 1.0,
    stimulusWindowsSec: m.stimulusWindowsSec,
    regressors: lookup.has('regressors') ? new Float32Array(lookup.get('regressors')!) : undefined,
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
