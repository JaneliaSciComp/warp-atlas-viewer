import type { NeuronDataset, FilterState, SelectionState } from '../data/types';
import { regionColor, plasma, bivariate } from './colorMaps';

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

  // Gene mode uses an ABSOLUTE scale on raw FISH spot counts — no
  // per-gene normalization. Each spot is a literal mRNA molecule, so
  // counts are directly comparable across cells and genes; dividing
  // by a per-gene max would impose a relative scale that doesn't
  // reflect the underlying biology. 1000 is the upper anchor (≈ the
  // dataset's practical ceiling); cells above it saturate.
  const GENE_MAX_SPOTS = 1000;
  const GENE_LOG_DEN = Math.log(1 + GENE_MAX_SPOTS);
  const useLog = filter.geneScale !== 'linear';

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
  // Only USER-explicit selections (3D click, t-SNE drag) deserve a
  // brightness/size boost. Filter-derived selections (region isolate,
  // cluster pick) already get their visual signature from the mode's
  // own coloring rules (region-isolation dim, cluster-magenta override),
  // so boosting *every* cell in a filter selection just makes the
  // anatomical-context cells overwhelm the actual signal — e.g. in gene
  // mode + isolate region, the non-expressing region cells drown out
  // the viridis gene-expression colors.
  const isUserSelection = selection.source === '3d' || selection.source === 'umap';

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
        const raw = geneCounts[i * G + filter.selectedGene];
        const v = useLog
          ? Math.min(1, Math.log(1 + raw) / GENE_LOG_DEN)
          : Math.min(1, raw / GENE_MAX_SPOTS);
        if (raw <= 0) {
          // Faint background; gene mode has continuous viridis signal
          // layered on top, so the non-expressers need to read as a
          // light shadow rather than a filled-in grey. (Cluster mode
          // can use a brighter dim because the magenta selection is
          // dominant; here the expressers compete with the backdrop.)
          r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2]; alpha = 0.10;
          // When isolating a region, lift in-region non-expressers a bit
          // above the out-of-region floor so the region's anatomical
          // outline reads through the viridis expressers.
          if (filter.isolatedRegion >= 0 && regionIds[i] === filter.isolatedRegion) {
            alpha = 0.6;
          }
        } else {
          const c = plasma(v);
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
          // Same faint background as gene mode — the bright cluster
          // cells carry the signal; the rest is anatomical context.
          r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2]; alpha = 0.10;
          // When isolating a region, lift the in-region non-cluster
          // cells so the anatomical region reads through the cluster
          // dots. Mirrors the gene-mode treatment.
          if (filter.isolatedRegion >= 0 && regionIds[i] === filter.isolatedRegion) {
            alpha = 0.6;
          }
        } else {
          // Vivid yellow (plasma's top stop), slightly larger so the
          // cluster pops on the dark backdrop the same way gene-mode
          // expressers do.
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
          // Co-coding has four chroma layers (gray/blue/green/red)
          // competing for attention; push the neutral background well
          // into the floor so the colored layers dominate.
          r = DIM_RGB[0]; g = DIM_RGB[1]; b = DIM_RGB[2]; alpha = 0.06;
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
          } else if (ge === 0) {
            // Green cells (stim-correlated only) are context for the
            // co-coding population — push them a bit more transparent
            // so the red gene+/stim+ hits read as the foreground.
            alpha = 0.5;
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
    // large enough that dimming aids comprehension. Only user-explicit
    // selections drive any of this — for filter-derived selections
    // (cluster, region) the mode's own case branch already picked the
    // right per-cell colour, and an extra dim-the-rest pass would just
    // clobber boosts the case branch put down (e.g. the in-region
    // non-cluster alpha-0.60 lift in cluster mode).
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
