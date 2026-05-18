---
title: Sharing views
description: How the URL hash encodes view state, and what it contains.
---

# Sharing views

Every meaningful piece of view state is encoded in the URL hash (the `#…` portion of the address bar). Copying the URL and reopening it elsewhere reproduces the same view — identical filters, colors, camera, panel visibility, and selection.

## Contents of the hash

| Group | Examples |
|---|---|
| **Filter cards** | Color scheme, pinned gene indices, gene OR/AND, subtype index, selected stimuli, stim mode, swim mode, region, specimen, show-unassigned-region toggle. |
| **Settings** | Point size, stim cutoffs, swim cutoffs, activity anchors, gene-spot ceiling, multi-gene mode, gene predicate. |
| **3D camera** | Position and orbit target. |
| **t-SNE viewport** | Pan and zoom. |
| **Selection** | Focused-cell id; lasso polygon (when present). |
| **Activity time** | When Colors is set to Activity, the current sample index. |
| **Panel visibility** | Whether the Detail panel or bottom panel is collapsed. |

## Sharing

1. Configure the view as desired.
2. Copy the URL from the address bar.
3. Send the link. Opening it elsewhere reproduces the view.

::: tip Bookmarks reproduce views as well
Browser bookmarks store the full URL and can therefore be used to maintain a set of favorite views.
:::

## Limitations

### Hash size limit

The viewer caps encoded URL state at 6,000 bytes. Most view states are well below this limit, but a large lasso polygon (many vertices) can exceed it.

When the hash would be too long, the viewer falls back in two stages:

1. The lasso polygon is dropped; all other state is preserved. A warning is logged to the console.
2. If the URL is still too long, the entire hash is dropped and the link opens in the default view. A second warning is logged.

If a recipient does not see the lasso, redraw it with fewer vertices and resend.

### Dataset version drift

The hash references genes, clusters, regions, stimuli, and cells by numeric index. When opening a link against a different dataset bundle, the viewer sanitizes out-of-range indices back to safe defaults, but it cannot detect reordered names that still occupy valid indices. Shared links are therefore intended for the same dataset ordering they were created against.
