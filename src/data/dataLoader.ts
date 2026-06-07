import type { NeuronDataset } from './types';
import { generateMockData } from './mockData';

export interface ManifestV3 {
  version: 3;
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
  /** 112 mapZebrain atlas region names (Modified from Kunst et al., 2019). */
  atlasRegionNames: string[];
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
    atlasRegionMask: string;
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

const MOCK_CELL_COUNT = 10000;

/** Mock mode is an explicit demo-only opt-in via `?mock=1`. It is never a
 *  fallback: without it, any failure to load real preprocessed data
 *  surfaces as an error rather than silently substituting a synthetic
 *  atlas — a fake-looking-real atlas is dangerous in a viewer used to
 *  draw scientific conclusions. Pure + exported so the gate is testable. */
export function isMockRequested(locationSearch: string): boolean {
  return new URLSearchParams(locationSearch).has('mock');
}

/** Parse + validate the manifest JSON. Guards that it's an object and the
 *  expected version before the field-level checks in validateManifest, so
 *  a stale/garbage manifest fails with a clear message instead of throwing
 *  obscurely while constructing typed arrays. */
export function parseManifest(raw: unknown): ManifestV3 {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      `manifest must be a JSON object (got ${raw === null ? 'null' : typeof raw}). ` +
        `Re-run scripts/preprocess.py to regenerate ${PREPROCESSED_BASE}neurons.json.`,
    );
  }
  const m = raw as ManifestV3;
  if (m.version !== 3) {
    throw new Error(
      `unsupported manifest version ${m.version} (expected 3). ` +
        `Re-run scripts/preprocess.py to regenerate ${PREPROCESSED_BASE}.`,
    );
  }
  validateManifest(m);
  return m;
}

export async function loadNeuronDataset(
  onProgress?: LoadProgressCallback,
): Promise<NeuronDataset> {
  if (typeof window !== 'undefined' && isMockRequested(window.location.search)) {
    console.info(
      `[dataLoader] ?mock=1 set, generating synthetic ${MOCK_CELL_COUNT / 1000}k-cell dataset`,
    );
    return generateMockData(MOCK_CELL_COUNT);
  }
  const res = await fetch(`${PREPROCESSED_BASE}neurons.json`, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(
      `manifest fetch failed (HTTP ${res.status}). ` +
        `Run scripts/preprocess.py to generate ${PREPROCESSED_BASE}neurons.json, ` +
        `or append ?mock=1 to the URL to load a synthetic demo atlas.`,
    );
  }
  const manifest = parseManifest(await res.json());
  return await loadFromManifest(manifest, onProgress);
}

// Binary files required for every manifest. Optional regressors are
// appended by binaryFileKeys only when the manifest declares them.
const BINARY_FILE_KEYS: ReadonlyArray<keyof ManifestV3['files']> = [
  'positions', 'regionIds', 'clusterIds', 'fishIds',
  'geneCounts', 'geneBinary', 'umap', 'stimulusCorr', 'swimCorr',
  'activityTrace', 'atlasRegionMask',
];

/** Binary file keys to fetch for this manifest (skips optional
 *  regressors when absent). */
export function binaryFileKeys(m: ManifestV3): Array<keyof ManifestV3['files']> {
  return m.files.regressors ? [...BINARY_FILE_KEYS, 'regressors'] : [...BINARY_FILE_KEYS];
}

/** Sanity-check manifest scalars and metadata. Everything downstream
 *  assumes these are well-formed (counts drive typed-array sizes, bounds
 *  drive camera framing, quant drives trace decoding), so catching
 *  malformed values here saves a forensic dive later. */
export function validateManifest(m: ManifestV3): void {
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
  if (!Array.isArray(m.atlasRegionNames) || m.atlasRegionNames.length === 0) {
    throw new Error('manifest.atlasRegionNames must be a non-empty array');
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
export function expectedBytes(
  key: keyof ManifestV3['files'],
  m: ManifestV3,
): number {
  const C = m.count;
  const G = m.geneNames.length;
  const S = m.nStimuli;
  const T = m.traceLength;
  const Abytes = Math.ceil(m.atlasRegionNames.length / 8);
  switch (key) {
    case 'positions':       return C * 3 * 4; // float32
    case 'regionIds':       return C * 2;     // int16
    case 'clusterIds':      return C * 2;     // int16
    case 'fishIds':         return C;         // uint8
    case 'geneCounts':      return C * G * 4; // float32
    case 'geneBinary':      return C * G;     // uint8
    case 'umap':            return C * 2 * 4; // float32
    case 'stimulusCorr':    return C * S * 4; // float32
    case 'swimCorr':        return C * 4;     // float32
    case 'activityTrace':   return C * T * 2; // uint16
    case 'atlasRegionMask': return C * Abytes; // packed bitfield
    case 'regressors':      return S * T * 4; // float32, NOT per-cell
  }
}

export function validateBuffer(
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
 * Stream a binary response and return the decoded bytes. `onChunk` is
 * called incrementally with decoded byte deltas — never compressed
 * deltas — so a progress bar that sums onChunk reaches the manifest's
 * expectedBytes total regardless of whether the server gzipped.
 *
 * Why the magic-byte sniff: GitHub Pages and S3 serve `.gz` files
 * opaquely (no Content-Encoding), so fetch hands us raw gzip bytes and
 * we have to decompress in JS. Vite dev sets Content-Encoding: gzip on
 * the same files, so the browser already decompressed and we'd
 * double-decode without this check. Reading the first chunk and
 * checking for `1f 8b` distinguishes the two without trusting either
 * the URL suffix or browser-specific header visibility.
 */
async function streamBin(
  response: Response,
  onChunk: (deltaBytes: number) => void,
): Promise<ArrayBuffer> {
  if (!response.body) {
    // No streaming reader — fall back to one-shot arrayBuffer, sniff,
    // decompress if needed, then credit the full decoded size once.
    const buf = await response.arrayBuffer();
    const u = new Uint8Array(buf);
    const isGzipped = u.length >= 2 && u[0] === 0x1f && u[1] === 0x8b;
    if (!isGzipped) {
      onChunk(u.byteLength);
      return buf;
    }
    const ds = new DecompressionStream('gzip');
    const decoded = await new Response(new Blob([u]).stream().pipeThrough(ds)).arrayBuffer();
    onChunk(decoded.byteLength);
    return decoded;
  }
  const reader = response.body.getReader();
  // Peek the first non-empty chunk to detect gzip framing, then build a
  // ReadableStream that re-emits the peeked chunk followed by the rest
  // of the underlying reader. This way we can optionally interpose
  // DecompressionStream without buffering the whole response first.
  let firstChunk: Uint8Array | undefined;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    if (r.value && r.value.length > 0) {
      firstChunk = r.value;
      break;
    }
  }
  const isGzipped =
    !!firstChunk && firstChunk.length >= 2 && firstChunk[0] === 0x1f && firstChunk[1] === 0x8b;
  let body: ReadableStream<Uint8Array> = new ReadableStream({
    start(controller) {
      if (firstChunk) controller.enqueue(firstChunk);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else if (value && value.length > 0) controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  if (isGzipped) {
    body = body.pipeThrough(
      new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
    );
  }
  // Read decoded chunks, crediting onChunk in decoded byte units.
  const decodedReader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await decodedReader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    onChunk(value.length);
  }
  const out = new Uint8Array(total) as Uint8Array<ArrayBuffer>;
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

/**
 * Construct the in-memory dataset from already-fetched binary buffers.
 *
 * Validates every buffer's byte length against what the manifest implies
 * BEFORE constructing typed arrays on top of it — a wrong size here is the
 * single most common way for the viewer to render real-looking but wrong
 * data, so fail loudly with the specific file. Separated from the fetch
 * path so it can be exercised without a network round-trip.
 */
export function buildDataset(
  m: ManifestV3,
  buffers: Map<keyof ManifestV3['files'], ArrayBuffer>,
): NeuronDataset {
  const get = (k: keyof ManifestV3['files']): ArrayBuffer => {
    const buf = buffers.get(k);
    if (!buf) throw new Error(`missing binary buffer for ${k} (${m.files[k]})`);
    validateBuffer(m.files[k]!, buf, expectedBytes(k, m));
    return buf;
  };
  return {
    count: m.count,
    positions: new Float32Array(get('positions')),
    regionIds: new Int16Array(get('regionIds')),
    clusterIds: new Int16Array(get('clusterIds')),
    fishIds: new Uint8Array(get('fishIds')),
    geneCounts: new Float32Array(get('geneCounts')),
    geneBinary: new Uint8Array(get('geneBinary')),
    umap: new Float32Array(get('umap')),
    stimulusCorr: new Float32Array(get('stimulusCorr')),
    swimCorr: new Float32Array(get('swimCorr')),
    activityTrace: decodeActivityTrace(get('activityTrace'), m.activityTraceQuant),
    traceLength: m.traceLength,
    traceSampleRateHz: m.traceSampleRateHz ?? 1.0,
    stimulusWindowsSec: m.stimulusWindowsSec,
    regressors: m.files.regressors ? new Float32Array(get('regressors')) : undefined,
    atlasRegionMask: new Uint8Array(get('atlasRegionMask')),
    atlasRegionNames: m.atlasRegionNames,
    geneNames: m.geneNames,
    regionNames: m.regionNames,
    stimulusNames: m.stimulusNames,
    clusterNames: m.clusterNames,
    bounds: m.bounds,
    source: 'real',
  };
}

async function loadFromManifest(
  m: ManifestV3,
  onProgress?: LoadProgressCallback,
): Promise<NeuronDataset> {
  console.info(
    `[dataLoader] loading real WARP data: ${m.count} cells, ${m.geneNames.length} genes, ` +
    `${m.clusterNames.length} clusters, ${m.nStimuli} stimuli`,
  );
  const t0 = performance.now();

  const fileKeys = binaryFileKeys(m);

  // Total = sum of decoded (raw) file sizes from the manifest. Content-
  // Length would report compressed bytes on prod and (depending on the
  // server) either compressed or decoded on dev — using expectedBytes
  // makes the progress bar denominator match the decoded byte stream
  // streamBin emits, on any server.
  const totalBytes = fileKeys.reduce((acc, k) => acc + expectedBytes(k, m), 0);
  // Kick off all fetches in parallel.
  const responses = await Promise.all(
    fileKeys.map((k) =>
      fetch(`${PREPROCESSED_BASE}${m.files[k]}`, { cache: 'no-cache' })
        .then((r) => {
          if (!r.ok) throw new Error(`${m.files[k]} ${r.status}`);
          return r;
        }),
    ),
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
  // counter. All fetches run in parallel. streamBin auto-detects gzip
  // via magic bytes so a server that serves .gz opaquely (GitHub Pages,
  // S3) and one that auto-decodes (vite dev) both work without flags.
  const buffers = await Promise.all(
    responses.map((r) =>
      streamBin(r, (delta) => {
        received += delta;
        reportProgress();
      }),
    ),
  );

  const lookup = new Map<keyof ManifestV3['files'], ArrayBuffer>();
  fileKeys.forEach((k, i) => lookup.set(k, buffers[i]));

  // Validate buffer lengths and construct the typed arrays.
  const ds = buildDataset(m, lookup);
  const dt = performance.now() - t0;
  console.info(`[dataLoader] loaded in ${(dt / 1000).toFixed(1)}s`);
  return ds;
}
