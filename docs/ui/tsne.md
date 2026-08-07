---
title: t-SNE panel
description: The 2D transcriptomic projection, lasso selection, and its link to the 3D viewer.
---

# t-SNE panel

The 2D scatter plot at the bottom-right of the screen. ([Embedded
mode](#embedded-mode) instead renders it as a tab in the left sidebar.)
Every point corresponds to the same cell as in the 3D viewer, projected
into the t-SNE embedding so that transcriptomically similar cells appear
nearby regardless of their anatomical position.

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
| **Clear-selection button** | Top of the panel when a lasso is active; clears the lasso selection. (The filter row's always-present **t-SNE selection** card grows a clear button of its own while a lasso is active.) |

## Linked behavior

- A lasso in the t-SNE is treated as an **additional filter in the 3D viewer**: cells outside the lasso fade to the standard ghost recipe so the selected subset reads as the foreground population. In the t-SNE itself, non-selected cells soft-dim to the t-SNE ghost visibility (**Settings → t-SNE point density**, default `0.25`) so the rest of the population stays visible for re-lassoing. Selected cells are not re-tinted — they render at the active color scheme exactly, so the legend always describes what you see. If the palette reads too dark for emphasis, raise the **active brightness** in Settings.
- The t-SNE panel itself does **not** apply this 3D-side demotion to its own scatter: non-selected cells stay softly dimmed so the rest of the population is still visible and you can re-lasso a different subset without first clearing.
- A click-focused cell in either panel is highlighted in both with a white ring.
- Focus and lasso are independent: clicking a cell does not discard an existing lasso, and drawing a lasso does not clear focus. The Detail panel gives focus precedence until focus is cleared.
- The lasso polygon and focused-cell id are encoded in the [URL hash](/sharing), so a shared link reproduces the selection when the lasso polygon fits within the hash cap.

## Coloring

The t-SNE panel uses the same Colors scheme as the 3D viewer. Because the t-SNE is a projection of the same cells (not a separate dataset), switching schemes is informative: **Colors → Region** reveals how cleanly transcriptomic clusters align with anatomy, while **Colors → Gene expression** with one gene pinned shows that gene's expression density across the embedding.
