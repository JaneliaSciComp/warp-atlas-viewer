---
title: Layout & panels
description: Where everything lives on screen, and how to collapse / expand the panels.
---

# Layout & panels

The viewer is one fullscreen page split into four regions:

```
┌────────────────────────────────────────────┐ ┌──────────┐
│                                            │ │          │
│              3D BRAIN VIEWER               │ │          │
│           color legend ──┐                 │ │          │
│                          │                 │ │          │
│                          │                 │ │  DETAIL  │
│                                            │ │          │
│                                ⌄ collapse  │ │ ‹ collapse│
├────────────────────────────────────────────┤ │          │
│                            │               │ │          │
│      FILTER STRIP          │   t-SNE       │ │          │
│      (Filters / Settings   │   PANEL       │ │          │
│         / Help)            │               │ │          │
│                            │               │ │          │
└────────────────────────────────────────────┴─┴──────────┘
```

## 3D viewer

The large area filling most of the screen. Renders every visible cell as a single GPU point cloud. The [color legend](/ui/legend) sits in the top-right corner of this panel. See [3D viewer](/ui/viewer) for controls.

## t-SNE panel

Bottom-right. A 2D scatter plot of every cell's t-SNE embedding — cells that are transcriptomically similar appear close together regardless of anatomy. Has its own pan / zoom, and is the home of [lasso selection](/selections#lasso-from-the-t-sne). See [t-SNE panel](/ui/tsne).

## Detail panel

Right edge. Populates when you click a cell or lasso a group. Contains a gene bar chart, the mean ΔF/F trace overlaid with stimulus on-windows, and a per-stimulus correlation chart. See [Detail panel](/ui/detail).

::: tip Collapse handle
Click the **‹** handle on the right edge of the 3D viewer to toggle the Detail panel.
:::

## Filter strip (bottom panel)

Bottom-left. A tab shell with three tabs:

- **Filters** — four cards (Colors, Transcriptomics, Visual Stimuli, Anatomy) that drive which cells are visible and how they're colored. See [filters overview](/filters/overview).
- **Settings** — tunable cutoffs, ramps, point size, etc. See [Settings](/settings).
- **Help** — short version of this guide, plus the one-click [paper presets](/findings).

::: tip Collapse handle
Click the **⌄** handle at the bottom edge of the 3D viewer to hide the filter strip.
:::

## Color legend (in-viewer overlay)

Top-right corner of the 3D viewer. Adapts to the active color scheme:

- **Simple / Region / Specimen** — categorical swatches.
- **Gene expression / Stim correlation / Activity** — plasma ramp with numeric anchors.

See [Color legend](/ui/legend) for what each variant shows.

## Bottom-edge metadata strip

Just above the filter strip, a single-line summary shows:

- Number of cells currently visible (after filters).
- Number of cells currently selected (lasso or focus).
- The active color scheme.

This is your at-a-glance check that a filter combination didn't accidentally hide everything.
