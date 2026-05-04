import type { NeuronDataset, FilterState, SelectionState } from '../data/types';
import { regionColor, viridis, bivariate } from './colorMaps';

const DIM_RGB: [number, number, number] = [0.30, 0.30, 0.32];
const DIM_ALPHA = 0.10;
const BASE_SIZE = 7.0;
const HIGHLIGHT_BOOST_SIZE = 1.5;

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

/**
 * Write per-neuron color/alpha/size into the supplied buffers, in-place.
 * Caller is expected to flag the corresponding BufferAttribute as needsUpdate.
 *
 * The function is intentionally a single pass over all neurons so we can
 * scale to 238k points without allocating per-neuron objects.
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

  // Precompute gene max for the (continuous) Gene color mode only.
  let geneMax = 0;
  if (filter.colorMode === 'gene') {
    const g = filter.selectedGene;
    for (let i = 0; i < count; i++) {
      const v = geneCounts[i * G + g];
      if (v > geneMax) geneMax = v;
    }
    if (geneMax === 0) geneMax = 1;
  }

  // Bivariate mode uses fixed thresholds — no per-frame data scan needed.
  // Gene axis is the dataset's curated binary call (BinaryGenes_All).
  // Activity axis: only cells with r ≥ 0.30 (the standard "stimulus
  // responsive" threshold in zebrafish calcium imaging) start to brighten;
  // r ≥ 0.65 (~q97) reaches full saturation. Below 0.30 → dark gray, so
  // the bulk of the brain stays as anatomical context.
  const STIM_LO = 0.30;
  const STIM_HI = 0.65;
  const STIM_RANGE = STIM_HI - STIM_LO;

  // Build a fast lookup of selected indices.
  const selSet = selection.indices.length > 0 ? new Set<number>(Array.from(selection.indices)) : null;
  // For small selections (e.g. clicking a single neuron), keep the rest of
  // the brain visible for anatomical context — only enlarge/brighten the
  // selected one. For larger group selections, dim non-members so the
  // selected group reads as a coherent shape.
  const dimNonSelected = selSet !== null && selSet.size > 50;

  const isolatedRegion = filter.isolatedRegion;

  for (let i = 0; i < count; i++) {
    let r = 0, g = 0, b = 0, alpha = 0.85, size = BASE_SIZE;

    switch (filter.colorMode) {
      case 'region': {
        const c = regionColor(regionIds[i]);
        r = c[0];
        g = c[1];
        b = c[2];
        break;
      }
      case 'gene': {
        const v = geneCounts[i * G + filter.selectedGene] / geneMax;
        if (v <= 0) {
          // Match the cluster-mode dim alpha (0.20) so non-expressers
          // read with the same anatomical-context brightness across
          // modes.
          r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2]; alpha = 0.20;
        } else {
          const c = viridis(v);
          r = c[0]; g = c[1]; b = c[2];
          // Sparse-gene populations are tiny relative to 274k cells; full
          // alpha + an expression-scaled size gradient (faintest cells
          // slightly smaller than background, brightest 2x) so the
          // population reads with both color and size cues.
          alpha = 1.0;
          size = BASE_SIZE * (0.9 + 1.2 * v);
        }
        break;
      }
      case 'cluster': {
        if (filter.selectedCluster < 0 || clusterIds[i] !== filter.selectedCluster) {
          // Slightly brighter dim than the global default — at 0.10 the
          // anatomical context is barely readable while the magenta
          // cluster pops; this lets the brain shape stay visible.
          r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2]; alpha = 0.20;
        } else {
          // Always magenta — consistent visual signature for "the selected
          // cluster" across cluster picks.
          r = 0.95; g = 0.15; b = 0.75;
          alpha = 0.95;
          size = BASE_SIZE * 1.2;
        }
        break;
      }
      case 'bivariate': {
        const ge = geneBinary[i * G + filter.selectedGene]; // 0 or 1
        const rawA = stimulusCorr[i * S + filter.selectedStimulus];
        const av = Math.max(0, Math.min(1, (rawA - STIM_LO) / STIM_RANGE));
        if (ge === 0 && av <= 0) {
          r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2]; alpha = DIM_ALPHA;
        } else {
          const c = bivariate(ge, av);
          r = c[0]; g = c[1]; b = c[2];
          // Co-coding cells (gene+ AND stim-correlated) are biologically
          // rare (~1–3% of cells per pair) and the whole point of this
          // view. Enlarge and saturate them so they punch through the
          // surrounding green/blue field; otherwise they get lost.
          if (ge === 1 && av > 0) {
            alpha = 1.0;
            size = BASE_SIZE * (1.5 + 0.6 * av);  // up to 2.1x at high a
          }
        }
        // Gene-negative cells (background and stim-only) shrink slightly
        // so the gene+ population reads as "the foreground" by size too.
        if (ge === 0) {
          size *= 0.8;
        }
        break;
      }
    }

    // Region isolation dims everything outside the selected region.
    if (isolatedRegion >= 0 && regionIds[i] !== isolatedRegion) {
      r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2]; alpha = DIM_ALPHA;
    }

    // Active selection: highlight selected, dim the rest if the group is
    // large enough that dimming aids comprehension.
    if (selSet) {
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
