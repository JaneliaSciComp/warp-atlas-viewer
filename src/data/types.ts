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

export type ColorMode = 'highlight' | 'region' | 'gene' | 'stim';
export type GeneScale = 'log' | 'linear';
/** Which sub-filter the Transcriptomics panel exposes. The inactive
 *  sub-filter's index is preserved so the user can flip back to it
 *  without losing the previously picked gene/cluster. */
export type TxMode = 'gene' | 'subtype';

/**
 * INVARIANT — visible-state-only rendering:
 *
 * The current rendering must be 100% described by the fields that the
 * user can currently see in the bottom-panel UI. Several fields below
 * (selectedGene, selectedCluster, selectedStimulus, geneScale,
 * geneStrict) PERSIST across UI flips for ergonomics — when the user
 * toggles between Single-gene/Subtype or "all"/specific, we keep their
 * prior pick so they don't lose it. That persistence is fine ONLY as
 * long as those fields don't influence rendering when they're hidden.
 *
 * Rule for any code path that reads one of these fields:
 *   1. Check the visibility predicate first (e.g. for selectedGene:
 *      txMode === 'gene' && !geneAll). If the field is hidden, fall
 *      back to an explicit alternative — gene scheme falls back to
 *      richness; stim scheme falls back to max-across-stimuli.
 *   2. The legend must reflect that fallback so the user can read what
 *      the visualization is showing without inspecting state they
 *      can't see.
 *
 * Adding a new code path that reads selectedGene/Cluster/Stimulus
 * outside its visibility window is the bug class to watch for.
 */
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
   *  color schemes that read it always have a meaningful index. */
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
  /** Indices of stimuli the user has toggled ON in the Activity panel.
   *  Sorted, unique. An empty array means "no activity filter"
   *  (every cell qualifies); any non-empty selection is a real
   *  filter combined according to `stimLogic`. The Stim color scheme
   *  reads the same array — empty/full → max across every stimulus,
   *  otherwise max across the selected. */
  selectedStimuli: number[];
  /** How multi-stimulus selections combine in the Activity filter:
   *    'or'  → cell passes iff it's stim-correlated to AT LEAST ONE
   *            selected stimulus (above settings.stimLo)
   *    'and' → cell passes iff it's stim-correlated to EVERY selected
   *            stimulus
   *  Only matters when `selectedStimuli.length >= 2`. */
  stimLogic: StimLogic;
}

export type StimLogic = 'or' | 'and';

/** User-tunable rendering parameters that aren't filters per se —
 *  e.g. the calcium-imaging thresholds that anchor the Stim color
 *  scheme and the activity filter. Lives in its own state slot
 *  (separate from FilterState) so "reset filters" doesn't clobber it
 *  and the Settings tab has a clean home for its controls. */
export interface SettingsState {
  /** Below this correlation, cells are "non-responsive" and dimmed
   *  by the Stim scheme; the Activity filter also requires a cell to
   *  exceed this floor for at least one selected stimulus. Default
   *  0.30 — the conventional zebrafish-imaging responsive floor. */
  stimLo: number;
  /** Above this correlation, the Stim scheme's plasma palette is
   *  saturated. Default 0.65 — roughly the 97th percentile of
   *  positive correlations in typical datasets. */
  stimHi: number;
  /** Upper anchor for the Gene scheme's plasma palette (raw FISH spot
   *  count). Cells expressing more than this saturate at the bright
   *  end. Different probes / datasets have different practical
   *  ceilings; 1000 is a sensible default. */
  geneMaxSpots: number;
  /** Base 3D point size (pixels) for every cell, used by both the 3D
   *  viewer and the t-SNE scatter. Display-density preference; raise
   *  on high-DPI screens or when cells look too small. */
  pointSize: number;
  /** Whether the user can pan (translate) the 3D camera. When false,
   *  the orbit target stays locked at the volume center so rotation
   *  always pivots around the volume's own axes. */
  enablePan: boolean;
}

export const DEFAULT_SETTINGS: SettingsState = {
  stimLo: 0.30,
  stimHi: 0.65,
  geneMaxSpots: 1000,
  pointSize: 8.5,
  enablePan: false,
};

export interface SelectionState {
  /** Indices of selected neurons. Empty = none. */
  indices: Uint32Array;
  /** Whether selection came from 3D viewer, UMAP, or the bottom-panel
   *  filters. Filter-derived selections collapse to 'filter' regardless
   *  of which combination of predicates produced them. */
  source: '3d' | 'umap' | 'filter' | null;
}
