---
title: Troubleshooting
description: Common failure modes and how to resolve them.
---

# Troubleshooting

## Detail or bottom panels have disappeared

Both panels can be collapsed:

- The **‹** handle on the right edge of the 3D viewer toggles the Detail panel.
- The **⌄** handle on the bottom edge of the 3D viewer toggles the filter strip.

Click either handle to restore the panel.

## A shared URL does not restore the lasso

Shared URLs may exceed the viewer's hash cap, currently 6,000 bytes, when the lasso polygon is large. The viewer handles this in two stages:

1. The lasso polygon is dropped; everything else is preserved.
2. If still too long, the entire hash is dropped and the link opens in the default view.

If a recipient reports that the lasso is missing, redraw it with fewer vertices and resend. See [Sharing views → Limitations](/sharing#limitations).

## Cells appear too small or too large

Adjust **Settings → 3D point density**. With **auto** mode on *(default)* the point size is derived from the live 3D canvas height: short views use small points, around 600 px tall is roughly 9 px, and taller views continue to grow (about 17 px at 1500 px tall). Turn **auto** off to set the size by hand (range 1 – 40 px); high-DPI displays generally benefit from a larger value. Enable **scale by filter** (nested under auto) to additionally enlarge active cells when the filter narrows, up to 2× the auto base size at ~50 in-set cells. A focused cell is marked with a separate white ring instead of being resized.

For the t-SNE panel, use **Settings → t-SNE point density**. It has its own size and ghost-visibility sliders since its point field is much denser and there is no perspective falloff.

## Out-of-filter cells clutter the 3D view

Uncheck **Settings → 3D point density → show ghosts** to drop them entirely; the filtered population is then the only thing drawn, and clicks can only land on it. This works with **auto point sizes** left on, which the **3D ghost visibility** slider does not — auto derives its own visibility from the canvas height and hides the slider. To thin the haze rather than remove it, turn auto off and lower that slider instead. The t-SNE panel is separate either way.

## Camera orientation feels lost after panning

With default **Settings → 3D camera controls → object-centric rotation**, **right-drag** shifts the volume within the viewport (screen-space pan), but rotation still pivots around the volume center. If the view is far off-center, click the **reset view** button at the top-left of the 3D viewer to snap the camera, orbit target, and screen pan back to defaults.

If object-centric rotation is off, right-drag uses native trackball pan: it moves the orbit target, so later rotations pivot around that panned target. Refreshing or sharing preserves the full camera state (position, orientation, orbit target, and screen-space pan), so use **reset view** rather than refresh when you want to return to the default pose.

## Activity playback appears jittery at 100×

The renderer caps playback at approximately 60 fps and advances multiple samples per frame at high speeds. The motion appears less smooth at 100× because samples are being skipped per frame. Use 10× or 50× for the smoothest visual.

## "Gene expression" view appears uniformly dim

If **Colors → Gene expression** is active and the brain appears uniformly dark:

- No gene is pinned (the Transcriptomics toggle is set to **Subtype** or **All**, or **Gene** mode has no genes added), so the scheme falls back to [gene richness](/filters/colors#gene-richness-when-nothing-is-pinned). Try the **log scale** toggle in the same card.
- The **Gene plasma ceiling** in Settings may be set too high for the dataset's spot-count distribution, mapping typical values to the dim end. Reduce the ceiling.
- The currently pinned gene may be genuinely sparse. Choose another gene from the Transcriptomics gene row dropdown.

## "Stim correlation" view appears uniformly dim

If **Colors → Stim correlation** is active and almost every cell is dim:

- If the Visual Stimuli mode is `+ correlated`, `- anti-correlated`, or `± either`, the **responsive floor** may be too high. The default is `0.13`; values much above that will hide increasingly many cells.
- The saturation anchor may be too high for the selected stimulus, compressing most correlations toward the neutral midpoint. Lower **saturation** or enable **split +/− saturation** if the sign you care about is washed out.
- The selected stimulus may have few responsive cells.
- The region in view may not encode the modality being queried.

## A cluster selection in Subtype mode shows no cells

Some clusters are small (< 100 cells) and can be entirely hidden by an overlapping Anatomy filter. Reset the Anatomy card to "all" and the cluster should reappear.

## A copied URL did not capture the expected state

Address-bar caches in browsers can lag the application state. After a state change, click into the address bar (or refresh) before copying to ensure the URL is current. During fast Activity playback the URL hash is briefly stale by design.

## About, Filters, or Settings tab is empty after a dataset error

When data loading fails, some cards short-circuit to an empty state to avoid rendering against missing data. Resolve the data error first (see the top of this page); the tabs repopulate on reload.
