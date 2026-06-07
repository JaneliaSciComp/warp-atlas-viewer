import type { NeuronDataset, FilterState, SelectionState, SettingsState } from '../data/types';
import { regionColor, fishColor, plasma, coolwarm } from './colorMaps';

const DIM_RGB: [number, number, number] = [0.30, 0.30, 0.32];
const DIM_ALPHA = 0.22;
const LIFT_ALPHA = 0.50;
// Point-size floor for fully-ghosted cells. ghostIntensity (0..1)
// scales alpha linearly from 0 → DIM_ALPHA / LIFT_ALPHA and size from
// this floor → 1.0 ×. Keeps cells from blooming when they're already
// near-invisible — a smaller dot leaves more pixels clean.
const GHOST_SIZE_FLOOR = 0.20;
// Minimum alpha for cells at the neutral midpoint of the divergent
// stim / swim color ramps when fadeWeakCorrelation is enabled. Keeps
// near-zero-correlation cells faintly visible without letting them
// bloom into the foreground at full opacity.
const FADE_FLOOR = 0.12;

// Stim correlation thresholds, the gene plasma ceiling, and the base
// point size all live in SettingsState (see types.ts:DEFAULT_SETTINGS)
// so the user can tune them from the Settings tab.

export interface ColoringResult {
  colors: Float32Array; // length n*3
  alphas: Float32Array; // length n
  sizes: Float32Array; // length n
  /** Per-cell projection intensity in [0, 1] — the underlying scheme
   *  scalar, NOT the display alpha. Stim/swim use magnitude |r| past
   *  the deadband regardless of fadeWeakCorrelation; gene/activity
   *  use the same v that drives the plasma ramp; categorical schemes
   *  are not projectable but still carry 1.0 for in-set, 0 for ghosts.
   *  Read by the 3D viewer as a projection threshold/mask; the t-SNE
   *  panel and the normal 3D pass do not consume this. */
  intensities: Float32Array; // length n
  /** Raw scientific scalar represented by the active color scheme:
   *  gene spot count/richness, activity ΔF/F, signed stim correlation,
   *  or signed swim correlation. Categorical schemes store NaN. This is
   *  kept separate from `intensities`, which is the normalized magnitude
   *  used by the current projection renderer. */
  scalarValues: Float32Array; // length n
}

export function allocColoring(n: number): ColoringResult {
  return {
    colors: new Float32Array(n * 3),
    alphas: new Float32Array(n),
    sizes: new Float32Array(n),
    intensities: new Float32Array(n),
    scalarValues: new Float32Array(n),
  };
}

interface ColoringStats {
  /** Number of renderable cells in the active filter intersection. Drives
   *  the "cells visible" readout, so visual styling controls (fade weak
   *  correlations, ghost visibility, active selection dimming, opacity
   *  overrides) do not change the count unless they are actual filters. */
  visibleCount: number;
  /** Indices of cells in the filter intersection — populated only when
   *  at least one filter dimension is active. Empty means the active
   *  filters matched zero cells; null means there are no active filters.
   *  Used as the filter-derived fallback selection when the user hasn't
   *  lassoed anything. */
  filterSelection: Uint32Array | null;
  /** Permutation of [0..count-1] partitioned so out-of-filter cells
   *  come first and in-filter cells come last. Renderers iterate
   *  (or use as an index buffer) so in-set cells composite over the
   *  dim haze regardless of source order or true 3D depth. Null when
   *  no filter is active (every cell is in-set, no reorder needed). */
  drawOrder: Uint32Array | null;
  /** Base 3D point size — auto-derived from canvas height via a
   *  negative-exponential curve (≈2 px at h=100, ≈9 px at h=600,
   *  ≈17 px at h=1500, asymptote ~32 px) when autoSizing is on, else
   *  settings.pointSize. This is the un-boosted value: ghost cells
   *  shrink relative to it, but it does NOT include the scale-by-
   *  filter in-set boost. Use this for any code that needs to mirror
   *  the renderer's ghost-size math (e.g. applySelectionAsFilterGhost). */
  basePointSize: number;
  /** Point size actually used for active (in-set) cells during this
   *  paint pass. Equals basePointSize when scale-by-filter is off,
   *  otherwise basePointSize × inSetBoost (boost ∈ [1×, 2×], rises as
   *  the filter narrows). Picker / marker geometry should use this so
   *  they stay in step with the rendered active cell size. */
  effectivePointSize: number;
  /** Ghost visibility (0..1) — auto-derived from canvas height via a
   *  skewed-logistic peak when autoSizing is on (floored at 0.5,
   *  rising past h≈200, peaking around h≈800–1000 near 0.83, dipping
   *  back toward 0.5 past h≈1400), else settings.ghostIntensity.
   *  Drives both the per-cell ghost alpha and the ghost size shrink
   *  in applyColoring. */
  effectiveGhostIntensity: number;
}

/** Per-cell predicate evaluator. Bundled together so the same logic
 *  drives both `applyColoring` and the filter→selection effect in
 *  App.tsx, guaranteeing the visualization and the derived selection
 *  always agree on what's "in set". */
interface CellPredicates {
  /** Whether the cell is in the isolated region (or no region is isolated). */
  inRegion: boolean;
  /** Whether the cell passes the active gene/cluster filter. Always
   *  true when txMode is 'all', or when in Gene mode with no genes
   *  pinned. */
  passesTx: boolean;
  /** Whether the cell passes the active stimulus filter. */
  passesStim: boolean;
  /** Whether the cell passes the active swim-correlation filter. True
   *  when swimMode === 'off'. */
  passesSwim: boolean;
}

/** Decode bit `r` of cell `i`'s packed atlas-region membership row.
 *  Layout: `nBytes` bytes per cell, bits little-endian within each byte.
 *  nBytes is `ceil(atlasRegionNames.length / 8)` — derived per call so
 *  this stays correct if a future dataset ships a different region count. */
export function cellInAtlasRegion(
  ds: NeuronDataset,
  i: number,
  r: number,
): boolean {
  const nBytes = Math.ceil(ds.atlasRegionNames.length / 8);
  return ((ds.atlasRegionMask[i * nBytes + (r >> 3)] >> (r & 7)) & 1) === 1;
}

export function cellPasses(
  ds: NeuronDataset,
  filter: FilterState,
  settings: SettingsState,
  i: number,
): CellPredicates {
  const G = ds.geneNames.length;
  const S = ds.stimulusNames.length;

  // Anatomy filter folds region AND fish-of-origin into the same
  // predicate slot — both are "which subset of the atlas's pooled
  // cells do you want to keep" controls that the user picks in the
  // Anatomy card.
  const useAtlas = filter.anatomyAtlas === 'mapzebrain';
  const inRegion =
    (useAtlas
      ? filter.isolatedAtlasRegion < 0 ||
        cellInAtlasRegion(ds, i, filter.isolatedAtlasRegion)
      : filter.isolatedRegion < 0 || ds.regionIds[i] === filter.isolatedRegion) &&
    (filter.isolatedFish < 0 || ds.fishIds[i] === filter.isolatedFish);

  const genes = filter.selectedGenes;
  const geneActive = filter.txMode === 'gene' && genes.length > 0;
  const clusterActive = filter.txMode === 'subtype';
  let passesTx = true;
  if (geneActive) {
    const usePaper = settings.geneThresholdMode === 'paper';
    const globalThr = settings.geneThresholdGlobal;
    const hit = (g: number) =>
      usePaper ? ds.geneBinary[i * G + g] === 1 : ds.geneCounts[i * G + g] >= globalThr;
    if (filter.geneLogic === 'and') {
      passesTx = true;
      for (let k = 0; k < genes.length; k++) {
        if (!hit(genes[k])) { passesTx = false; break; }
      }
    } else {
      passesTx = false;
      for (let k = 0; k < genes.length; k++) {
        if (hit(genes[k])) { passesTx = true; break; }
      }
    }
  } else if (clusterActive) {
    passesTx = ds.clusterIds[i] === filter.selectedCluster;
  }

  // Activity filter: an empty selection OR stimMode 'off' means "don't
  // filter by activity at all". Otherwise we check each selected
  // stimulus's r against the configured band:
  //   positive → r ≥ +stimLo, negative → r ≤ -stimLo, both → |r| ≥ stimLo
  // and combine across stimuli per stimLogic.
  const stims = filter.selectedStimuli;
  const stimActive = stims.length > 0 && filter.stimMode !== 'off';
  let passesStim = true;
  if (stimActive) {
    const lo = Math.max(0, settings.stimLo);
    const mode = filter.stimMode;
    const check = (r: number): boolean => {
      if (mode === 'positive') return r >= lo;
      if (mode === 'negative') return r <= -lo;
      return r >= lo || r <= -lo; // 'both'
    };
    if (filter.stimLogic === 'and') {
      for (let k = 0; k < stims.length; k++) {
        if (!check(ds.stimulusCorr[i * S + stims[k]])) { passesStim = false; break; }
      }
    } else {
      passesStim = false;
      for (let k = 0; k < stims.length; k++) {
        if (check(ds.stimulusCorr[i * S + stims[k]])) { passesStim = true; break; }
      }
    }
  }

  // Swim filter: behavioral regressor, signed. 'positive' keeps cells
  // whose calcium activity tracks swim power (r ≥ +swimLo); 'negative'
  // keeps anti-correlated cells (r ≤ −swimLo); 'both' is the union; 'off'
  // (default) leaves everything in.
  let passesSwim = true;
  if (filter.swimMode !== 'off') {
    const r = ds.swimCorr[i];
    const lo = settings.swimLo;
    switch (filter.swimMode) {
      case 'positive': passesSwim = r >=  lo; break;
      case 'negative': passesSwim = r <= -lo; break;
      case 'both':     passesSwim = r >=  lo || r <= -lo; break;
    }
  }

  return { inRegion, passesTx, passesStim, passesSwim };
}

function hidesUnassignedRegion(filter: FilterState): boolean {
  return filter.colorMode === 'region' && !filter.showUnassignedRegion;
}

/** True iff cell `i` should be drawn and interacted with under the
 *  current visibility gates. */
export function cellIsRenderable(
  ds: NeuronDataset,
  filter: FilterState,
  i: number,
): boolean {
  return !(hidesUnassignedRegion(filter) && ds.regionIds[i] === 0);
}

/** True iff cell `i` is inside the intersection of every active filter
 *  and visibility gate. */
export function cellInSet(
  ds: NeuronDataset,
  filter: FilterState,
  settings: SettingsState,
  i: number,
): boolean {
  const p = cellPasses(ds, filter, settings, i);
  return cellIsRenderable(ds, filter, i) && p.inRegion && p.passesTx && p.passesStim && p.passesSwim;
}

/** True iff at least one filter dimension is constraining. Selected stimuli
 *  only constrain when the stimulus mode is not "no filter"; otherwise they
 *  scope Stim correlation coloring without changing visibility. Region's
 *  hide-unassigned toggle is treated as an active visibility gate so derived
 *  selections only cover cells that are actually shown. */
export function anyFilterActive(ds: NeuronDataset, filter: FilterState): boolean {
  const stimsActive = filter.selectedStimuli.length > 0 && filter.stimMode !== 'off';
  const useAtlas = filter.anatomyAtlas === 'mapzebrain';
  return (
    (useAtlas ? filter.isolatedAtlasRegion >= 0 : filter.isolatedRegion >= 0) ||
    filter.isolatedFish >= 0 ||
    (filter.txMode === 'gene' && filter.selectedGenes.length > 0) ||
    filter.txMode === 'subtype' ||
    stimsActive ||
    filter.swimMode !== 'off' ||
    hidesUnassignedRegion(filter)
  );
}

/**
 * Write per-neuron color/alpha/size into the supplied buffers, in-place.
 * Caller is expected to flag the corresponding BufferAttribute as needsUpdate.
 *
 * Single pass over all neurons so we can scale to ~274k points without
 * allocating per-neuron objects.
 *
 * Composition model: each non-color filter (anatomy, transcriptomics,
 * activity) contributes a per-cell predicate. A cell is "in set" iff it
 * passes all of them. In-set cells get the chosen color scheme; out-of-set
 * cells get a two-tier dim — full background unless a region is isolated
 * AND the cell is inside it, in which case it lifts to anatomical-context
 * gray so the region's outline reads through the foreground signal.
 */
// Auto-mode anchors (3D viewer point density). Both signals key off
// canvas *height* — the brain fills the viewport vertically, so width
// changes don't affect on-screen brain size.
//
//   pointSize(h) = AUTO_POINT_M - AUTO_POINT_C · exp(-AUTO_POINT_K · h)
// Negative-exponential approach to an asymptote, fit to anchors
// (100,2), (300,6), (600,9), (1000,13), (1500,17) within ~1 px;
// approaches ~32 px far above the realistic viewport range.
//
//   ghost(h) = 0.5 + AUTO_GHOST_A · σ((h - AUTO_GHOST_HUP) / AUTO_GHOST_SUP)
//                  · σ((AUTO_GHOST_HDN - h) / AUTO_GHOST_SDN)
// Product of a rising and a falling logistic — a smooth peak shape
// with separately tunable rise/fall widths. Fits anchors (150,0.50),
// (200,0.60), (300,0.70), (500,0.75), (800,0.80), (1000,0.85),
// (1200,0.75), (1381,0.65) with RMSE ~0.03. Peak sits in the
// 800–1000 band; the curve dips back below the plateau past h≈1200
// and is clamped to [0.50, 1.00] so very tall or very short canvases
// don't fall below the floor.
const AUTO_POINT_M = 32.22;
const AUTO_POINT_C = 31.10;
const AUTO_POINT_K = 0.000481;
const AUTO_GHOST_A = 0.319;
const AUTO_GHOST_HUP = 285;
const AUTO_GHOST_SUP = 101.8;
const AUTO_GHOST_HDN = 1364;
const AUTO_GHOST_SDN = 97.3;
const AUTO_GHOST_MIN = 0.5;
const AUTO_GHOST_MAX = 1.0;
// In-set boost (scale-by-filter): in-set point size is multiplied by
// (2 - tFilter), so 50 cells → 2×, all cells → 1×. Ghost cells get no
// boost — scale-by-filter is purely an active-cell emphasis knob.
const IN_SET_BOOST_MIN = 1.0;
const IN_SET_BOOST_MAX = 2.0;

export function applyColoring(
  ds: NeuronDataset,
  filter: FilterState,
  settings: SettingsState,
  selection: SelectionState,
  canvasHeight: number,
  out: ColoringResult,
): ColoringStats {
  const { count, regionIds, fishIds, clusterIds, geneCounts, geneBinary, stimulusCorr, swimCorr, activityTrace, traceLength } = ds;
  const { colors, alphas, sizes, intensities, scalarValues } = out;
  const G = ds.geneNames.length;
  const S = ds.stimulusNames.length;
  // Activity scheme: clamp the URL-restored sample index into the
  // valid range so a stale share link from a different dataset can't
  // index out-of-bounds. Anchors come from settings; clamp the divisor
  // so a transient hi <= lo (user dragging sliders past each other)
  // doesn't divide by zero.
  const activitySample = Math.max(0, Math.min(traceLength - 1, filter.activitySample | 0));
  const ACTIVITY_LO = settings.activityLo;
  const ACTIVITY_HI = settings.activityHi;
  const activityRange = Math.max(0.001, ACTIVITY_HI - ACTIVITY_LO);

  const useLog = filter.geneScale !== 'linear';
  // Mirror the active-atlas gate from the hot-loop hoist below: when
  // the mapZebrain atlas is selected, the manuscript region filter is
  // dormant and shouldn't trigger LIFT_ALPHA either.
  const isolatedRegion =
    filter.anatomyAtlas === 'mapzebrain' ? -1 : filter.isolatedRegion;
  // Stim cutoffs come from user settings; STIM_RANGE is derived. We
  // tolerate stimHi <= stimLo by clamping the divisor to something
  // small but positive so the ramp still maps without dividing by zero.
  const stimLo = Math.max(0, settings.stimLo);
  // Saturation anchors. With split saturation off both signs share the
  // unified stimHi (symmetric ramp); on, each side uses its own endpoint
  // so the positive-skewed distribution doesn't force one sign to wash
  // out (see SettingsState.stimSplitSaturation).
  const stimHi = Math.max(
    stimLo + 0.001,
    settings.stimSplitSaturation ? settings.stimHiPos : settings.stimHi,
  );
  const stimHiNeg = settings.stimSplitSaturation
    ? Math.max(stimLo + 0.001, settings.stimHiNeg)
    : stimHi;
  // Swim coloring anchors: symmetric around 0. Below |r| = swimLo the
  // cell maps to the neutral midpoint of the divergent ramp; above
  // |r| = swimHi it saturates at the corresponding end. Clamp the divisor
  // so swimHi <= swimLo (transient slider state) doesn't divide by zero.
  const swimLoSetting = Math.max(0, settings.swimLo);
  const swimHi = Math.max(swimLoSetting + 0.001, settings.swimHi);
  const swimRange = Math.max(0.001, swimHi - swimLoSetting);
  // Gene scheme anchors and the per-cell base size also come from
  // settings.
  const geneMaxSpots = Math.max(1, settings.geneMaxSpots);
  const geneLogDen = Math.log(1 + geneMaxSpots);
  // baseSize and ghostIntensity become effective values after the
  // predicate pass below — when scaleByFilterCount is on they lerp from
  // the (50 cells → 20px, 0.25) end to the (all cells → 10px, 0.75) end
  // based on inSetCount.
  // The Gene color scheme paints by the selected genes when at least
  // one is in focus via Transcriptomics; otherwise it paints by
  // transcriptomic richness across the full 41-gene panel (# of
  // genes the cell expresses by the curated binary call), so picking
  // Color=Gene with nothing selected still tells the user something.
  //
  // With exactly one gene selected we paint by its raw spot count.
  // With 2+ genes the behaviour is driven by settings.geneMultiColor:
  //   'max'      → plasma over max(geneCounts[g]) — mirror of stim coloring
  //   'sum'      → plasma over sum(geneCounts[g]) — emphasises co-expressors
  //   'richness' → plasma over # of selected genes the cell expresses
  //                (same predicate the filter uses), 0..N
  const geneSel = filter.selectedGenes;
  const useRichness =
    filter.txMode !== 'gene' || geneSel.length === 0;
  const RICHNESS_LOG_DEN = Math.log(1 + G);
  const multiGenes = filter.txMode === 'gene' && geneSel.length >= 2;
  const geneMultiMode = settings.geneMultiColor;
  const SEL_RICHNESS_LOG_DEN = multiGenes
    ? Math.log(1 + geneSel.length)
    : 1;
  // Stim color scheme: when exactly one stimulus is selected we paint
  // by that stimulus's correlation; otherwise (zero, all, or 2..S-1
  // selected) we paint by max across the relevant set. Mean would be
  // washed out by uncorrelated stims; max keeps the responsive-cell
  // map crisp. Empty selection and full selection both mean "max
  // across all" — the same way the activity filter treats them as
  // "no constraint".
  const stimSel = filter.selectedStimuli;
  const useStimMax = stimSel.length !== 1;
  const stimMaxIndices: number[] | null =
    !useStimMax
      ? null
      : stimSel.length > 0 && stimSel.length < S
        ? stimSel
        : null; // null → max over every stimulus index 0..S-1

  // Build a fast lookup of selected indices.
  const selSet = selection.indices.length > 0 ? new Set<number>(Array.from(selection.indices)) : null;
  // Selection-driven dimming: non-selected cells get knocked to a low
  // alpha in the shared coloring so the t-SNE panel still shows them
  // (softly) for re-lassoing. The 3D viewer applies a stronger pass
  // (applySelectionAsFilterGhost) that swaps them to the full ghost
  // recipe. No selection size threshold — be consistent and apply the
  // dim regardless of how many cells are selected.
  //
  // Only USER-explicit selections (3D click, t-SNE drag) drive any
  // selection rendering. Filter-derived selections already get their
  // visual signature from the in-set/dim split.
  const isUserSelection = selection.source === '3d' || selection.source === 'umap';

  // Filter predicate hoisted from cellPasses so the hot loop allocates
  // nothing per cell — no closure, no result object. cellPasses still
  // exists for single-cell callers (picker, lasso), where allocation
  // cost is negligible.
  // Only one atlas's region filter is active at a time; the other is
  // dormant. Hoist the active slot into `isoRegion` / `isoAtlasRegion`
  // (set to -1 when dormant) so the per-cell branch in the hot loop
  // doesn't have to re-check the mode each iteration.
  const useAtlas = filter.anatomyAtlas === 'mapzebrain';
  const isoRegion = useAtlas ? -1 : filter.isolatedRegion;
  const isoAtlasRegion = useAtlas ? filter.isolatedAtlasRegion : -1;
  const atlasMaskArr = ds.atlasRegionMask;
  const atlasBytesPerCell = Math.ceil(ds.atlasRegionNames.length / 8);
  const atlasByteOff = isoAtlasRegion >= 0 ? isoAtlasRegion >> 3 : 0;
  const atlasBitMask = isoAtlasRegion >= 0 ? 1 << (isoAtlasRegion & 7) : 0;
  const isoFish = filter.isolatedFish;
  const txMode = filter.txMode;
  const geneSelArr = filter.selectedGenes;
  const geneSelLen = geneSelArr.length;
  const geneFilterActive = txMode === 'gene' && geneSelLen > 0;
  const clusterFilterActive = txMode === 'subtype';
  const geneLogicAnd = filter.geneLogic === 'and';
  const usePaperGeneThr = settings.geneThresholdMode === 'paper';
  const globalGeneThr = settings.geneThresholdGlobal;
  const selectedCluster = filter.selectedCluster;
  const stimSelArr2 = filter.selectedStimuli;
  const stimSelLen = stimSelArr2.length;
  const stimLogicAnd = filter.stimLogic === 'and';
  const stimLoFilter = stimLo;
  const stimMode = filter.stimMode;
  const stimActive = stimSelLen > 0 && stimMode !== 'off';
  // Visual Stimuli "no filter" should not silently behave like the
  // "± either" sign-band. When the sign-band filter is dormant, selected
  // stimuli still scope the Stim color/projection scalar, but the
  // responsive floor is not used as a color/projection deadband; raw
  // correlations map continuously away from zero. Once a sign-band is
  // enabled, the same floor becomes both the filter criterion and the
  // neutral deadband.
  const stimColorLo = stimActive ? stimLo : 0;
  // Per-sign spans between the deadband and each saturation anchor. Equal
  // when split saturation is off.
  const stimColorRangePos = Math.max(0.001, stimHi - stimColorLo);
  const stimColorRangeNeg = Math.max(0.001, stimHiNeg - stimColorLo);
  // Sign-aware predicate (encoded as ints to keep the hot loop branchless):
  //   0 = positive (r >= +lo), 1 = negative (r <= -lo), 2 = both (|r| >= lo)
  const stimModeCode = stimMode === 'negative' ? 1 : stimMode === 'both' ? 2 : 0;
  const swimMode = filter.swimMode;
  const swimFilterActive = swimMode !== 'off';
  const swimLoFilter = swimLoSetting;
  const hideUnassigned = hidesUnassignedRegion(filter);
  const filterActive =
    isoRegion >= 0 ||
    isoAtlasRegion >= 0 ||
    isoFish >= 0 ||
    geneFilterActive ||
    clusterFilterActive ||
    stimActive ||
    swimFilterActive ||
    hideUnassigned;
  const fadeWeak = settings.fadeWeakCorrelation;
  // Single-pass bucket fill into a draw-order buffer:
  //   out-of-set indices fill from the front (outCursor ↑)
  //   in-set     indices fill from the back  (inCursor  ↓)
  // After the loop the array is partitioned [out-of-set…, in-set…].
  // The in-set portion ends up in reverse arrival order, but renderers
  // and downstream selection consumers don't care about internal order.
  // We slice the in-set tail for filterSelection (App's effective
  // selection fallback) and pass the full buffer as drawOrder so
  // renderers iterate or index-draw with in-set cells last — that
  // guarantees they composite over the dim ghost haze.
  const drawOrder = filterActive ? new Uint32Array(count) : null;
  let outCursor = 0;
  let inCursor = count;
  // Per-cell predicate result reused by pass 2 — Uint8Array is the
  // cheapest densely-packed boolean store and ~274 KB at our typical
  // count.
  const inSetArr = new Uint8Array(count);
  let inSetCount = 0;

  // ── Pass 1: predicate + drawOrder partition + inSet count ─────────
  // We need inSetCount BEFORE pass 2 so scaleByFilterCount can derive
  // the effective point size + ghost intensity from it.
  for (let i = 0; i < count; i++) {
    const renderable = !(hideUnassigned && regionIds[i] === 0);
    const inRegion =
      (isoRegion < 0 || regionIds[i] === isoRegion) &&
      (isoAtlasRegion < 0 ||
        (atlasMaskArr[i * atlasBytesPerCell + atlasByteOff] & atlasBitMask) !== 0) &&
      (isoFish < 0 || fishIds[i] === isoFish);
    let passesTx = true;
    if (geneFilterActive) {
      const base = i * G;
      if (geneLogicAnd) {
        for (let k = 0; k < geneSelLen; k++) {
          const gi = geneSelArr[k];
          const ok = usePaperGeneThr ? geneBinary[base + gi] === 1 : geneCounts[base + gi] >= globalGeneThr;
          if (!ok) { passesTx = false; break; }
        }
      } else {
        passesTx = false;
        for (let k = 0; k < geneSelLen; k++) {
          const gi = geneSelArr[k];
          const ok = usePaperGeneThr ? geneBinary[base + gi] === 1 : geneCounts[base + gi] >= globalGeneThr;
          if (ok) { passesTx = true; break; }
        }
      }
    } else if (clusterFilterActive) {
      passesTx = clusterIds[i] === selectedCluster;
    }
    let passesStim = true;
    if (stimActive) {
      const baseS = i * S;
      if (stimLogicAnd) {
        for (let k = 0; k < stimSelLen; k++) {
          const r = stimulusCorr[baseS + stimSelArr2[k]];
          const ok = stimModeCode === 0 ? r >= stimLoFilter
            : stimModeCode === 1 ? r <= -stimLoFilter
            : r >= stimLoFilter || r <= -stimLoFilter;
          if (!ok) { passesStim = false; break; }
        }
      } else {
        passesStim = false;
        for (let k = 0; k < stimSelLen; k++) {
          const r = stimulusCorr[baseS + stimSelArr2[k]];
          const ok = stimModeCode === 0 ? r >= stimLoFilter
            : stimModeCode === 1 ? r <= -stimLoFilter
            : r >= stimLoFilter || r <= -stimLoFilter;
          if (ok) { passesStim = true; break; }
        }
      }
    }
    let passesSwim = true;
    if (swimFilterActive) {
      const sr = swimCorr[i];
      switch (swimMode) {
        case 'positive': passesSwim = sr >= swimLoFilter; break;
        case 'negative': passesSwim = sr <= -swimLoFilter; break;
        case 'both': passesSwim = sr >= swimLoFilter || sr <= -swimLoFilter; break;
      }
    }
    const inSet = renderable && inRegion && passesTx && passesStim && passesSwim;
    if (inSet) {
      inSetCount++;
      inSetArr[i] = 1;
      if (drawOrder) drawOrder[--inCursor] = i;
    } else if (drawOrder) {
      drawOrder[outCursor++] = i;
    }
  }

  // ── Effective point size + ghost intensity ────────────────────────
  // Auto mode derives both values from canvas *height* (the brain fills
  // the viewport vertically; width is irrelevant to on-screen size).
  // Both are negative-exponential approaches to an asymptote, fit to
  // user-supplied (height, value) anchors. See the AUTO_* constants.
  // Manual mode reads the slider values directly.
  //
  // scaleByFilterCount, when on (and only effective while autoSizing
  // is also on — the settings panel hides the checkbox otherwise, but
  // stale URL state could still carry it through), additionally
  // multiplies the *in-set* point size by an inSetBoost in [1×, 2×].
  // 50 cells → 2×, all cells → 1×. Ghost cells are not boosted — the
  // toggle is a knob for emphasising the active subset, not the rest.
  const h = Math.max(1, canvasHeight);
  const auto = settings.autoSizing;
  let baseSize: number;
  let baseGhostIntensity: number;
  if (auto) {
    baseSize = AUTO_POINT_M - AUTO_POINT_C * Math.exp(-AUTO_POINT_K * h);
    const up = 1 / (1 + Math.exp(-(h - AUTO_GHOST_HUP) / AUTO_GHOST_SUP));
    const dn = 1 / (1 + Math.exp((h - AUTO_GHOST_HDN) / AUTO_GHOST_SDN));
    const peak = 0.5 + AUTO_GHOST_A * up * dn;
    baseGhostIntensity = Math.max(AUTO_GHOST_MIN, Math.min(AUTO_GHOST_MAX, peak));
  } else {
    baseSize = Math.max(0.001, settings.pointSize);
    baseGhostIntensity = Math.max(0, Math.min(1, settings.ghostIntensity));
  }
  const useFilterLerp = auto && settings.scaleByFilterCount;
  const AUTO_MIN_INSET = 50;
  const logFilterHi = Math.log(Math.max(AUTO_MIN_INSET + 1, count));
  const logFilterLo = Math.log(AUTO_MIN_INSET);
  const tFilter = useFilterLerp
    ? Math.max(0, Math.min(1, (Math.log(Math.max(AUTO_MIN_INSET, inSetCount)) - logFilterLo) / (logFilterHi - logFilterLo)))
    : 0;
  const inSetBoost = useFilterLerp
    ? IN_SET_BOOST_MAX - (IN_SET_BOOST_MAX - IN_SET_BOOST_MIN) * tFilter
    : 1.0;
  const effectivePointSize = baseSize * inSetBoost;
  const effectiveGhostIntensity = baseGhostIntensity;
  // The UI count is a filter/readout count, not an alpha/style count.
  // Compute it from pass 1 before selection dimming, fade-weak opacity,
  // ghost visibility, or opaque-active overrides can affect display alpha.
  const visibleCount = inSetCount;

  // ── Pass 2: paint ─────────────────────────────────────────────────
  for (let i = 0; i < count; i++) {
    const inSet = inSetArr[i] === 1;
    let r = 0, g = 0, b = 0, alpha = 0.85, size = effectivePointSize;
    // Per-cell projection intensity (scheme-aware magnitude in [0, 1]).
    // Branches below overwrite it; ghosts and hidden cells leave it at
    // zero so the projection-mode renderer culls them via intensityFloor.
    let intensity = 0;
    // Raw scalar displayed in the tooltip and, later, consumed by the
    // scalar-projection path. Categorical schemes leave this as NaN.
    let scalar = Number.NaN;

    if (hideUnassigned && regionIds[i] === 0) {
      colors[i * 3] = 0;
      colors[i * 3 + 1] = 0;
      colors[i * 3 + 2] = 0;
      alphas[i] = 0;
      sizes[i] = size;
      intensities[i] = 0;
      scalarValues[i] = Number.NaN;
      continue;
    }

    if (!inSet) {
      // Two-tier dim: anatomical-context lift when the cell is inside
      // the focused region but fails another predicate; otherwise the
      // full background dim. effectiveGhostIntensity (0..1) is the
      // *visibility* of the ghost cells (0 = invisible, 1 = standard
      // dim). Re-derive inRegion here since the pass-1 local fell out
      // of scope. Ghost size starts from baseSize (not effectivePointSize)
      // so the scale-by-filter in-set boost doesn't bleed into ghosts.
      r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2];
      size = baseSize;
      const inRegion =
        (isoRegion < 0 || regionIds[i] === isoRegion) &&
        (isoAtlasRegion < 0 ||
          (atlasMaskArr[i * atlasBytesPerCell + atlasByteOff] & atlasBitMask) !== 0) &&
        (isoFish < 0 || fishIds[i] === isoFish);
      const liftBranch = inRegion && (isolatedRegion >= 0 || isoAtlasRegion >= 0);
      const baseAlpha = liftBranch ? LIFT_ALPHA : DIM_ALPHA;
      if (filterActive) {
        const t = effectiveGhostIntensity;
        alpha = baseAlpha * t;
        size *= GHOST_SIZE_FLOOR + (1 - GHOST_SIZE_FLOOR) * t;
      } else {
        alpha = baseAlpha;
      }
    } else {
      switch (filter.colorMode) {
        case 'region': {
          const c = regionColor(regionIds[i], filter.regionPalette);
          r = c[0]; g = c[1]; b = c[2];
          // Categorical scheme: no magnitude. In-set cells get full
          // intensity so projection renders any of them; ghosts have
          // already been left at 0 by the default above.
          intensity = 1;
          break;
        }
        case 'fish': {
          const c = fishColor(ds.fishIds[i]);
          r = c[0]; g = c[1]; b = c[2];
          intensity = 1;
          break;
        }
        case 'gene': {
          // Sub-modes:
          //   0 genes selected (or subtype mode)  → richness over the
          //     full 41-gene panel.
          //   1 gene selected                     → classic single-gene
          //     plasma over its raw FISH spot count.
          //   2+ genes selected                   → driven by
          //     settings.geneMultiColor (max / sum / richness within
          //     the selected subset).
          let raw: number;
          let v: number;
          if (useRichness) {
            // Count binary-positive genes for this cell. ~G ops per cell;
            // for G=41 and ~274k cells this is ~11M Uint8 reads — well
            // under a frame budget and avoids carrying a precomputed
            // sidecar.
            let n = 0;
            const base = i * G;
            for (let j = 0; j < G; j++) n += geneBinary[base + j];
            raw = n;
            v = useLog
              ? Math.log(1 + n) / RICHNESS_LOG_DEN
              : n / G;
          } else if (multiGenes) {
            const base = i * G;
            const N = geneSel.length;
            if (geneMultiMode === 'richness') {
              // # of selected genes the cell expresses by the same
              // predicate the filter uses (paper binary call or
              // geneCounts ≥ user-set global threshold).
              let n = 0;
              if (usePaperGeneThr) {
                for (let k = 0; k < N; k++) if (geneBinary[base + geneSel[k]] === 1) n++;
              } else {
                for (let k = 0; k < N; k++) if (geneCounts[base + geneSel[k]] >= globalGeneThr) n++;
              }
              raw = n;
              v = useLog
                ? Math.log(1 + n) / SEL_RICHNESS_LOG_DEN
                : n / N;
            } else if (geneMultiMode === 'sum') {
              let s = 0;
              for (let k = 0; k < N; k++) s += geneCounts[base + geneSel[k]];
              raw = s;
              v = useLog
                ? Math.min(1, Math.log(1 + s) / geneLogDen)
                : Math.min(1, s / geneMaxSpots);
            } else {
              // 'max' — default. Mirrors stim multi-select coloring.
              let m = 0;
              for (let k = 0; k < N; k++) {
                const c = geneCounts[base + geneSel[k]];
                if (c > m) m = c;
              }
              raw = m;
              v = useLog
                ? Math.min(1, Math.log(1 + m) / geneLogDen)
                : Math.min(1, m / geneMaxSpots);
            }
          } else {
            raw = geneCounts[i * G + geneSel[0]];
            v = useLog
              ? Math.min(1, Math.log(1 + raw) / geneLogDen)
              : Math.min(1, raw / geneMaxSpots);
          }
          if (raw <= 0) {
            // Cell expresses nothing on this axis: faint backdrop. Lift
            // in-region cells when a region is isolated so the region's
            // outline still reads through the plasma foreground.
            r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2];
            alpha = isolatedRegion >= 0 || isoAtlasRegion >= 0 ? LIFT_ALPHA : DIM_ALPHA;
            scalar = raw;
          } else {
            const c = plasma(v);
            r = c[0]; g = c[1]; b = c[2];
            alpha = 1.0;
            // v is the plasma input (0..1) — exactly the magnitude
            // signal projection-mode wants.
            intensity = v;
            scalar = raw;
          }
          break;
        }
        case 'highlight': {
          // Every in-set cell paints the same vivid yellow. With no
          // filters active that's the whole brain; the scheme becomes
          // useful in combination with one or more filters — it's the
          // "show me what passes the filters" view, with no further
          // visual encoding overlaid.
          r = 0.94; g = 0.97; b = 0.13;
          alpha = 1.0;
          intensity = 1;
          break;
        }
        case 'activity': {
          // Per-cell ΔF/F at the current scrub sample, mapped through
          // plasma over the fixed [LO, HI] anchors. Below-baseline values
          // drop to the same backdrop the Gene/Stim modes use for
          // "no signal" so the visual vocabulary stays consistent.
          const dff = activityTrace[i * traceLength + activitySample];
          const v = Math.max(0, Math.min(1, (dff - ACTIVITY_LO) / activityRange));
          scalar = dff;
          if (v <= 0) {
            r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2];
            alpha = isolatedRegion >= 0 || isoAtlasRegion >= 0 ? LIFT_ALPHA : DIM_ALPHA;
          } else {
            const c = plasma(v);
            r = c[0]; g = c[1]; b = c[2];
            alpha = 1.0;
            intensity = v;
          }
          break;
        }
        case 'stim': {
          // Divergent coolwarm ramp over signed stim correlation,
          // anchored at ±stimColorLo (0 in no-filter mode,
          // settings.stimLo when a sign-band is armed) and at +stimHi /
          // −stimHiNeg (saturation; the two saturation anchors are equal
          // unless split saturation is on). With one stimulus selected we paint by
          // its signed r. With multiple stimuli (or "all stims") the rep
          // we pick tracks the filter direction WHEN the filter is active.
          // With the filter inactive (no stims, or mode 'off') the
          // coloring falls back to max-|r| so the map doesn't keep biasing
          // toward a direction the user can no longer see in the UI.
          let rawA: number;
          if (!useStimMax) {
            rawA = stimulusCorr[i * S + stimSel[0]];
          } else {
            const baseIdx = i * S;
            const indices = stimMaxIndices;
            const N = indices ? indices.length : S;
            // Directional bias in the coloring only applies when the
            // sign-band filter is actually active (stims selected AND
            // mode != 'off'). In no-filter mode the coloring should fall
            // back to max-|r| even though the mode dropdown is visible.
            const colorBias = stimActive ? stimMode : 'both';
            if (colorBias === 'positive') {
              let m = -Infinity;
              for (let j = 0; j < N; j++) {
                const c = stimulusCorr[baseIdx + (indices ? indices[j] : j)];
                if (c > m) m = c;
              }
              rawA = m;
            } else if (colorBias === 'negative') {
              let m = Infinity;
              for (let j = 0; j < N; j++) {
                const c = stimulusCorr[baseIdx + (indices ? indices[j] : j)];
                if (c < m) m = c;
              }
              rawA = m;
            } else {
              // 'both' or 'off' — max-|r|
              let m = stimulusCorr[baseIdx + (indices ? indices[0] : 0)];
              let mAbs = Math.abs(m);
              for (let j = 1; j < N; j++) {
                const c = stimulusCorr[baseIdx + (indices ? indices[j] : j)];
                const a2 = Math.abs(c);
                if (a2 > mAbs) { m = c; mAbs = a2; }
              }
              rawA = m;
            }
          }
          const mag = Math.abs(rawA);
          let v: number;
          if (mag <= stimColorLo) {
            v = 0;
          } else {
            const range = rawA >= 0 ? stimColorRangePos : stimColorRangeNeg;
            v = Math.min(1, (mag - stimColorLo) / range);
          }
          const signed = rawA >= 0 ? v : -v;
          const c = coolwarm(signed);
          r = c[0]; g = c[1]; b = c[2];
          alpha = fadeWeak ? FADE_FLOOR + (1 - FADE_FLOOR) * v : 1.0;
          // |r|-magnitude projection signal independent of fadeWeak:
          // alpha collapses to 1 with fade off, so projection would lose
          // its discriminator if it kept reading alpha.
          intensity = v;
          scalar = rawA;
          break;
        }
        case 'swim': {
          // Divergent ramp over signed swim correlation, anchored
          // symmetrically at ±swimLo (neutral midpoint) and ±swimHi
          // (saturation). When fadeWeakCorrelation is on, alpha
          // tracks magnitude so the bright midpoint doesn't compete
          // with the colored extremes.
          const rawS = swimCorr[i];
          const mag = Math.abs(rawS);
          // Map magnitude beyond the deadband [-swimLo, +swimLo] into
          // [0, 1], preserving sign.
          let v: number;
          if (mag <= swimLoSetting) {
            v = 0;
          } else {
            v = Math.min(1, (mag - swimLoSetting) / swimRange);
          }
          const signed = rawS >= 0 ? v : -v;
          const c = coolwarm(signed);
          r = c[0]; g = c[1]; b = c[2];
          alpha = fadeWeak ? FADE_FLOOR + (1 - FADE_FLOOR) * v : 1.0;
          intensity = v;
          scalar = rawS;
          break;
        }
      }
    }

    // Optional shared opacity override: make foreground/in-filter cells
    // fully opaque while leaving ghosts/out-of-filter cells dimmed. This
    // lives in shared coloring (rather than BrainViewer) so the 3D and
    // t-SNE scatters show the same alpha policy.
    if (settings.opaqueActiveCells && inSet && alpha > 0) {
      alpha = 1.0;
    }

    // Additive brightness lift on in-set cells. Same lift applies in
    // both 3D and t-SNE (the t-SNE consumes this shared buffer), and
    // the color legend mirrors the formula so swatches/gradients stay
    // visually in sync. Ghosts stay at DIM_RGB.
    if (inSet && settings.activeBrightness > 0) {
      const lift = settings.activeBrightness;
      r = Math.min(1, r + lift);
      g = Math.min(1, g + lift);
      b = Math.min(1, b + lift);
    }

    // Active selection: leave selected cells' colors untouched (the
    // active color scheme is meaningful — don't shift hue or lift
    // brightness) and soft-dim every non-selected cell so the
    // selected group reads as a coherent shape in the t-SNE panel.
    // The 3D viewer applies its own selection-as-filter ghost pass
    // on top — see applySelectionAsFilterGhost — so 3D gets the full
    // ghost recipe while t-SNE keeps this softer dim (which still
    // lets the user see and re-lasso non-selected cells).
    if (selSet && isUserSelection && !selSet.has(i)) {
      alpha = Math.min(alpha, 0.18);
    }

    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
    alphas[i] = alpha;
    sizes[i] = size;
    intensities[i] = intensity;
    scalarValues[i] = scalar;
  }

  // Slice the in-set tail out of drawOrder as filterSelection so App's
  // effective-selection fallback gets a stable buffer (consumers must
  // not see the underlying drawOrder mutate on the next filter change).
  // The in-set indices land in reverse arrival order in drawOrder; that
  // doesn't matter for the consumers, which treat selection as a set.
  const filterSelection = drawOrder ? drawOrder.slice(inCursor) : null;
  return {
    visibleCount,
    filterSelection,
    drawOrder,
    basePointSize: baseSize,
    effectivePointSize,
    effectiveGhostIntensity,
  };
}

/** Fast path for Activity playback. It assumes the filter intersection,
 *  selection, sizing, and draw order are unchanged from the last full
 *  `applyColoring` pass, and updates only the per-cell Activity colors /
 *  alpha / projection scalar for the already-active cells. */
export function repaintActivitySample(
  ds: NeuronDataset,
  filter: FilterState,
  settings: SettingsState,
  selection: SelectionState,
  filterSelection: Uint32Array | null,
  out: ColoringResult,
): void {
  const { count, activityTrace, traceLength } = ds;
  const { colors, alphas, intensities, scalarValues } = out;
  const sample = Math.max(0, Math.min(traceLength - 1, filter.activitySample | 0));
  const lo = settings.activityLo;
  const hi = Math.max(lo + 0.001, settings.activityHi);
  const range = Math.max(0.001, hi - lo);
  const liftNoSignal =
    (filter.anatomyAtlas === 'mapzebrain'
      ? filter.isolatedAtlasRegion
      : filter.isolatedRegion) >= 0;
  const brightness = settings.activeBrightness;
  const opaque = settings.opaqueActiveCells;
  const selSet = selection.indices.length > 0 ? new Set<number>(Array.from(selection.indices)) : null;
  const dimUnselected = selSet && (selection.source === '3d' || selection.source === 'umap');
  const paint = (i: number) => {
    const dff = activityTrace[i * traceLength + sample];
    const v = Math.max(0, Math.min(1, (dff - lo) / range));
    let r: number;
    let g: number;
    let b: number;
    let alpha: number;
    if (v <= 0) {
      r = DIM_RGB[0];
      g = DIM_RGB[1];
      b = DIM_RGB[2];
      alpha = liftNoSignal ? LIFT_ALPHA : DIM_ALPHA;
      intensities[i] = 0;
    } else {
      const c = plasma(v);
      r = c[0];
      g = c[1];
      b = c[2];
      alpha = 1.0;
      intensities[i] = v;
    }
    if (opaque && alpha > 0) alpha = 1.0;
    if (brightness > 0) {
      r = Math.min(1, r + brightness);
      g = Math.min(1, g + brightness);
      b = Math.min(1, b + brightness);
    }
    if (dimUnselected && !selSet.has(i)) alpha = Math.min(alpha, 0.18);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
    alphas[i] = alpha;
    scalarValues[i] = dff;
  };
  if (filterSelection) {
    for (let k = 0; k < filterSelection.length; k++) paint(filterSelection[k]);
  } else {
    for (let i = 0; i < count; i++) paint(i);
  }
}

/**
 * Demote in-set cells that aren't in the t-SNE lasso selection to the
 * standard ghost recipe (DIM_RGB color, dim alpha, smaller size). The
 * 3D viewer calls this AFTER copying the shared coloring into its own
 * buffers so the t-SNE panel keeps its non-filtered look — the t-SNE
 * panel needs the rest of the brain visible so the user can lasso new
 * subsets, while the 3D viewer treats the lasso as just another filter.
 *
 * Only 'umap' selections drive the ghost demotion; '3d' selections (a
 * single-cell focus) have no associated lasso and should leave the
 * rest of the population alone.
 */
export function applySelectionAsFilterGhost(
  out: ColoringResult,
  count: number,
  drawOrder: Uint32Array | null,
  filterSelection: Uint32Array | null,
  basePointSize: number,
  effectiveGhostIntensity: number,
  selection: SelectionState,
): void {
  if (selection.source !== 'umap' || selection.indices.length === 0) return;
  const { colors, alphas, sizes, intensities, scalarValues } = out;
  const selSet = new Set<number>(Array.from(selection.indices));
  const t = effectiveGhostIntensity;
  const ghostAlpha = DIM_ALPHA * t;
  // Mirror the per-cell ghost recipe in applyColoring: size starts
  // from basePointSize (not effectivePointSize) so the scale-by-filter
  // in-set boost doesn't leak into demoted cells.
  const ghostSize = basePointSize * (GHOST_SIZE_FLOOR + (1 - GHOST_SIZE_FLOOR) * t);
  const r0 = DIM_RGB[0], g0 = DIM_RGB[1], b0 = DIM_RGB[2];
  // When a filter is active, drawOrder partitions cells [out-of-set,
  // in-set]. Out-of-set cells are already ghosts; we only need to
  // demote in-set cells that aren't in the lasso. When no filter is
  // active drawOrder is null and every cell is in-set.
  if (drawOrder && filterSelection) {
    const inCursor = count - filterSelection.length;
    for (let k = inCursor; k < count; k++) {
      const i = drawOrder[k];
      if (selSet.has(i)) continue;
      colors[i * 3] = r0;
      colors[i * 3 + 1] = g0;
      colors[i * 3 + 2] = b0;
      alphas[i] = ghostAlpha;
      sizes[i] = ghostSize;
      intensities[i] = 0;
      scalarValues[i] = Number.NaN;
    }
  } else {
    for (let i = 0; i < count; i++) {
      if (selSet.has(i)) continue;
      colors[i * 3] = r0;
      colors[i * 3 + 1] = g0;
      colors[i * 3 + 2] = b0;
      alphas[i] = ghostAlpha;
      sizes[i] = ghostSize;
      intensities[i] = 0;
      scalarValues[i] = Number.NaN;
    }
  }
}
