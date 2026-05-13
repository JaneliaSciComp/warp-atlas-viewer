---
title: Settings
description: Threshold cutoffs, ramp anchors, point size, and the gene-expression predicate.
---

# Settings

The **Settings** tab in the bottom panel holds the parameters that are not part of the everyday filter loop. All values are persisted in the [URL hash](/sharing).

A **↺ reset settings** button at the top of the tab reverts everything to defaults; it is disabled when no setting has been changed.

---

## Cell point size

Base point size in pixels for both the 3D viewer and the t-SNE scatter. Cells in a t-SNE lasso selection receive an additional 1.5× boost; a focused cell is brightened and marked with a white ring.

- **Default:** `8.5`.
- **Range:** 2 – 20.

## Camera panning

When **off** *(default)*, the orbit pivot is locked to the volume center and rotation always pivots around the volume's axes. When **on**, right-drag pans the camera and rotation then pivots around the panned point — useful for focusing inspection on a specific region, but easier to disorient.

Touch and trackpad users sometimes prefer pan enabled; mouse users typically leave it off.

## Gene plasma ceiling

Upper anchor for the **Gene expression** color scheme's plasma ramp, expressed as a raw FISH spot count. Cells above this value saturate at the bright end of the ramp.

The default is chosen so that the brightest typical gene does not saturate cells of interest. Adjust to match the practical ceiling of the panel's spot-count distribution.

- **Range:** 50 – 5000 spots.

## Multi-gene coloring

Controls what the [Gene color scheme](/filters/colors#multi-gene-mode-2-genes-pinned) displays when two or more genes are pinned:

- **Max** — strongest single gene per cell.
- **Sum** — total spot count across the pinned genes; emphasizes co-expression strength.
- **Richness** — count of pinned genes a cell expresses, using the [gene-expression predicate](#gene-expression-predicate) below.

This setting has no effect with a single gene pinned.

## Stim correlation cutoffs

Two anchors on the same row:

- **responsive floor (r ≥)** — cells below this Pearson r are treated as non-responsive. Used by both:
  - the [Visual Stimuli filter](/filters/stimuli#how-responsive-is-defined) (visibility),
  - the [Stim correlation color scheme](/filters/colors#stim-correlation) (dim end of the ramp).
- **saturation (r ≥)** — cells with r above this anchor saturate at the bright end of the ramp.

Defaults are floor `0.30` and saturation `0.65`. Lower the floor to be more permissive; raise it to be stricter.

## Activity ΔF/F anchors

Two anchors for the [Activity color scheme](/filters/colors#activity):

- **floor (ΔF/F)** — cells at or below this value map to the dim end of the plasma ramp.
- **ceiling (ΔF/F)** — cells at or above this value saturate at the bright end.

The default range accommodates quiet cells at the dim end while allowing peaks to saturate.

## Gene expression predicate

Defines what counts as "expressing" a gene, for the [gene filter](/filters/transcriptomics#what-counts-as-expressing-a-gene) and for the [Richness multi-gene coloring](#multi-gene-coloring) above:

- **Binary call** *(default)* — uses the curated, conservative classification from the manuscript pipeline.
- **Any detected** — more permissive; any non-zero raw FISH spot count.

## What Settings does not control

The Settings tab governs thresholds and palette anchors. The following are intentionally excluded:

- the active color scheme (use the [Colors card](/filters/colors)),
- selections (use [click or lasso](/selections)),
- the 3D camera position (orbit and wheel),
- the t-SNE viewport (pan and zoom).

These are also stored in the URL hash, but outside the Settings tab.
