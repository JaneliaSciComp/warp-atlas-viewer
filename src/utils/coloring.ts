import type { NeuronDataset, FilterState, SelectionState } from '../data/types';
import { regionColor, plasma, bivariate } from './colorMaps';

const DIM_RGB: [number, number, number] = [0.30, 0.30, 0.32];
const DIM_ALPHA = 0.10;
const LIFT_ALPHA = 0.50;
const BASE_SIZE = 7.0;
const HIGHLIGHT_BOOST_SIZE = 1.5;

/** Stim-correlation thresholds. r ≥ STIM_LO is the standard "stimulus
 *  responsive" floor in zebrafish calcium imaging; r ≥ STIM_HI ≈ q97
 *  reaches full saturation in the bivariate palette. The activity
 *  filter predicate uses STIM_LO as its cutoff. */
const STIM_LO = 0.30;
const STIM_HI = 0.65;
const STIM_RANGE = STIM_HI - STIM_LO;

/** Gene scheme uses an ABSOLUTE scale on raw FISH spot counts — no
 *  per-gene normalization. 1000 is the dataset's practical ceiling. */
const GENE_MAX_SPOTS = 1000;
const GENE_LOG_DEN = Math.log(1 + GENE_MAX_SPOTS);

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
  i: number,
): CellPredicates {
  const G = ds.geneNames.length;
  const S = ds.stimulusNames.length;

  const inRegion =
    filter.isolatedRegion < 0 || ds.regionIds[i] === filter.isolatedRegion;

  const geneActive = filter.txMode === 'gene' && !filter.geneAll;
  const clusterActive = filter.txMode === 'subtype' && !filter.clusterAll;
  const passesTx = geneActive
    ? ds.geneBinary[i * G + filter.selectedGene] === 1
    : clusterActive
      ? ds.clusterIds[i] === filter.selectedCluster
      : true;

  const passesStim =
    filter.stimulusAll ||
    ds.stimulusCorr[i * S + filter.selectedStimulus] >= STIM_LO;

  return { inRegion, passesTx, passesStim };
}

/** True iff cell `i` is inside the intersection of every active filter. */
export function cellInSet(
  ds: NeuronDataset,
  filter: FilterState,
  i: number,
): boolean {
  const p = cellPasses(ds, filter, i);
  return p.inRegion && p.passesTx && p.passesStim;
}

/** True iff at least one filter dimension is constraining (not "all"). */
export function anyFilterActive(filter: FilterState): boolean {
  return (
    filter.isolatedRegion >= 0 ||
    (filter.txMode === 'gene' && !filter.geneAll) ||
    (filter.txMode === 'subtype' && !filter.clusterAll) ||
    !filter.stimulusAll
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
  selection: SelectionState,
  out: ColoringResult,
): void {
  const { count, regionIds, clusterIds, geneCounts, geneBinary, stimulusCorr } = ds;
  const { colors, alphas, sizes } = out;
  const G = ds.geneNames.length;
  const S = ds.stimulusNames.length;

  const useLog = filter.geneScale !== 'linear';
  const isolatedRegion = filter.isolatedRegion;

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
    let r = 0, g = 0, b = 0, alpha = 0.85, size = BASE_SIZE;

    const p = cellPasses(ds, filter, i);
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
        case 'gene': {
          const raw = geneCounts[i * G + filter.selectedGene];
          const v = useLog
            ? Math.min(1, Math.log(1 + raw) / GENE_LOG_DEN)
            : Math.min(1, raw / GENE_MAX_SPOTS);
          if (raw <= 0) {
            // Non-expresser inside the in-set: same faint backdrop as
            // the old gene scheme so plasma expressers still pop. When
            // a region is isolated, lift the in-region non-expressers
            // a notch so the region's outline reads through.
            r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2];
            alpha = isolatedRegion >= 0 ? LIFT_ALPHA : 0.10;
          } else {
            const c = plasma(v);
            r = c[0]; g = c[1]; b = c[2];
            alpha = 1.0;
            size = BASE_SIZE * (0.9 + 1.2 * v);
          }
          break;
        }
        case 'cluster': {
          if (clusterIds[i] !== filter.selectedCluster) {
            // Non-cluster cell. With the cluster filter active we'd
            // never reach here; without it, this is anatomical context
            // for the highlighted cluster. Lift in-region cells when a
            // region is isolated so the region's outline reads through.
            r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2];
            alpha = isolatedRegion >= 0 ? LIFT_ALPHA : 0.10;
          } else {
            // Vivid yellow (plasma's top stop), enlarged so the cluster
            // pops on the dark backdrop.
            r = 0.94; g = 0.97; b = 0.13;
            alpha = 1.0;
            size = BASE_SIZE * 1.4;
          }
          break;
        }
        case 'bivariate': {
          const ge = geneBinary[i * G + filter.selectedGene]; // 0 or 1
          const rawA = stimulusCorr[i * S + filter.selectedStimulus];
          const av = Math.max(0, Math.min(1, (rawA - STIM_LO) / STIM_RANGE));
          if (ge === 0 && av <= 0) {
            // Bivariate has four chroma layers competing for attention;
            // push the neutral cells well into the floor so the colored
            // layers dominate.
            r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2]; alpha = 0.06;
          } else {
            const c = bivariate(ge, av);
            r = c[0]; g = c[1]; b = c[2];
            // Co-coding cells (gene+ AND stim-correlated) are biologically
            // rare and the whole point of this view. Enlarge and saturate
            // them so they punch through the surrounding green/blue field.
            if (ge === 1 && av > 0) {
              alpha = 1.0;
              size = BASE_SIZE * (1.5 + 0.6 * av);
            } else if (ge === 0) {
              // Green cells (stim-only) are context for the co-coding
              // population — push them more transparent so the red
              // gene+/stim+ hits read as foreground.
              alpha = 0.5;
            }
          }
          // Gene-negative cells shrink slightly so the gene+ population
          // reads as "the foreground" by size too.
          if (ge === 0) size *= 0.8;
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
