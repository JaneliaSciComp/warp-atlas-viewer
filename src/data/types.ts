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
    /** Pearson correlation between calcium activity and estimated swim power
     *  per cell, length count. Signed: positive = swim-driven, negative =
     *  anti-correlated with swimming. Derived from postprocessed/swim_corr_All. */
    swimCorr: Float32Array;
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
    /** Names of the 112 mapZebrain atlas regions (Modified from Kunst
     *  et al., 2019). Underscores in the source data are rewritten to
     *  spaces for display. Cells can belong to multiple regions (the
     *  atlas is hierarchical: e.g. cerebellum ⊂ rhombencephalon). */
    atlasRegionNames: string[];
    /** Packed bitfield encoding 112-bit per-cell atlas membership.
     *  Layout: 14 bytes (little-endian bits) per cell, row-major.
     *  Decode with `(atlasRegionMask[i*14 + (r>>3)] >> (r&7)) & 1`. */
    atlasRegionMask: Uint8Array;
    stimulusNames: string[];
    clusterNames: string[];

    /** Bounding box of positions, useful for camera framing. */
    bounds: { min: [number, number, number]; max: [number, number, number] };

    /** Source label, "mock" or "real". */
    source: "mock" | "real";
}

export type ColorMode =
    | "highlight"
    | "region"
    | "gene"
    | "stim"
    | "swim"
    | "activity"
    | "fish";
export type RegionPalette = "nipy_spectral" | "turbo" | "distinct";

/** Swim-correlation filter state. Two independent toggles combined with OR:
 *    'off'      → no swim filter (every cell qualifies)
 *    'positive' → cell passes iff swimCorr >=  swimLo  (swim-driven)
 *    'negative' → cell passes iff swimCorr <= -swimLo  (anti-swim)
 *    'both'     → either toggle holds (i.e. |swimCorr| >= swimLo)
 *  The "swim-driven" and "anti-swim" buttons in the SwimCard map a
 *  pair of booleans into one of these four states. */
export type SwimMode = "off" | "positive" | "negative" | "both";
export type GeneScale = "log" | "linear";
/** Which sub-filter the Transcriptomics panel exposes:
 *    'all'     → no transcriptomics filter; gene rows and the cluster
 *                dropdown are hidden, gene-coloring falls back to
 *                richness across the 41-gene panel.
 *    'gene'    → filter by selectedGenes (combined per geneLogic).
 *    'subtype' → filter by selectedCluster.
 *  selectedGenes and selectedCluster persist across mode flips, so
 *  switching modes never loses the user's previous pick. */
export type TxMode = "all" | "gene" | "subtype";

/** Which atlas the Anatomy card's "region" dropdown is currently
 *  reading. The two atlases are alternatives, not stacked filters: at
 *  any moment exactly one of `isolatedRegion` / `isolatedAtlasRegion`
 *  influences rendering, decided by this mode.
 *    'manuscript' → 16 focal regions (paper's Figure 5 / S6 vocabulary),
 *                   reads `isolatedRegion`.
 *    'mapzebrain' → 112-region mapZebrain atlas (Modified from Kunst et
 *                   al., 2019), reads `isolatedAtlasRegion`.
 *  Both index fields persist across mode flips so toggling back
 *  restores the previously picked region in either atlas. */
export type AnatomyAtlas = "manuscript" | "mapzebrain";

/**
 * INVARIANT — visible-state-only rendering:
 *
 * The current rendering must be 100% described by the fields that the
 * user can currently see in the bottom-panel UI. Several fields below
 * (selectedGenes, selectedCluster, selectedStimulus, geneScale,
 * geneLogic, activitySample) PERSIST across UI flips for ergonomics —
 * the user can switch the txMode toggle (All / Gene / Subtype), empty
 * their gene list, or flip the Color scheme away from Activity and
 * back without losing their previous pick. That persistence is fine
 * ONLY as long as those fields don't influence rendering when they're
 * hidden.
 *
 * Rule for any code path that reads one of these fields:
 *   1. Check the visibility predicate first (e.g. for geneLogic:
 *      txMode === 'gene' && selectedGenes.length >= 2). If the field
 *      is hidden, fall back to an explicit alternative — gene scheme
 *      falls back to richness when selectedGenes is empty; stim
 *      scheme falls back to max-across-stimuli when no stim is
 *      selected.
 *   2. The legend must reflect that fallback so the user can read what
 *      the visualization is showing without inspecting state they
 *      can't see.
 *
 * Adding a new code path that reads selectedCluster/selectedStimulus
 * (or geneLogic) outside its visibility window is the bug class to
 * watch for.
 */
export interface FilterState {
    // ── Colors ────────────────────────────────────────────────────────
    colorMode: ColorMode;
    /** How gene-scheme raw FISH spot counts map to the plasma palette. */
    geneScale: GeneScale;
    /** When colorMode === 'region', whether cells in the Unassigned
     *  bucket (regionIds[i] === 0) are rendered at all. Default true.
     *  Turning it off hides the ~28% of cells that fall outside the
     *  16 focal regions so the colored regions read more cleanly.
     *  Has no effect outside region color mode. */
    showUnassignedRegion: boolean;
    /** Categorical palette used by colorMode === 'region'. `nipy_spectral`
     *  preserves the paper-matching legend; `turbo` is a smoother rainbow
     *  alternative sampled in the same anatomical order; `distinct` favors
     *  label separability over ordered-ramp continuity. */
    regionPalette: RegionPalette;

    // ── Anatomy filter ────────────────────────────────────────────────
    /** Which of the two atlases the "region" dropdown reads. See
     *  AnatomyAtlas — at any moment exactly one of isolatedRegion /
     *  isolatedAtlasRegion is active. The other persists for ergonomic
     *  toggle-back but contributes nothing to rendering. */
    anatomyAtlas: AnatomyAtlas;
    isolatedRegion: number; // index into regionNames, -1 = show all
    /** Index into atlasRegionNames (0..111), -1 = show all. Only active
     *  when anatomyAtlas === 'mapzebrain'; persists across mode flips. */
    isolatedAtlasRegion: number;
    /** Fish-of-origin filter: 0..nFish-1 keeps only cells from that
     *  specimen; -1 keeps all (the pooled-atlas default). Mirrors how
     *  the WARP paper's main figures pool all 3 fish but supplements
     *  break out per-fish (Figure S6B). */
    isolatedFish: number;

    // ── Transcriptomics filter ────────────────────────────────────────
    txMode: TxMode;
    /** Indices into geneNames of every gene the user has added to the
     *  gene filter. Sorted, unique. An empty array means "no gene
     *  filter" (every cell qualifies); any non-empty selection is a real
     *  filter combined according to `geneLogic`. The Gene color scheme
     *  reads the same array — empty → richness, single → that gene's
     *  spot count, multiple → driven by settings.geneMultiColor. */
    selectedGenes: number[];
    /** How multi-gene selections combine in the gene filter:
     *    'or'  → cell passes iff it expresses AT LEAST ONE selected gene
     *    'and' → cell passes iff it expresses EVERY selected gene
     *  Whether "expresses" means the paper's binary call or a custom
     *  spot-count threshold is controlled by
     *  `settings.geneThresholdMode`. Only meaningful when
     *  selectedGenes.length >= 2. */
    geneLogic: GeneLogic;
    /** Cluster index this cell is filtered to when txMode === 'subtype'.
     *  Always 0..C-1. Persists across txMode flips so flipping back to
     *  Subtype restores the previously picked cluster. */
    selectedCluster: number;

    // ── Activity filter ───────────────────────────────────────────────
    /** Indices of stimuli the user has toggled ON in the Activity panel.
     *  Sorted, unique. An empty array means no stimulus filter and no
     *  stimulus-scoped coloring. A non-empty selection becomes a real filter
     *  only when `stimMode !== 'off'`; in 'off' mode it only scopes the
     *  Stim color scheme. */
    selectedStimuli: number[];
    /** How multi-stimulus selections combine in the Activity filter:
     *    'or'  → cell passes iff it's stim-correlated to AT LEAST ONE
     *            selected stimulus (above settings.stimLo)
     *    'and' → cell passes iff it's stim-correlated to EVERY selected
     *            stimulus
     *  Only matters when `selectedStimuli.length >= 2` and
     *  `stimMode !== 'off'`. */
    stimLogic: StimLogic;
    /** Which signed band of stimulus correlation the Activity card
     *  keeps. Mirrors SwimMode:
     *    'off'      → no stim correlation filter (every cell qualifies
     *                 regardless of r; selectedStimuli only changes the
     *                 color-mode tint)
     *    'positive' → r ≥ +settings.stimLo (paper's classic "stim-driven")
     *    'negative' → r ≤ -settings.stimLo (anti-correlated cells)
     *    'both'     → |r| ≥ settings.stimLo (union; matches the paper's
     *                 "magnitude" filter)
     *  Default 'off' so selecting stimuli first scopes coloring without
     *  hiding cells. The filter is only evaluated when `selectedStimuli` is
     *  non-empty AND `stimMode !== 'off'`. */
    stimMode: StimMode;

    // ── Swim (behavioral) filter ─────────────────────────────────────
    /** Which signed band of swim-power correlation the swim card keeps.
     *  See SwimMode for the semantics; 'off' (default) is the unfiltered
     *  state. The threshold is `settings.swimLo` (symmetric for the
     *  negative side). */
    swimMode: SwimMode;

    // ── Activity color scheme ────────────────────────────────────────
    /** Sample index into activityTrace for the Activity color scheme.
     *  0..traceLength-1. Only influences rendering when
     *  colorMode === 'activity' — persists across color-mode flips so
     *  flipping back restores the previous scrub position. Same
     *  visible-state-only invariant as selectedCluster. */
    activitySample: number;
}

export type StimLogic = "or" | "and";
export type StimMode = "off" | "positive" | "negative" | "both";
export type GeneLogic = "or" | "and";
export type GeneMultiColor = "max" | "sum" | "richness";
export type GeneThresholdMode = "paper" | "global";
/** Projection mode for the 3D point cloud. 'off' renders cells as usual.
 *  The other modes render an off-screen reduction along the view ray and
 *  display that image, so deep cells aren't occluded by shallow ones:
 *    'max'  → per-pixel maximum intensity (MIP).
 *    'min'  → per-pixel minimum intensity (DRR-style darkfield).
 *    'mean' → intensity-weighted average color across all cells touching
 *             the pixel (additive sum / count).
 *    'sum'  → integrated signal: additive accumulation of color ×
 *             intensity with no divide, clamped to the display range.
 *             Pairs naturally with max
 *             for sparse-signal schemes (gene/activity) where mean
 *             washes out bright cells with the dim majority.
 *  "Intensity" is the per-cell scheme magnitude (gene/activity v,
 *  |r| for stim/swim, 1 for categorical, 0 for ghosts). */
export type ProjectionMode = "off" | "max" | "min" | "mean" | "sum";

/** User-tunable rendering parameters that aren't filters per se —
 *  e.g. the calcium-imaging thresholds that anchor the Stim color
 *  scheme and the activity filter. Lives in its own state slot
 *  (separate from FilterState) so "reset filters" doesn't clobber it
 *  and the Settings tab has a clean home for its controls. */
export interface SettingsState {
    /** Below this correlation magnitude, cells are "non-responsive" and
     *  map to the neutral midpoint in the Stim scheme; the Activity filter
     *  also requires a cell to exceed this floor for at least one selected
     *  stimulus in the enabled sign band. Default
     *  0.13 — the paper's full-vector responsive threshold (the 90th
     *  percentile per-stimulus, averaged, rounded). */
    stimLo: number;
    /** Above this correlation magnitude, the Stim scheme's divergent
     *  palette is saturated. Default 0.30 — roughly the 99th percentile of the
     *  cycle-wide stimulus-correlation distribution. */
    stimHi: number;
    /** Upper anchor for the Gene scheme's plasma palette (raw FISH spot
     *  count). Cells expressing more than this saturate at the bright
     *  end. Different probes / datasets have different practical
     *  ceilings; 1000 is a sensible default. */
    geneMaxSpots: number;
    /** Which spot-count threshold the gene filter (and the "richness"
     *  multi-gene color mode) uses to decide whether a cell "expresses"
     *  a given gene:
     *    'paper'  → curated binary call (geneBinary[i*G+g] === 1) — the
     *               paper's per-gene cutoffs.
     *    'global' → geneCounts[i*G+g] >= settings.geneThresholdGlobal,
     *               applied uniformly to every gene. Lets the user dial
     *               in their own cutoff (e.g. 1 for "any detected").
     *  Default 'paper' so the viewer mirrors the manuscript by default. */
    geneThresholdMode: GeneThresholdMode;
    /** Global spot-count cutoff used when `geneThresholdMode === 'global'`.
     *  Single integer applied across the whole gene panel. Default 25 —
     *  the paper's minimum default threshold. Ignored in 'paper' mode. */
    geneThresholdGlobal: number;
    /** When 2+ genes are selected, what the Gene color scheme paints by:
     *    'max'      → max spot count across the selected genes (mirror
     *                 of stim coloring; the default)
     *    'sum'      → sum of spot counts; emphasises cells that express
     *                 multiple selected markers strongly
     *    'richness' → how many of the selected genes are "on" per the
     *                 same predicate the filter uses (paper binary call
     *                 or count ≥ geneThresholdGlobal); ranges 0..N
     *  Single-gene coloring and richness over the full panel are
     *  unaffected by this setting. */
    geneMultiColor: GeneMultiColor;
    /** Base 3D point size (pixels) used when `autoSizing` is off.
     *  When auto is on the renderer derives its base size from the
     *  canvas height instead, and the in-set boost from
     *  `scaleByFilterCount` (also gated on auto) multiplies on top
     *  for active cells. The t-SNE panel has its own size
     *  (`umapPointSize`). */
    pointSize: number;
    /** Base point size (pixels) for the t-SNE scatter. Independent of
     *  the 3D viewer's `pointSize` because t-SNE points sit at fixed
     *  pixel size (no perspective falloff) and the dot field is much
     *  denser per cell. */
    umapPointSize: number;
    /** Ghost-cell visibility for the t-SNE scatter, 0..1. Independent
     *  of the 3D viewer's `ghostIntensity` so the two views can be tuned
     *  separately — t-SNE points are denser and a lower value typically
     *  reads better. */
    umapGhostIntensity: number;
    /** Enables a screen-space ambient occlusion post-process on the 3D
     *  point-cloud viewer. The pass darkens nearby overlapping cells and
     *  creases so the brain volume reads with more depth cues. */
    ambientOcclusion: boolean;
    /** Strength of the ambient occlusion multiplier, 0..0.4. Values up to
     *  ~0.15 are intended to read as natural depth shading; higher values
     *  are available for stronger/stylized screenshot contrast. */
    ambientOcclusionIntensity: number;
    /** Screen-space sampling radius in pixels for ambient occlusion.
     *  Lower values keep shadows tight around local overlaps; higher
     *  values create broader depth shading across dense neighborhoods. */
    ambientOcclusionRadius: number;
    /** Scatter opacity override. When true, foreground / in-filter cells
     *  are rendered fully opaque in both the 3D and t-SNE views so active
     *  populations read clearly; ghost/out-of-filter cells remain dimmed
     *  by ghostIntensity. */
    opaqueActiveCells: boolean;
    /** Additive brightness lift applied to active (in-set) cells in
     *  both the 3D and t-SNE views, range 0..0.4. Default 0.1. Lifts
     *  each channel by `b` and clamps at 1, so a small value makes
     *  colors visibly brighter without changing hue much. The color
     *  legend swatches/gradients receive the same lift so they stay in
     *  sync with the rendered cells. Ghost cells (out-of-filter /
     *  out-of-selection) are not lifted — their DIM_RGB stays as
     *  designed. */
    activeBrightness: number;
    /** Lower anchor for the Activity scheme's plasma palette (ΔF/F).
     *  Cells with traces below this map to the dark end. Default 0 — the
     *  baseline; values <0 would mean the user wants negative deflections
     *  to fall off the dark end too. */
    activityLo: number;
    /** Upper anchor for the Activity scheme's plasma palette (ΔF/F).
     *  Cells with traces ≥ this saturate at the bright end. Default 1.5
     *  is a typical strong-response ΔF/F for this dataset's traces; tune
     *  if probes / preprocessing change the dynamic range. */
    activityHi: number;
    /** Magnitude floor for the swim-correlation filter and the dim end of
     *  the swim color ramp. Symmetric: 'positive' mode keeps r ≥ +swimLo,
     *  'negative' mode keeps r ≤ −swimLo. Default 0.10 — the paper's
     *  swim-correlation cutoff (page 12: R>0.1 / R<-0.1 are the swim-
     *  related thresholds). */
    swimLo: number;
    /** Saturation anchor for the swim color ramp. |r| ≥ swimHi clamps to
     *  the ramp end. Default 0.35 — roughly the 95th percentile of
     *  positive swim correlations in WARP. */
    swimHi: number;
    /** Visibility of out-of-filter cells (ghosts), 0..1, used when
     *  `autoSizing` is off. When auto is on the renderer derives a
     *  ghost-visibility value from the canvas height via a negative-
     *  exponential curve instead, so this slider is hidden.
     *  0 → cells are invisible (alpha 0) and the click pickers skip
     *      them entirely.
     *  1 → cells render at the standard dim alpha (matches the
     *      pre-ghost behaviour) and are fully pickable.
     *  Intermediate values linearly scale alpha and point size; the
     *  pickers re-enable above the midpoint so users only catch
     *  clicks on cells that are genuinely visible enough to aim at. */
    ghostIntensity: number;
    /** When true, the 3D viewer auto-derives base point size and
     *  ghost visibility from the canvas height instead of reading them
     *  from `pointSize` and `ghostIntensity`. The t-SNE panel has no
     *  equivalent (its canvas size is fixed; it uses its own
     *  `umapPointSize` / `umapGhostIntensity`). */
    autoSizing: boolean;
    /** When true (and `autoSizing` is also true), active in-set cells
     *  receive an additional 1×–2× point-size boost that ramps with
     *  how tightly the filter narrows — small filtered sets get
     *  bigger active dots, the full population stays at 1×. Ghost
     *  cells and ghost visibility are not affected. Gated on
     *  `autoSizing` because the boost layers on top of the canvas-
     *  height base; with auto off the setting is hidden. See
     *  applyColoring for the lerp endpoints. */
    scaleByFilterCount: boolean;
    /** When true, the swim + stim divergent color modes scale alpha by
     *  |r| so cells near the neutral midpoint fade into the background
     *  instead of competing with the colored extremes (coolwarm's
     *  near-white midpoint blooms on a dark background at full opacity).
     *  When false, every in-set cell renders at full alpha regardless
     *  of correlation magnitude. */
    fadeWeakCorrelation: boolean;
    /** When true (default), right-mouse drag pans the viewport in screen
     *  space while the orbit target stays locked at the volume center —
     *  so rotation always pivots around the volume regardless of pan.
     *  When false, right-mouse drag uses TrackballControls' native pan
     *  (moves the orbit target with the camera), and rotation pivots
     *  around the panned target instead of the volume. */
    objectCentricRotation: boolean;
    /** Rotation / pan / zoom inertia after releasing the mouse, 0..1.
     *  0 → no momentum (motion stops the instant the drag ends).
     *  1 → maximum momentum (slowest decay).
     *  Default 0.9 ≈ TrackballControls' dynamicDampingFactor 0.1, the
     *  original feel. Internally drives `staticMoving` (at 0) and
     *  `dynamicDampingFactor = max(0.05, 1 - rotationMomentum)`. */
    rotationMomentum: number;
    /** When true (default), every 3D point sprite shrinks with distance
     *  from the camera via the `160/dist` falloff — the familiar
     *  perspective-shrunk look. When false, every shader (normal cell
     *  render, projection visible pass, projection picker, focus-ring
     *  marker, ambient-occlusion depth/normal pass) drops the falloff
     *  and renders at a constant on-screen size, scaled by 0.4 to
     *  compensate for the auto-sizing curve being tuned for the
     *  attenuated case. Disabling this is the MIP-style "see through
     *  the volume" convention — deep cells contribute equally to the
     *  visible image. Independent of projectionMode, so it can be
     *  combined with any of them or used on its own in normal
     *  rendering. */
    scaleByDepth: boolean;
    /** Per-pixel projection of the point cloud, viewed from the camera.
     *  When not 'off', the 3D viewer renders into an off-screen target
     *  and composites a per-pixel reduction (max/min/mean) of in-set
     *  cell intensities. Lets deep cells punch through dense surface
     *  layers (the same intuition as a max-intensity projection in
     *  volume rendering). Ambient occlusion and the focused-neuron
     *  ring marker are disabled while projection is active. */
    projectionMode: ProjectionMode;
    /** Minimum per-cell projection intensity included in the projection
     *  pass, 0..1. Raising this culls weak/noisy cells before max/min,
     *  mean, sum, and projection picking run. Default 0.05. */
    projectionIntensityFloor: number;
    /** Exposure multiplier applied to Sum projection's accumulated
     *  color × intensity before clamping to display range. Lower values
     *  reduce saturation in dense activity views; higher values boost
     *  weak integrated signal. Default 1.0. */
    projectionSumExposure: number;
    /** Developer toggle. When true, the 3D viewer renders a small
     *  diagnostic overlay (canvas size, in-set count, computed point
     *  size + ghost visibility, etc.) so the auto / scale-by-filter
     *  math is inspectable while tuning. */
    debugMode: boolean;
}

export const DEFAULT_SETTINGS: SettingsState = {
    stimLo: 0.13,
    stimHi: 0.3,
    geneMaxSpots: 1000,
    geneThresholdMode: "paper",
    geneThresholdGlobal: 25,
    geneMultiColor: "max",
    pointSize: 10,
    umapPointSize: 11,
    umapGhostIntensity: 0.25,
    ambientOcclusion: false,
    ambientOcclusionIntensity: 0.1,
    ambientOcclusionRadius: 8,
    opaqueActiveCells: false,
    activeBrightness: 0.1,
    activityLo: 0.0,
    activityHi: 1.5,
    swimLo: 0.1,
    swimHi: 0.35,
    ghostIntensity: 0.6,
    autoSizing: true,
    scaleByFilterCount: true,
    fadeWeakCorrelation: true,
    objectCentricRotation: true,
    rotationMomentum: 0.9,
    scaleByDepth: true,
    projectionMode: "off",
    projectionIntensityFloor: 0.05,
    projectionSumExposure: 1.0,
    debugMode: false,
};

export interface SelectionState {
    /** Indices of selected neurons. Empty = none. */
    indices: Uint32Array;
    /** Whether selection came from 3D viewer, UMAP, the bottom-panel
     *  filters, or the all-cells fallback used when nothing is
     *  filtered/selected. Filter-derived selections collapse to 'filter'
     *  regardless of which combination of predicates produced them. */
    source: "3d" | "umap" | "filter" | "all" | null;
}
