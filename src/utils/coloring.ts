import type { NeuronDataset, FilterState, SelectionState, SettingsState } from '../data/types';
import { regionColor, fishColor, plasma } from './colorMaps';

const DIM_RGB: [number, number, number] = [0.30, 0.30, 0.32];
const DIM_ALPHA = 0.10;
const LIFT_ALPHA = 0.50;
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

/** Per-cell predicate evaluator. Bundled together so the same logic
 *  drives both `applyColoring` and the filter→selection effect in
 *  App.tsx, guaranteeing the visualization and the derived selection
 *  always agree on what's "in set". */
export interface CellPredicates {
  /** Whether the cell is in the isolated region (or no region is isolated). */
  inRegion: boolean;
  /** Whether the cell passes the active gene/cluster filter. True if
   *  the relevant filter is "all" or txMode points the other way. */
  passesTx: boolean;
  /** Whether the cell passes the active stimulus filter. */
  passesStim: boolean;
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
  const clusterActive = filter.txMode === 'subtype' && !filter.clusterAll;
  let passesTx = true;
  if (geneActive) {
    const strict = settings.geneStrict;
    const hit = (g: number) =>
      strict ? ds.geneBinary[i * G + g] === 1 : ds.geneCounts[i * G + g] > 0;
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

  // Activity filter: an empty selection means "don't filter by activity
  // at all". Any non-empty selection is a real filter — combined per
  // `stimLogic`: 'or' passes if at least one of the chosen stimuli is
  // above the user-tunable responsive floor (settings.stimLo); 'and'
  // requires every chosen stimulus to clear the floor.
  const stims = filter.selectedStimuli;
  const stimActive = stims.length > 0;
  let passesStim = true;
  if (stimActive) {
    if (filter.stimLogic === 'and') {
      for (let k = 0; k < stims.length; k++) {
        if (ds.stimulusCorr[i * S + stims[k]] < settings.stimLo) { passesStim = false; break; }
      }
    } else {
      passesStim = false;
      for (let k = 0; k < stims.length; k++) {
        if (ds.stimulusCorr[i * S + stims[k]] >= settings.stimLo) { passesStim = true; break; }
      }
    }
  }

  return { inRegion, passesTx, passesStim };
}

/** True iff cell `i` is inside the intersection of every active filter. */
export function cellInSet(
  ds: NeuronDataset,
  filter: FilterState,
  settings: SettingsState,
  i: number,
): boolean {
  const p = cellPasses(ds, filter, settings, i);
  return p.inRegion && p.passesTx && p.passesStim;
}

/** True iff at least one filter dimension is constraining. The activity
 *  filter is active whenever any stimulus is toggled on; an empty
 *  selection means "no constraint". */
export function anyFilterActive(ds: NeuronDataset, filter: FilterState): boolean {
  const stimsActive = filter.selectedStimuli.length > 0;
  return (
    filter.isolatedRegion >= 0 ||
    filter.isolatedFish >= 0 ||
    (filter.txMode === 'gene' && filter.selectedGenes.length > 0) ||
    (filter.txMode === 'subtype' && !filter.clusterAll) ||
    stimsActive
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
): void {
  const { count, regionIds, clusterIds, geneCounts, geneBinary, stimulusCorr, activityTrace, traceLength } = ds;
  const { colors, alphas, sizes } = out;
  const G = ds.geneNames.length;
  const S = ds.stimulusNames.length;
  // Activity scheme: clamp the URL-restored sample index into the
  // valid range so a stale share link from a different dataset can't
  // index out-of-bounds. Anchors are fixed at [0, 1.5] ΔF/F in v1;
  // see plan note re: deferred SettingsState tunables.
  const activitySample = Math.max(0, Math.min(traceLength - 1, filter.activitySample | 0));
  const ACTIVITY_LO = 0.0;
  const ACTIVITY_HI = 1.5;
  const activityRange = Math.max(0.001, ACTIVITY_HI - ACTIVITY_LO);

  const useLog = filter.geneScale !== 'linear';
  const isolatedRegion = filter.isolatedRegion;
  // Stim cutoffs come from user settings; STIM_RANGE is derived. We
  // tolerate stimHi <= stimLo by clamping the divisor to something
  // small but positive so plasma still maps without dividing by zero.
  const stimLo = settings.stimLo;
  const stimRange = Math.max(0.001, settings.stimHi - settings.stimLo);
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
    filter.txMode === 'subtype' ||
    (filter.txMode === 'gene' && geneSel.length === 0);
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

  for (let i = 0; i < count; i++) {
    let r = 0, g = 0, b = 0, alpha = 0.85, size = baseSize;

    const p = cellPasses(ds, filter, settings, i);
    const inSet = p.inRegion && p.passesTx && p.passesStim;

    if (!inSet) {
      // Two-tier dim: anatomical-context lift when the cell is inside
      // the focused region but fails another predicate; otherwise the
      // full background dim.
      r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2];
      alpha = (p.inRegion && isolatedRegion >= 0) ? LIFT_ALPHA : DIM_ALPHA;
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
              // predicate the filter uses (binary or spot-count > 0).
              let n = 0;
              if (settings.geneStrict) {
                for (let k = 0; k < N; k++) if (geneBinary[base + geneSel[k]] === 1) n++;
              } else {
                for (let k = 0; k < N; k++) if (geneCounts[base + geneSel[k]] > 0) n++;
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
          // 1D plasma over normalized stim correlation, anchored at the
          // user-configurable thresholds in SettingsState: r ≤ stimLo is
          // the "stim-unresponsive" floor (faint backdrop), r ≥ stimHi
          // saturates plasma's bright end. Co-coding emerges by composing
          // this scheme with a single-gene filter — the gene predicate
          // drops gene-negative cells, leaving only gene+ cells painted
          // by their stim correlation.
          let rawA: number;
          if (!useStimMax) {
            rawA = stimulusCorr[i * S + stimSel[0]];
          } else if (stimMaxIndices === null) {
            // Max over every stimulus index 0..S-1.
            const base = i * S;
            let m = stimulusCorr[base];
            for (let j = 1; j < S; j++) {
              const c = stimulusCorr[base + j];
              if (c > m) m = c;
            }
            rawA = m;
          } else {
            // Max over the user-selected subset.
            const base = i * S;
            let m = stimulusCorr[base + stimMaxIndices[0]];
            for (let k = 1; k < stimMaxIndices.length; k++) {
              const c = stimulusCorr[base + stimMaxIndices[k]];
              if (c > m) m = c;
            }
            rawA = m;
          }
          const v = Math.max(0, Math.min(1, (rawA - stimLo) / stimRange));
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
}
