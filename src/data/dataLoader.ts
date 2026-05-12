import type { NeuronDataset } from './types';
import { generateMockData } from './mockData';

interface ManifestV2 {
  version: 2;
  count: number;
  traceLength: number;
  traceSampleRateHz?: number;
  /** When present, activityTrace.bin holds affine-quantized uint16
   *  indices: value = lo + index * (hi - lo) / 65535. When absent the
   *  file is raw float32 (legacy preprocess output). */
  activityTraceQuant?: { lo: number; hi: number };
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
  // Explicit demo-mode opt-in. Without ?mock=1, any failure to load real
  // preprocessed data surfaces as an error rather than silently substituting
  // a synthetic atlas — a fake-looking-real atlas is dangerous in a viewer
  // that's used to draw scientific conclusions.
  if (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('mock')
  ) {
    console.info('[dataLoader] ?mock=1 set, generating synthetic 10k-cell dataset');
    return generateMockData(10000);
  }
  const res = await fetch(`${PREPROCESSED_BASE}neurons.json`, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(
      `manifest fetch failed (HTTP ${res.status}). ` +
        `Run scripts/preprocess.py to generate ${PREPROCESSED_BASE}neurons.json, ` +
        `or append ?mock=1 to the URL to load a synthetic demo atlas.`,
    );
  }
  const manifest = (await res.json()) as ManifestV2;
  if (manifest.version !== 2) {
    throw new Error(`unsupported manifest version ${manifest.version} (expected 2)`);
  }
  return await loadFromManifest(manifest, onProgress);
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

/** Decode the activityTrace buffer. When the manifest carries
 *  scale-offset quant metadata, treat the buffer as uint16 indices and
 *  expand into a Float32Array (lo + idx * step). Otherwise the buffer
 *  is already float32. Downstream code consumes Float32Array either
 *  way so call sites don't need to know about the wire format. */
function decodeActivityTrace(
  buf: ArrayBuffer,
  quant: { lo: number; hi: number } | undefined,
): Float32Array {
  if (!quant) return new Float32Array(buf);
  const q = new Uint16Array(buf);
  const out = new Float32Array(q.length);
  const lo = quant.lo;
  const step = (quant.hi - quant.lo) / 65535;
  for (let i = 0; i < q.length; i++) out[i] = lo + q[i] * step;
  return out;
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
    activityTrace: decodeActivityTrace(lookup.get('activityTrace')!, m.activityTraceQuant),
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
