export interface NeuronDataset {
  /** Number of neurons. */
  count: number;
  /** Float32Array of length count*3, layout [x0,y0,z0, x1,y1,z1, ...]. Coordinates in atlas space, centered on origin. */
  positions: Float32Array;
  /** Brain region index per neuron (0..nRegions-1). 0 typically means "unassigned to a focal region". */
  regionIds: Int16Array;
  /** Functional cluster id per neuron (0..nClusters-1). */
  clusterIds: Int16Array;
  /** Fish id per neuron (0,1,2 → 59,63,71 in WARP). */
  fishIds: Uint8Array;
  /** Gene expression matrix, length count*nGenes, row-major. Spot counts. */
  geneCounts: Float32Array;
  /** Binary gene expression matrix, same layout as geneCounts. */
  geneBinary: Uint8Array;
  /** UMAP/t-SNE embedding, length count*2. */
  umap: Float32Array;
  /** Per-stimulus correlation coefficient (or activity summary), length count*nStimuli. */
  stimulusCorr: Float32Array;
  /** Single mean activity trace per neuron. Shape count × traceLength, row-major. */
  activityTrace: Float32Array;
  /** Length of each cell's activity trace. */
  traceLength: number;
  /** Sampling rate of activityTrace in Hz (real seconds = sample / rate). */
  traceSampleRateHz: number;
  /** Per-stimulus on-windows, shape nStimuli × 2, [onset_s, offset_s] pairs. */
  stimulusWindowsSec?: Array<[number, number]>;
  /** Optional shared per-stimulus regressors / expected response curves, shape nStimuli × traceLength. */
  regressors?: Float32Array;

  /** Metadata. */
  geneNames: string[];
  regionNames: string[];
  stimulusNames: string[];
  clusterNames: string[];

  /** Bounding box of positions, useful for camera framing. */
  bounds: { min: [number, number, number]; max: [number, number, number] };

  /** Source label, "mock" or "real". */
  source: 'mock' | 'real';
}

export type ColorMode = 'region' | 'gene' | 'cluster' | 'bivariate';
export type GeneScale = 'log' | 'linear';
/** Which sub-filter the Transcriptomics panel exposes. The inactive
 *  sub-filter's index is preserved so the user can flip back to it
 *  without losing the previously picked gene/cluster. */
export type TxMode = 'gene' | 'subtype';

export interface FilterState {
  // ── Colors ────────────────────────────────────────────────────────
  colorMode: ColorMode;
  /** How gene-scheme raw FISH spot counts map to the plasma palette. */
  geneScale: GeneScale;

  // ── Anatomy filter ────────────────────────────────────────────────
  isolatedRegion: number; // index into regionNames, -1 = show all

  // ── Transcriptomics filter ────────────────────────────────────────
  txMode: TxMode;
  /** Always 0..G-1. Persists across txMode flips and "all" picks so
   *  color schemes that read it (gene, bivariate) always have a
   *  meaningful index. */
  selectedGene: number;
  /** When txMode === 'gene' and geneAll is true, the gene predicate
   *  is trivially true (no transcriptomic constraint). Coloring still
   *  uses selectedGene. */
  geneAll: boolean;
  /** When txMode === 'gene' and geneAll is false, controls which
   *  predicate the gene filter uses:
   *    true  → curated binary call (geneBinary[i*G+sel] === 1)
   *    false → any detected expression (geneCounts[i*G+sel] > 0)
   *  The binary call is the dataset's curated, conservative
   *  classification; "any spots" is more permissive and matches the
   *  classic "raw > 0" reading of FISH counts. */
  geneStrict: boolean;
  /** Always 0..C-1. Persists like selectedGene. */
  selectedCluster: number;
  /** Mirror of geneAll for the subtype branch. */
  clusterAll: boolean;

  // ── Activity filter ───────────────────────────────────────────────
  selectedStimulus: number; // index into stimulusNames, persistent
  stimulusAll: boolean;
}

export interface SelectionState {
  /** Indices of selected neurons. Empty = none. */
  indices: Uint32Array;
  /** Whether selection came from 3D viewer, UMAP, or the bottom-panel
   *  filters. Filter-derived selections collapse to 'filter' regardless
   *  of which combination of predicates produced them. */
  source: '3d' | 'umap' | 'filter' | null;
}
