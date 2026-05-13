---
title: t-SNE panel
description: The 2D transcriptomic projection, lasso selection, and its link to the 3D viewer.
---

# t-SNE panel

The 2D scatter plot at the bottom-right of the screen. Every point corresponds to the same cell as in the 3D viewer, projected into the t-SNE embedding so that transcriptomically similar cells appear nearby regardless of their anatomical position.

## Uses

- **Identifying transcriptomic clusters.** Cells of the same subtype tend to form compact regions in the embedding even when their anatomical positions are dispersed.
- **Lasso-selecting an arbitrary group.** A polygon drawn in the t-SNE selects the enclosed cells; the same cells are then highlighted in the 3D viewer, answering "where in the brain does this transcriptomic group reside?"
- **Cross-checking a filter.** A filter that should isolate a clean transcriptomic group (e.g. a single Subtype) is expected to produce a compact island in the t-SNE.

## Controls

| Action | Result |
|---|---|
| **Drag** | Lasso-select; enclosed cells become the [selection](/selections). |
| **Click a cell** | Focus that cell, as in the 3D viewer. |
| **Right-drag** or **Shift+drag** | Pan the t-SNE viewport. |
| **Mouse wheel** | Zoom in or out. |
| **Clear-selection button** | Top of the panel when a lasso is active; clears the lasso selection. |

## Linked behavior

- A lasso in the t-SNE highlights the same cells in the 3D viewer with increased brightness and size.
- A click-focused cell in either panel is highlighted in both.
- Focus and lasso are independent: clicking a cell does not discard an existing lasso, and drawing a lasso does not clear focus. The Detail panel gives focus precedence until focus is cleared.
- The lasso polygon and focused-cell id are encoded in the [URL hash](/sharing), so a shared link reproduces the selection when the lasso polygon fits within the hash cap.

::: tip Selection versus filter
A lasso does not filter; it **highlights** on top of the current filter result. To narrow the visible set, use the filter cards. To highlight within a filter (e.g. the `pou4f2_cckb` cells in a particular t-SNE region), filter first and then lasso.
:::

## Coloring

The t-SNE panel uses the same Colors scheme as the 3D viewer. Because the t-SNE is a projection of the same cells (not a separate dataset), switching schemes is informative: **Colors → Region** reveals how cleanly transcriptomic clusters align with anatomy, while **Colors → Gene expression** with one gene pinned shows that gene's expression density across the embedding.
