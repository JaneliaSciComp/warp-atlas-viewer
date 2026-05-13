import type { NeuronDataset } from './types';
import { generateMockData } from './mockData';

interface ManifestV2 {
  version: 2;
  count: number;
  traceLength: number;
  traceSampleRateHz?: number;
  /** activityTrace.bin holds affine-quantized uint16 indices: each
   *  sample decodes as `lo + index * (hi - lo) / 65535`. */
  activityTraceQuant: { lo: number; hi: number };
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
    swimCorr: string;
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
  validateManifest(manifest);
  return await loadFromManifest(manifest, onProgress);
}

/** Sanity-check manifest scalars and metadata. Everything downstream
 *  assumes these are well-formed (counts drive typed-array sizes, bounds
 *  drive camera framing, quant drives trace decoding), so catching
 *  malformed values here saves a forensic dive later. */
function validateManifest(m: ManifestV2): void {
  const posInt = (name: string, v: unknown) => {
    if (!Number.isInteger(v) || (v as number) <= 0) {
      throw new Error(`manifest.${name} must be a positive integer (got ${JSON.stringify(v)})`);
    }
  };
  posInt('count', m.count);
  posInt('traceLength', m.traceLength);
  posInt('nStimuli', m.nStimuli);
  if (!Array.isArray(m.geneNames) || m.geneNames.length === 0) {
    throw new Error('manifest.geneNames must be a non-empty array');
  }
  if (!Array.isArray(m.stimulusNames) || m.stimulusNames.length !== m.nStimuli) {
    throw new Error(
      `manifest.stimulusNames.length (${m.stimulusNames?.length}) must equal nStimuli (${m.nStimuli})`,
    );
  }
  if (!Array.isArray(m.regionNames) || m.regionNames.length === 0) {
    throw new Error('manifest.regionNames must be a non-empty array');
  }
  if (!Array.isArray(m.clusterNames) || m.clusterNames.length === 0) {
    throw new Error('manifest.clusterNames must be a non-empty array');
  }
  for (const k of ['min', 'max'] as const) {
    const v = m.bounds?.[k];
    if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) {
      throw new Error(
        `manifest.bounds.${k} must be three finite numbers (got ${JSON.stringify(v)})`,
      );
    }
  }
  if (!m.activityTraceQuant) {
    throw new Error('manifest.activityTraceQuant is required');
  }
  const { lo, hi } = m.activityTraceQuant;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new Error(
      `manifest.activityTraceQuant.{lo,hi} must be finite (got lo=${lo}, hi=${hi})`,
    );
  }
  if (hi <= lo) {
    throw new Error(`manifest.activityTraceQuant.hi (${hi}) must be > lo (${lo})`);
  }
}

/** Expected byte length for each binary file, derived from manifest
 *  scalars. Anything that doesn't match exactly indicates the file is
 *  truncated, has the wrong dtype, or was paired with the wrong manifest
 *  — all of which would otherwise silently produce mis-shaped typed
 *  arrays that read past valid data or NaN downstream. */
function expectedBytes(
  key: keyof ManifestV2['files'],
  m: ManifestV2,
): number {
  const C = m.count;
  const G = m.geneNames.length;
  const S = m.nStimuli;
  const T = m.traceLength;
  switch (key) {
    case 'positions':     return C * 3 * 4; // float32
    case 'regionIds':     return C * 2;     // int16
    case 'clusterIds':    return C * 2;     // int16
    case 'fishIds':       return C;         // uint8
    case 'geneCounts':    return C * G * 4; // float32
    case 'geneBinary':    return C * G;     // uint8
    case 'umap':          return C * 2 * 4; // float32
    case 'stimulusCorr':  return C * S * 4; // float32
    case 'swimCorr':      return C * 4;     // float32
    case 'activityTrace': return C * T * 2; // uint16
    case 'regressors':    return S * T * 4; // float32, NOT per-cell
  }
}

function validateBuffer(
  fileName: string,
  buf: ArrayBuffer,
  expected: number,
): void {
  if (buf.byteLength !== expected) {
    throw new Error(
      `${fileName}: expected ${expected} bytes, got ${buf.byteLength}. ` +
        `Likely cause: stale manifest paired with new binaries, a truncated ` +
        `upload, or a wrong-dtype export. Re-run scripts/preprocess.py.`,
    );
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

/** Decode the activityTrace buffer: the wire format is uint16 indices
 *  affine-quantized as `lo + idx * (hi - lo) / 65535`. Downstream code
 *  consumes Float32Array so call sites don't need to know about the
 *  wire format. */
function decodeActivityTrace(
  buf: ArrayBuffer,
  quant: { lo: number; hi: number },
): Float32Array {
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
    'geneCounts', 'geneBinary', 'umap', 'stimulusCorr', 'swimCorr',
    'activityTrace',
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

  // Validate every fetched buffer's byte length against what the manifest
  // implies BEFORE constructing typed arrays on top of it. A wrong size
  // here is the single most common way for the viewer to render real-
  // looking but wrong data, so fail loudly with the specific file.
  for (const k of fileKeys) {
    validateBuffer(m.files[k]!, lookup.get(k)!, expectedBytes(k, m));
  }

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
    swimCorr: new Float32Array(lookup.get('swimCorr')!),
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
