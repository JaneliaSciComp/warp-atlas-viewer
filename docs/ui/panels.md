---
title: Layout & panels
description: Where each panel sits, and how to collapse or expand them.
---

# Layout & panels

The viewer occupies a single full-screen page divided into four regions.

![Conceptual layout of the WARP viewer: 3D viewer occupies the top-left, the filter strip the bottom-left, the t-SNE panel the bottom-right, and the detail panel the right edge.](/layout-overview.svg)

## 3D viewer

The large area filling most of the screen. Every visible cell is rendered as a GPU point in [mapZebrain](https://mapzebrain.org) coordinates. The [color legend](/ui/legend) appears in the top-right corner for color schemes that need a mapping. See [3D viewer](/ui/viewer) for controls.

## t-SNE panel

Bottom-right. A 2D scatter plot of every cell's t-SNE embedding; transcriptomically similar cells appear nearby regardless of anatomical position. Supports independent pan and zoom and is the locus of [lasso selection](/selections#lasso-in-the-t-sne). See [t-SNE panel](/ui/tsne).

::: tip Resize
Drag the **left edge** of the t-SNE panel to widen or narrow it; the filter strip beside it gives up or reclaims the freed space. The edge highlights faintly and the cursor changes to a horizontal-resize arrow on hover, like the other panel resizers. **Double-click** any of these handles to snap that panel back to its default size. The chosen width is remembered in the URL, like the bottom-panel height and Detail-panel width.
:::

## Detail panel

Collapsible panel along the right edge. Populates on click-focus, lasso selection, the current filter intersection, or — when neither filter nor selection narrows the view — a summary across all cells in the dataset. Displays a gene bar chart, the mean ΔF/F trace overlaid with stimulus on-windows, a per-stimulus correlation chart, and a swim-correlation histogram. See [Detail panel](/ui/detail).

::: tip Collapse & resize
Click the **‹** handle on the right edge of the 3D viewer to toggle the Detail panel. Drag the panel's **left edge** (it highlights on hover) to resize it; **double-click** that edge to reset the width to its default. The width is remembered in the URL.
:::

## Filter strip (bottom panel)

Collapsible panel in the bottom-left with three tabs:

- **Filters** — five cards (Colors, Transcriptomics, Visual Stimuli, Swim, Anatomy) controlling visibility and coloring. See [filters overview](/filters/overview).
- **Settings** — threshold cutoffs, ramp anchors, point density, projection, rendering, and camera behavior. See [Settings](/settings).
- **About** — a condensed viewer overview, documentation link, and the [paper presets](/findings).

::: tip Collapse & resize
Click the **⌄** handle at the bottom edge of the 3D viewer to hide the filter strip. Drag the **divider** along the top of the strip (it highlights on hover) to resize it; **double-click** the divider to reset the height to its default. The height is remembered in the URL.
:::

## Color legend

Top-right corner of the 3D viewer. The legend adapts to the active color scheme:

- **Region / Specimen** — categorical swatches.
- **Simple** — no legend; all visible cells use the same highlight color.
- **Gene expression / Stim correlation / Activity** — plasma ramp with numeric anchors.

See [Color legend](/ui/legend) for the details of each variant.
