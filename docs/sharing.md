---
title: Sharing views
description: How the URL hash encodes view state, and what it contains.
---

# Sharing views

Every meaningful piece of view state is encoded in the URL hash (the `#…` portion of the address bar). Copying the URL and reopening it elsewhere reproduces the same view, with identical filters, colors, camera, panel visibility, and selection.

## Contents of the hash

| Group | Examples |
|---|---|
| **Filter cards** | Color scheme, region palette, pinned gene indices, gene OR/AND, subtype index, selected stimuli, stim mode, swim mode, anatomy atlas (Manuscript or [mapZebrain](https://mapzebrain.org)), region, specimen, show-unassigned-region toggle. |
| **Settings** | 3D point density (auto, scale by filter, scale by depth, manual point size + ghost visibility), 3D camera controls (object-centric rotation, momentum), t-SNE point density (size + ghost visibility), rendering options (3D ambient occlusion, AO strength/radius, opaque active cells, active brightness), projection mode/threshold/sum exposure, fade-weak-correlation toggle, stim cutoffs including split +/− saturation, swim cutoffs, activity anchors, gene-spot ceiling, multi-gene mode, gene predicate, brain-model toggles and their per-mesh opacity, debug-overlay toggle. |
| **3D camera** | Position, orientation (as a quaternion), orbit target/pivot, and optional screen-space pan. |
| **t-SNE viewport** | Pan and zoom. |
| **Selection** | Focused-cell id; lasso polygon (when present). |
| **Activity time** | When Colors is set to Activity, the current sample index and playback speed. |
| **Panel visibility** | Whether the Detail panel or bottom panel is collapsed, and the dragged size of each (bottom-panel height, Detail-panel width, t-SNE panel width). |

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
