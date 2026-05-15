import type { NeuronDataset, FilterState, SelectionState, SettingsState } from '../data/types';
import { regionColor, fishColor, plasma, coolwarm } from './colorMaps';

const DIM_RGB: [number, number, number] = [0.30, 0.30, 0.32];
const DIM_ALPHA = 0.10;
const LIFT_ALPHA = 0.50;
// Floors that the dim/lift alphas and the point-size factor approach
// at full ghost intensity. The user-set ghostIntensity (0..1) linearly
// interpolates from the no-ghost endpoint (DIM_ALPHA / LIFT_ALPHA /
// 1.0) toward these floors.
const GHOST_ALPHA_FLOOR = 0.02;
const GHOST_LIFT_FLOOR = 0.15;
const GHOST_SIZE_FLOOR = 0.55;
const HIGHLIGHT_BOOST_SIZE = 1.5;

// Stim correlation thresholds, the gene plasma ceiling, and the base
// point size all live in SettingsState (see types.ts:DEFAULT_SETTINGS)
// so the user can tune them from the Settings tab.

export interface ColoringResult {
  colors: Float32Array; // length n*3
  alphas: Float32Array; // length n
  sizes: Float32Array; // length n
}

export function allocColoring(n: number): ColoringResult {
  return {
    colors: new Float32Array(n * 3),
    alphas: new Float32Array(n),
    sizes: new Float32Array(n),
  };
}

export interface ColoringStats {
  /** Number of cells that passed the filter intersection (inSet count). */
  visibleCount: number;
  /** Indices of cells in the filter intersection — populated only when
   *  at least one filter dimension is active. Used as the filter-derived
   *  fallback selection when the user hasn't lassoed anything. */
  filterSelection: Uint32Array | null;
  /** Permutation of [0..count-1] partitioned so out-of-filter cells
   *  come first and in-filter cells come last. Renderers iterate
   *  (or use as an index buffer) so in-set cells composite over the
   *  dim haze regardless of source order or true 3D depth. Null when
   *  no filter is active (every cell is in-set, no reorder needed). */
  drawOrder: Uint32Array | null;
}

/** Per-cell predicate evaluator. Bundled together so the same logic
 *  drives both `applyColoring` and the filter→selection effect in
 *  App.tsx, guaranteeing the visualization and the derived selection
 *  always agree on what's "in set". */
export interface CellPredicates {
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
  const inRegion =
    (filter.isolatedRegion < 0 || ds.regionIds[i] === filter.isolatedRegion) &&
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
    const lo = settings.stimLo;
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

/** True iff cell `i` is inside the intersection of every active filter. */
export function cellInSet(
  ds: NeuronDataset,
  filter: FilterState,
  settings: SettingsState,
  i: number,
): boolean {
  const p = cellPasses(ds, filter, settings, i);
  return p.inRegion && p.passesTx && p.passesStim && p.passesSwim;
}

/** True iff at least one filter dimension is constraining. The activity
 *  filter is active whenever any stimulus is toggled on; an empty
 *  selection means "no constraint". */
export function anyFilterActive(ds: NeuronDataset, filter: FilterState): boolean {
  const stimsActive = filter.selectedStimuli.length > 0 && filter.stimMode !== 'off';
  return (
    filter.isolatedRegion >= 0 ||
    filter.isolatedFish >= 0 ||
    (filter.txMode === 'gene' && filter.selectedGenes.length > 0) ||
    filter.txMode === 'subtype' ||
    stimsActive ||
    filter.swimMode !== 'off'
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
export function applyColoring(
  ds: NeuronDataset,
  filter: FilterState,
  settings: SettingsState,
  selection: SelectionState,
  out: ColoringResult,
): ColoringStats {
  const { count, regionIds, fishIds, clusterIds, geneCounts, geneBinary, stimulusCorr, swimCorr, activityTrace, traceLength } = ds;
  const { colors, alphas, sizes } = out;
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
  const isolatedRegion = filter.isolatedRegion;
  // Stim cutoffs come from user settings; STIM_RANGE is derived. We
  // tolerate stimHi <= stimLo by clamping the divisor to something
  // small but positive so plasma still maps without dividing by zero.
  const stimLo = settings.stimLo;
  const stimRange = Math.max(0.001, settings.stimHi - settings.stimLo);
  // Swim coloring anchors: symmetric around 0. Below |r| = swimLo the
  // cell maps to the neutral midpoint of the divergent ramp; above
  // |r| = swimHi it saturates at the corresponding end. Clamp the divisor
  // so swimHi <= swimLo (transient slider state) doesn't divide by zero.
  const swimLoSetting = settings.swimLo;
  const swimRange = Math.max(0.001, settings.swimHi - settings.swimLo);
  // Gene scheme anchors and the per-cell base size also come from
  // settings.
  const geneMaxSpots = Math.max(1, settings.geneMaxSpots);
  const geneLogDen = Math.log(1 + geneMaxSpots);
  const baseSize = settings.pointSize;
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
  // For small selections (e.g. clicking a single neuron), keep the rest of
  // the brain visible for anatomical context — only enlarge/brighten the
  // selected one. For larger group selections, dim non-members so the
  // selected group reads as a coherent shape.
  const dimNonSelected = selSet !== null && selSet.size > 50;
  // Only USER-explicit selections (3D click, t-SNE drag) deserve a
  // brightness/size boost. Filter-derived selections already get their
  // signature from the in-set/dim split, so boosting them on top would
  // just clobber the anatomical-context lift.
  const isUserSelection = selection.source === '3d' || selection.source === 'umap';

  // Filter predicate hoisted from cellPasses so the hot loop allocates
  // nothing per cell — no closure, no result object. cellPasses still
  // exists for single-cell callers (picker, lasso), where allocation
  // cost is negligible.
  const isoRegion = filter.isolatedRegion;
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
  const stimLoFilter = settings.stimLo;
  const stimMode = filter.stimMode;
  const stimActive = stimSelLen > 0 && stimMode !== 'off';
  // Sign-aware predicate (encoded as ints to keep the hot loop branchless):
  //   0 = positive (r >= +lo), 1 = negative (r <= -lo), 2 = both (|r| >= lo)
  const stimModeCode = stimMode === 'negative' ? 1 : stimMode === 'both' ? 2 : 0;
  const swimMode = filter.swimMode;
  const swimFilterActive = swimMode !== 'off';
  const swimLoFilter = settings.swimLo;
  const filterActive =
    isoRegion >= 0 ||
    isoFish >= 0 ||
    geneFilterActive ||
    clusterFilterActive ||
    stimActive ||
    swimFilterActive;
  // Clamp ghostIntensity into [0, 1] so a hostile URL value can't
  // overshoot the floor / send size below 0.
  const ghostIntensity = Math.max(0, Math.min(1, settings.ghostIntensity));
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
  let visibleCount = 0;

  for (let i = 0; i < count; i++) {
    let r = 0, g = 0, b = 0, alpha = 0.85, size = baseSize;

    const inRegion =
      (isoRegion < 0 || regionIds[i] === isoRegion) &&
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
    const inSet = inRegion && passesTx && passesStim && passesSwim;
    if (inSet) {
      visibleCount++;
      if (drawOrder) drawOrder[--inCursor] = i;
    } else if (drawOrder) {
      drawOrder[outCursor++] = i;
    }

    if (!inSet) {
      // Two-tier dim: anatomical-context lift when the cell is inside
      // the focused region but fails another predicate; otherwise the
      // full background dim. ghostIntensity (0..1) lerps the alpha and
      // point size between the no-ghost endpoint and the near-invisible
      // floor so the user can dial the dim cells from "useful
      // anatomical context" all the way down to "barely there".
      r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2];
      const liftBranch = inRegion && isolatedRegion >= 0;
      if (filterActive && ghostIntensity > 0) {
        const t = ghostIntensity;
        const baseAlpha = liftBranch ? LIFT_ALPHA : DIM_ALPHA;
        const floorAlpha = liftBranch ? GHOST_LIFT_FLOOR : GHOST_ALPHA_FLOOR;
        alpha = baseAlpha + (floorAlpha - baseAlpha) * t;
        size *= 1 + (GHOST_SIZE_FLOOR - 1) * t;
      } else {
        alpha = liftBranch ? LIFT_ALPHA : DIM_ALPHA;
      }
    } else {
      switch (filter.colorMode) {
        case 'region': {
          const c = regionColor(regionIds[i]);
          r = c[0]; g = c[1]; b = c[2];
          break;
        }
        case 'fish': {
          const c = fishColor(ds.fishIds[i]);
          r = c[0]; g = c[1]; b = c[2];
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
            alpha = isolatedRegion >= 0 ? LIFT_ALPHA : 0.10;
          } else {
            const c = plasma(v);
            r = c[0]; g = c[1]; b = c[2];
            alpha = 1.0;
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
          break;
        }
        case 'activity': {
          // Per-cell ΔF/F at the current scrub sample, mapped through
          // plasma over the fixed [LO, HI] anchors. Below-baseline values
          // drop to the same backdrop the Gene/Stim modes use for
          // "no signal" so the visual vocabulary stays consistent.
          const dff = activityTrace[i * traceLength + activitySample];
          const v = Math.max(0, Math.min(1, (dff - ACTIVITY_LO) / activityRange));
          if (v <= 0) {
            r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2];
            alpha = isolatedRegion >= 0 ? LIFT_ALPHA : 0.10;
          } else {
            const c = plasma(v);
            r = c[0]; g = c[1]; b = c[2];
            alpha = 1.0;
          }
          break;
        }
        case 'stim': {
          // Divergent coolwarm ramp over signed stim correlation,
          // anchored symmetrically at ±stimLo (neutral deadband) and
          // ±stimHi (saturation). Mirrors the swim color scheme — sign
          // reads as colour, magnitude as intensity. With one stimulus
          // selected we paint by its signed r; otherwise we pick the
          // signed r with the largest magnitude (so an r = -0.5 wins
          // over r = +0.2, faithfully representing "most stim-coupled
          // direction").
          let rawA: number;
          if (!useStimMax) {
            rawA = stimulusCorr[i * S + stimSel[0]];
          } else if (stimMaxIndices === null) {
            const base = i * S;
            let m = stimulusCorr[base];
            let mAbs = Math.abs(m);
            for (let j = 1; j < S; j++) {
              const c = stimulusCorr[base + j];
              const a2 = Math.abs(c);
              if (a2 > mAbs) { m = c; mAbs = a2; }
            }
            rawA = m;
          } else {
            const base = i * S;
            let m = stimulusCorr[base + stimMaxIndices[0]];
            let mAbs = Math.abs(m);
            for (let k = 1; k < stimMaxIndices.length; k++) {
              const c = stimulusCorr[base + stimMaxIndices[k]];
              const a2 = Math.abs(c);
              if (a2 > mAbs) { m = c; mAbs = a2; }
            }
            rawA = m;
          }
          const mag = Math.abs(rawA);
          let v: number;
          if (mag <= stimLo) {
            v = 0;
          } else {
            v = Math.min(1, (mag - stimLo) / stimRange);
          }
          const signed = rawA >= 0 ? v : -v;
          const c = coolwarm(signed);
          r = c[0]; g = c[1]; b = c[2];
          alpha = 1.0;
          break;
        }
        case 'swim': {
          // Divergent ramp over signed swim correlation, anchored
          // symmetrically at ±swimLo (neutral midpoint) and ±swimHi
          // (saturation). Unlike plasma-based schemes there is no
          // "background" tier — neutral cells live at the midpoint of
          // the ramp (near-white) rather than dimming, so the user can
          // still see the brain silhouette for context.
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
          alpha = 1.0;
          break;
        }
      }
    }

    // Active selection: highlight selected, dim the rest if the group is
    // large enough that dimming aids comprehension. Only user-explicit
    // selections drive this — filter-derived selections already get their
    // visual signature from the in-set/dim split above.
    if (selSet && isUserSelection) {
      if (selSet.has(i)) {
        r = Math.min(1, r * 1.15 + 0.15);
        g = Math.min(1, g * 1.15 + 0.15);
        b = Math.min(1, b * 1.15 + 0.15);
        alpha = 1.0;
        size *= HIGHLIGHT_BOOST_SIZE;
      } else if (dimNonSelected) {
        alpha = Math.min(alpha, 0.18);
      }
    }

    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
    alphas[i] = alpha;
    sizes[i] = size;
  }

  // Slice the in-set tail out of drawOrder as filterSelection so App's
  // effective-selection fallback gets a stable buffer (consumers must
  // not see the underlying drawOrder mutate on the next filter change).
  // The in-set indices land in reverse arrival order in drawOrder; that
  // doesn't matter for the consumers, which treat selection as a set.
  const filterSelection =
    drawOrder && inCursor < count
      ? drawOrder.slice(inCursor)
      : null;
  return {
    visibleCount: filterActive ? visibleCount : count,
    filterSelection,
    drawOrder,
  };
}
