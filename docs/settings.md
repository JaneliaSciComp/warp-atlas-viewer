---
title: Settings
description: Tunable cutoffs, ramp anchors, point size, and the gene-expression predicate.
---

# Settings

The **Settings** tab in the bottom panel holds the tunables that aren't part of the everyday filter loop. Every value persists in the [URL hash](/sharing).

A **↺ reset settings** button at the top of the tab reverts everything to defaults; it's disabled when no setting is non-default.

---

## Cell point size

Base point size in pixels for both the 3D viewer and the t-SNE scatter. User-selected cells get an extra ×1.5 boost on top.

- **Default:** ~3 px on standard DPI. Bump up on high-DPI screens or when cells look undersized.
- **Range:** 2 – 20.

## Camera panning

When **off** *(default)*, the orbit pivot is locked to the volume center — rotation always pivots around the volume's own axes (predictable). When **on**, right-drag pans the camera and rotation pivots around the panned point (more flexible, but easier to lose orientation).

Touch / trackpad users sometimes prefer pan on; mouse users tend to leave it off.

## Gene plasma ceiling

Upper anchor for the **Gene** color scheme's plasma ramp (in raw FISH spot count). Cells above this value saturate at the bright end of the ramp.

Tune to match the practical ceiling of the dataset's probe panel. Defaults are picked to keep the brightest typical gene from saturating cells you care about.

- **Range:** 50 – 5000 spots.

## Multi-gene coloring

What the [Gene color scheme](/filters/colors#multi-gene-mode-2-genes-pinned) paints when 2 or more genes are pinned:

- **Max** — strongest single gene per cell.
- **Sum** — total spot count across the pinned genes (emphasises co-expression strength).
- **Richness** — count of pinned genes the cell expresses, using the [Gene expression predicate](#gene-expression-predicate) below.

This setting only kicks in with multiple genes pinned — with one pinned gene the scheme is unambiguous.

## Stim correlation cutoffs

Two anchors on the same row:

- **responsive floor (r ≥)** — Cells below this Pearson r are treated as non-responsive. Used by both:
  - the [Visual Stimuli filter](/filters/stimuli#how-responsive-is-defined) (visibility),
  - the [Stim correlation color scheme](/filters/colors#stim-correlation) (dim end of the ramp).
- **saturation (r ≥)** — Cells with r above this anchor saturate at the bright end of the plasma ramp.

Default floor is `0.1`, default saturation is `0.6`. Lower the floor to be more permissive; raise to be stricter.

## Activity ΔF/F anchors

Two anchors for the [Activity color scheme](/filters/colors#activity):

- **floor (ΔF/F)** — cells at or below this trace value map to the dark end of the plasma ramp.
- **ceiling (ΔF/F)** — cells at or above this value saturate at the bright end.

Tune to match the practical dynamic range of the dataset's calcium traces. The default range is wide enough that quiet cells go dark and the brightest peaks saturate.

## Gene expression predicate

How "expresses a gene" is decided for the [gene filter](/filters/transcriptomics#what-counts-as-expressing-a-gene) and the [Richness multi-gene coloring](#multi-gene-coloring) above:

- **Binary call** *(checked, default)* — uses the dataset's curated, conservative classification (the per-cell `geneBinary === 1` flag from the manuscript pipeline). Tracks the paper's calls.
- **Any detected** *(unchecked)* — more permissive — any raw FISH spot count above zero. Useful for hunting low-level expression that the binary call rejects.

## What's not in Settings

Settings tunes *thresholds and palette anchors*. The things it intentionally does **not** touch:

- The active color scheme (use the [Colors card](/filters/colors)).
- Which cells are selected (use [click / lasso](/selections)).
- The 3D camera position (orbit / wheel directly).
- The t-SNE viewport (pan / zoom directly).

All of those are stored in the URL hash too, just outside the Settings tab.
