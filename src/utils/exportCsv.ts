import type { NeuronDataset } from '../data/types';

export interface ExportOptions {
  /** When true, append 134 trace columns (`dff_t0` … `dff_tN-1`) with
   *  the per-cell mean ΔF/F trace. Default false — see the Exporting
   *  Cells doc for why this is opt-in. */
  includeActivityTrace?: boolean;
}

/** Build a CSV row by row, one cell per row. `indices` controls scope:
 *  - a non-empty Uint32Array exports those cell ids in the given order;
 *  - `null` exports every cell in the dataset.
 *
 *  Floats are formatted to fixed decimals to keep file size manageable
 *  while preserving meaningful precision (coords to 2 places ≈ 0.01 μm
 *  in mapZebrain units; correlations to 3 places ≈ ±0.001 — well below
 *  per-cell noise floors). Spot counts stay integer-formatted.
 *
 *  Column layout (kept stable across releases so downstream parsers can
 *  hard-code positions if they need to):
 *
 *    cell_id, x, y, z, tsne_x, tsne_y, fish,
 *    manuscript_region, mapzebrain_regions, cluster,
 *    gene_<g0>, gene_<g1>, …,
 *    corr_<s0>, corr_<s1>, …,
 *    swim_corr,
 *    [dff_t0, dff_t1, …, dff_t<T-1>]  // only when includeActivityTrace
 *
 *  Coordinates are the viewer's frame: `(x, y, z)` after the
 *  preprocessor's axis reorder, mean-centering, and AP flip, so they
 *  match what the user sees on screen. The dialog explains this. */
export function buildCsv(
  ds: NeuronDataset,
  indices: Uint32Array | null,
  options: ExportOptions = {},
): string {
  const includeTrace = options.includeActivityTrace === true;
  const G = ds.geneNames.length;
  const S = ds.stimulusNames.length;
  const T = ds.traceLength;
  const A = ds.atlasRegionNames.length;
  const atlasBytes = Math.ceil(A / 8);

  const header: string[] = [
    'cell_id',
    'x', 'y', 'z',
    'tsne_x', 'tsne_y',
    'fish',
    'manuscript_region',
    'mapzebrain_regions',
    'cluster',
    ...ds.geneNames.map((g) => `gene_${g}`),
    ...ds.stimulusNames.map((s) => `corr_${s}`),
    'swim_corr',
    ...(includeTrace ? Array.from({ length: T }, (_, t) => `dff_t${t}`) : []),
  ];

  const lines: string[] = [header.join(',')];
  const n = indices === null ? ds.count : indices.length;
  for (let k = 0; k < n; k++) {
    const i = indices === null ? k : indices[k];
    const row: string[] = [];
    row.push(String(i));
    row.push(f2(ds.positions[i * 3]));
    row.push(f2(ds.positions[i * 3 + 1]));
    row.push(f2(ds.positions[i * 3 + 2]));
    row.push(f2(ds.umap[i * 2]));
    row.push(f2(ds.umap[i * 2 + 1]));
    row.push(String(ds.fishIds[i] + 1));
    row.push(csvEscape(ds.regionNames[ds.regionIds[i]] ?? ''));
    row.push(csvEscape(atlasMembershipNames(ds, i, atlasBytes).join(';')));
    row.push(csvEscape(ds.clusterNames[ds.clusterIds[i]] ?? ''));
    for (let g = 0; g < G; g++) {
      // Spot counts are stored as float32 but are integer-valued in
      // the pipeline; format without decimals.
      row.push(String(ds.geneCounts[i * G + g] | 0));
    }
    for (let s = 0; s < S; s++) {
      row.push(f3(ds.stimulusCorr[i * S + s]));
    }
    row.push(f3(ds.swimCorr[i]));
    if (includeTrace) {
      const traceBase = i * T;
      for (let t = 0; t < T; t++) {
        row.push(f3(ds.activityTrace[traceBase + t]));
      }
    }
    lines.push(row.join(','));
  }
  // Trailing newline so the file ends "clean" — some CSV parsers
  // complain about missing terminators on the last record.
  return lines.join('\n') + '\n';
}

function atlasMembershipNames(
  ds: NeuronDataset,
  i: number,
  atlasBytes: number,
): string[] {
  const A = ds.atlasRegionNames.length;
  const base = i * atlasBytes;
  const out: string[] = [];
  for (let r = 0; r < A; r++) {
    if ((ds.atlasRegionMask[base + (r >> 3)] >> (r & 7)) & 1) {
      out.push(ds.atlasRegionNames[r]);
    }
  }
  return out;
}

function f2(v: number): string {
  return v.toFixed(2);
}
function f3(v: number): string {
  return v.toFixed(3);
}

/** RFC-4180 minimal escape: if the value contains a comma, quote, or
 *  newline, wrap it in double quotes and double any embedded quotes.
 *  Cluster names (e.g. `pou4f2_cckb`) and mapZebrain region names
 *  (cleaned underscores → spaces) don't currently need this, but
 *  defending against future name drift is cheap. */
export function csvEscape(v: string): string {
  if (v.length === 0) return '';
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

/** Build a deterministic filename: `warp-export-YYYYMMDD-HHMMSS-Ncells.csv`.
 *  Time component is local-time, no timezone suffix — matches how
 *  desktop tools generally name screenshots / exports. */
export function buildFilename(rowCount: number, now: Date = new Date()): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `warp-export-${y}${mo}${d}-${h}${mi}${s}-${rowCount}cells.csv`;
}

/** Coarse byte-size estimate for the dialog's preview text. We don't
 *  build the whole CSV up front (could be hundreds of MB at the full
 *  cohort) — instead estimate from the first ~256 cells and scale. */
export function estimateCsvBytes(
  ds: NeuronDataset,
  rowCount: number,
  options: ExportOptions = {},
): number {
  if (rowCount === 0 || ds.count === 0) return 0;
  // Cap the sample to what the dataset actually has — the estimator can
  // be asked about a hypothetical export size larger than the dataset
  // (e.g. mid-load), and walking past the end would NaN through f2().
  const sampleN = Math.min(256, rowCount, ds.count);
  const sampleIndices = new Uint32Array(sampleN);
  for (let k = 0; k < sampleN; k++) sampleIndices[k] = k;
  const sample = buildCsv(ds, sampleIndices, options);
  // Subtract the header line so the per-row scaling is fair.
  const headerLen = sample.indexOf('\n') + 1;
  const bodyLen = sample.length - headerLen;
  return headerLen + Math.round((bodyLen / sampleN) * rowCount);
}

/** Trigger a download for the given content via an in-DOM anchor. The
 *  Blob URL is revoked after the click handler returns so the GC can
 *  reclaim the buffer once the download starts. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // requestAnimationFrame: give the browser a tick to start the
  // download before we yank the URL out from under it.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
