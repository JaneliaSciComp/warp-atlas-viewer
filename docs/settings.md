---
title: Settings
description: Threshold cutoffs, ramp anchors, point density, and the gene-expression threshold mode.
---

# Settings

The **Settings** tab in the bottom panel holds the parameters that are not part of the everyday filter loop. All values are persisted in the [URL hash](/sharing).

A **↺ reset settings** button at the top of the tab reverts everything to defaults; it is disabled when no setting has been changed.

A **show descriptions** checkbox sits next to the reset button. When unchecked, every per-section description paragraph is hidden so the tab compresses to titles and controls once the meanings are familiar. The preference is stored in `localStorage` rather than the URL hash, so it is a per-browser viewer-chrome choice and is not carried by shared links.

---

## Point density

A single section controlling both the **base point size** (pixels per cell in the 3D viewer and the t-SNE scatter) and the **ghost visibility** (how present out-of-filter cells are).

The default **Auto** mode derives both from the number of cells passing the active filters, in log space — small filtered subsets get bigger dots and dimmer ghosts; full views get smaller dots and brighter ghosts. Sample values for a ~274 000-cell dataset:

| in-set cells | point size | ghost visibility |
|---:|---:|---:|
| 50 | 20.0 | 0.25 |
| 1 000 | 16.5 | 0.43 |
| 10 000 | 13.8 | 0.56 |
| 50 000 | 12.0 | 0.65 |
| 100 000 | 11.2 | 0.69 |
| all (≈ 274 k) | 10.0 | 0.75 |

Turning Auto off exposes the two sliders directly:

- **point size (px)** — base size used for every cell. Cells in a t-SNE lasso selection receive an additional 1.5× boost; a focused cell is brightened and marked with a white ring. Range 2 – 20.
- **ghost visibility** (0..1) — `0` makes out-of-filter cells fully transparent and the click pickers skip them; `1` renders them at the standard dim alpha and keeps them fully pickable. Pickability flips off above the midpoint (slider ≥ 0.5).

The ghost setting also drives **render order**: out-of-filter cells render first and in-filter cells render last, so foreground (in-set) cells never get occluded by the dim background regardless of true 3D depth — even when ghosts are still visible.

## Gene plasma ceiling

Upper anchor for the **Gene expression** color scheme's plasma ramp, expressed as a raw FISH spot count. Cells above this value saturate at the bright end of the ramp.

The default is chosen so that the brightest typical gene does not saturate cells of interest. Adjust to match the practical ceiling of the panel's spot-count distribution.

- **Range:** 50 – 5000 spots.

## Multi-gene coloring

Controls what the [Gene color scheme](/filters/colors#multi-gene-mode-2-genes-pinned) displays when two or more genes are pinned:

- **Max** — strongest single gene per cell.
- **Sum** — total spot count across the pinned genes; emphasizes co-expression strength.
- **Richness** — count of pinned genes a cell expresses, using the [gene-expression threshold](#gene-expression-threshold) below.

This setting has no effect with a single gene pinned.

## Gene expression threshold

Defines what counts as "expressing" a gene, for the [gene filter](/filters/transcriptomics#what-counts-as-expressing-a-gene) and for the [Richness multi-gene coloring](#multi-gene-coloring) above:

- **Paper** *(default)* — uses the paper's per-gene spot-count cutoffs (typically 25 spots, adjusted per gene/fish via the Maximum-Deviation approach). Backed by `BinaryGenes_All` from the manifest.
- **Global** — applies a single user-set spot-count threshold uniformly across all genes via `geneCounts >= threshold`. The companion "global threshold (spots)" numeric input sets the cutoff; default `25`. Set to 1 for "any detected".

::: warning Subtypes are precomputed
Switching to Global threshold currently only affects the *gene filter* and the *gene-richness coloring*. Molecular subtype membership is precomputed from the paper's thresholds in the manifest, so a Subtype-mode filter doesn't shift when you change the global threshold.
:::

## Stim correlation cutoffs

Two anchors for the signed per-cell Pearson r between calcium activity and the stimulus regressor:

- **responsive floor (|r| ≥)** — the magnitude floor for the stim filter (cells must clear `±stimLo` per the active direction toggle on the [Visual Stimuli card](/filters/stimuli#direction-toggles)) and the **deadband** boundary for the divergent [Stim correlation color ramp](/filters/colors#stim-correlation).
- **saturation (|r| ≥)** — magnitude at which the divergent ramp reaches its endpoints. Does not affect the filter.

Defaults are floor `0.13` and saturation `0.30`. The floor matches the manuscript's full-vector responsive threshold (Methods: "Selecting positively and negatively correlated neurons"); the saturation sits near the 99th percentile of the cycle-wide correlation distribution.

## Swim correlation cutoffs

Two anchors for the signed per-cell correlation between calcium activity and estimated swim power:

- **responsive floor (|r| ≥)** — magnitude below which a cell is treated as unresponsive (neutral midpoint of the divergent color ramp; rejected by the swim filter unless `swimMode` is `off`).
- **saturation (|r| ≥)** — magnitude at which the divergent ramp reaches its endpoints.

Defaults are floor `0.10` and saturation `0.35`. The floor matches the manuscript's swim-correlation cutoff (Methods: "Correlation to swimming behavior"; R > 0.1 / R < −0.1 identifies the swim-related subtypes). Lower the floor to be more permissive in either direction.

## Fade weak correlations

When **on** *(default)*, the [Stim](/filters/colors#stim-correlation) and [Swim](/filters/colors#swim-correlation) divergent color ramps scale alpha by `|r|` so cells near the neutral midpoint fade into the dark background instead of competing with the colored extremes. Floor at 0.12 keeps midpoint cells faintly visible.

When **off**, every in-set cell renders at full opacity, including the bright midpoint of the divergent ramp — which can dominate visually on a dark background.

This setting interacts with the `visibleCount` reported in the [Filters tab](/filters/overview#visible-cell-readout): a cell counts as visible when its final alpha is ≥ 0.5, so cells faded out by this setting drop out of the count as well as out of the visual.

## Activity ΔF/F anchors

Two anchors for the [Activity color scheme](/filters/colors#activity):

- **floor (ΔF/F)** — cells at or below this value map to the dim end of the plasma ramp.
- **ceiling (ΔF/F)** — cells at or above this value saturate at the bright end.

The default range accommodates quiet cells at the dim end while allowing peaks to saturate.

## What Settings does not control

The Settings tab governs thresholds and palette anchors. The following are intentionally excluded:

- the active color scheme (use the [Colors card](/filters/colors)),
- selections (use [click or lasso](/selections)),
- the 3D camera position (orbit and wheel),
- the t-SNE viewport (pan and zoom).

These are also stored in the URL hash, but outside the Settings tab.
