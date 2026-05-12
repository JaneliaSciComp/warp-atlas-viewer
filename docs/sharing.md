---
title: Sharing views
description: How the URL hash encodes the app state, and what's stored in it.
---

# Sharing views

Every meaningful piece of app state lives in the URL hash (`#…` part of the address bar). Copy the URL, send it to anyone with access to the viewer, and they will see **the same view** — same filters, same colors, same camera, same selection.

## What's in the hash

| Group | Examples |
|---|---|
| **Filter cards** | Color scheme, pinned genes, gene OR/AND, subtype index, selected stimuli, region, specimen. |
| **Settings** | Point size, pan toggle, stim cutoffs, activity anchors, gene-spot ceiling, multi-gene mode, gene predicate. |
| **3D camera** | Position and orbit target. |
| **t-SNE viewport** | Pan and zoom. |
| **Selection** | Focused neuron id; lasso polygon (when present). |
| **Activity time** | When Colors is set to Activity, the current sample index. |

## What's *not* in the hash

- The list of loaded cells, gene names, cluster names, etc. — those come from the preprocessed dataset and are the same for everyone.
- Playback state for the Activity time slider. The cursor position is part of the URL, but whether playback was running isn't.
- Detail-panel scroll position.

## How to share

1. Get the view set up the way you want.
2. Copy the URL from the address bar.
3. Send the link. Opening it elsewhere reproduces the view exactly.

::: tip You can also bookmark
Browser bookmarks store the full URL, so they reproduce any view too — useful for keeping a "favorites" list of specific findings.
:::

## Caveats

### Hash size limit

Browsers cap URLs at around 2 KB. Most app states are well under that, but a large lasso polygon (a freeform outline with many vertices) can push the hash past the limit.

The app handles this in two steps:

1. **Drop the lasso polygon** from the hash, keep everything else. The view loses the lasso when opened from the copied link, but every other piece of state still reproduces. A warning logs to the JS console.
2. If the URL is still too long even without the lasso, **drop the whole hash**. The shared link comes up in the default view. Another warning logs.

If a recipient says "your link came up blank," re-lasso with fewer / simpler vertices and re-copy.

### Dataset version drift

The hash references genes and clusters by **name**, not by numeric index, so a shared link survives dataset re-numbering. But if a gene or cluster gets renamed in a future dataset version, the link could decode into a missing reference and the corresponding card silently reverts to "all". That's a deliberate trade-off: silent fallback beats a crash on opening someone else's link.

## Programmatic links

If you want to construct a link from outside the app (e.g. to deep-link from a paper or report), the safest path is:

1. Open the viewer.
2. Set the state you want using the UI.
3. Copy the resulting URL.

The hash format is intentionally undocumented and may change between viewer versions; treat it as opaque.
