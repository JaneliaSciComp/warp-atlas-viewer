---
title: Sharing views
description: How the URL hash encodes view state, and what it contains.
---

# Sharing views

Every meaningful piece of view state is encoded in the URL hash (the `#…` portion of the address bar). Copying the URL and reopening it elsewhere reproduces the same view — identical filters, colors, camera, and selection.

## Contents of the hash

| Group | Examples |
|---|---|
| **Filter cards** | Color scheme, pinned genes, gene OR/AND, subtype, selected stimuli, region, specimen. |
| **Settings** | Point size, pan toggle, stim cutoffs, activity anchors, gene-spot ceiling, multi-gene mode, gene predicate. |
| **3D camera** | Position and orbit target. |
| **t-SNE viewport** | Pan and zoom. |
| **Selection** | Focused-cell id; lasso polygon (when present). |
| **Activity time** | When Colors is set to Activity, the current sample index. |

## What is *not* in the hash

- The loaded cells, gene names, cluster names, and similar dataset content — these are common to all users.
- Activity playback state. The cursor position is encoded, but whether playback is running is not.
- Detail-panel scroll position.

## Sharing

1. Configure the view as desired.
2. Copy the URL from the address bar.
3. Send the link. Opening it elsewhere reproduces the view.

::: tip Bookmarks reproduce views as well
Browser bookmarks store the full URL and can therefore be used to maintain a set of favorite views.
:::

## Limitations

### Hash size limit

Browsers cap URLs at approximately 2 KB. Most view states are well below this limit, but a large lasso polygon (many vertices) can exceed it.

When the hash would be too long, the viewer falls back in two stages:

1. The lasso polygon is dropped; all other state is preserved. A warning is logged to the console.
2. If the URL is still too long, the entire hash is dropped and the link opens in the default view. A second warning is logged.

If a recipient sees an empty view, redraw the lasso with fewer vertices and resend.

### Dataset version drift

The hash references genes and clusters by **name** rather than by numeric index, so a shared link is robust to dataset re-numbering. If a gene or cluster is renamed in a future dataset version, the link decodes to a missing reference and the corresponding card silently reverts to "all". This is a deliberate choice: silent fallback is preferred over a hard failure when opening a shared link.
