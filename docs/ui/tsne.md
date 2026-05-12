---
title: t-SNE panel
description: The 2D transcriptomic embedding view, lasso selection, and how it links to the 3D viewer.
---

# t-SNE panel

The 2D scatter plot at the bottom-right of the screen. Every dot is the same cell as in the 3D viewer, plotted in the t-SNE embedding — a non-linear projection of each cell's gene expression vector that puts transcriptomically similar cells near each other regardless of where they are in the brain.

## What it's good for

- **Spotting transcriptomic clusters.** Cells of the same subtype tend to form a tight blob even when their anatomical positions are spread out.
- **Lasso-selecting an arbitrary group.** Drag-select a cluster in t-SNE and the same cells light up in 3D — answering "where in the brain does this transcriptomic group sit?"
- **Cross-checking a filter.** A filter that should produce a clean transcriptomic group (e.g. a single Subtype) should produce a compact island in t-SNE.

## Controls

| Action | Result |
|---|---|
| **Drag** | Lasso-select. Cells inside the polygon become the [selection](/selections). |
| **Click a cell** | Focus that cell — same as in the 3D viewer. |
| **Right-drag** *or* **Shift+drag** | Pan the t-SNE viewport. |
| **Mouse wheel** | Zoom in / out. |
| **Clear-selection button** | Top of the panel — drops any active lasso or focused cell. |

## Linked behavior

- A lasso in t-SNE highlights the same cells in the 3D viewer with extra brightness and a size bump.
- A click-focused cell in either panel highlights itself in both.
- The lasso polygon and the focused-cell id are both encoded in the [URL hash](/sharing), so a shared link reproduces the selection exactly.

::: tip Selection vs. filter
A lasso doesn't filter — it **highlights** on top of the current filter result. To narrow the visible set instead, use the filter cards. To highlight inside a filter (e.g. "of all `pou4f2_cckb` cells, just the ones in this t-SNE corner"), filter then lasso.
:::

## What the cells in t-SNE are colored by

The same Colors scheme that paints the 3D viewer. The t-SNE is a *projection* of the same cells, not a separate dataset — pick **Colors → Region** and the t-SNE colors show how cleanly transcriptomic clusters map to anatomy; pick **Colors → Gene expression** with one gene pinned and the t-SNE shows that gene's expression density across the embedding.

## Implementation note

The embedding was computed offline as part of the manuscript pipeline. The preprocessor centers and scales it to roughly the `[-50, 50]` box so panel pixel projection doesn't depend on the upstream scale. ([Preprocessing](/preprocess#tsne))
