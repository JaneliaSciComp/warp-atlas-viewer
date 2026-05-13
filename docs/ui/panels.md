---
title: Layout & panels
description: Where each panel sits, and how to collapse or expand them.
---

# Layout & panels

The viewer occupies a single full-screen page divided into four regions:

![Conceptual layout of the WARP viewer: 3D viewer occupies the top-left, the filter strip the bottom-left, the t-SNE panel the bottom-right, and the detail panel the right edge.](/layout-overview.svg)

## 3D viewer

The large area filling most of the screen. Every visible cell is rendered as a GPU point in mapzebrain coordinates. The [color legend](/ui/legend) appears in the top-right corner. See [3D viewer](/ui/viewer) for controls.

## t-SNE panel

Bottom-right. A 2D scatter plot of every cell's t-SNE embedding; transcriptomically similar cells appear nearby regardless of anatomical position. Supports independent pan and zoom and is the locus of [lasso selection](/selections#lasso-in-the-t-sne). See [t-SNE panel](/ui/tsne).

## Detail panel

Right edge. Populates on click-focus or lasso selection, displaying a gene bar chart, the mean ΔF/F trace overlaid with stimulus on-windows, and a per-stimulus correlation chart. See [Detail panel](/ui/detail).

::: tip Collapse handle
Click the **‹** handle on the right edge of the 3D viewer to toggle the Detail panel.
:::

## Filter strip (bottom panel)

Bottom-left. A tab shell with three tabs:

- **Filters** — four cards (Colors, Transcriptomics, Visual Stimuli, Anatomy) controlling visibility and coloring. See [filters overview](/filters/overview).
- **Settings** — threshold cutoffs, ramp anchors, point size. See [Settings](/settings).
- **Help** — a condensed version of this guide and the [paper presets](/findings).

::: tip Collapse handle
Click the **⌄** handle at the bottom edge of the 3D viewer to hide the filter strip.
:::

## Color legend

Top-right corner of the 3D viewer. The legend adapts to the active color scheme:

- **Simple / Region / Specimen** — categorical swatches.
- **Gene expression / Stim correlation / Activity** — plasma ramp with numeric anchors.

See [Color legend](/ui/legend) for the details of each variant.

## Bottom-edge metadata strip

Above the filter strip, a single-line summary reports:

- the number of cells currently visible (after filters),
- the number of cells currently selected (lasso or focus),
- the active color scheme.

This serves as a quick check that a filter combination has not inadvertently emptied the view.
