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

Adjust **Settings → Point density**. With auto mode on *(default)* the point size is derived from the in-set cell count — small filtered subsets get bigger dots, full views get smaller dots. Turn auto off to pick a size by hand. High-DPI displays generally benefit from a larger value when manual. Lasso-selected cells receive an additional 1.5× boost, while a focused cell is marked with a white ring.

## Camera orientation feels lost after rotating

With **Camera panning** enabled in Settings, the orbit pivot tracks the panned point, which makes it easy to lose orientation after successive right-drags.

- Disable Camera panning so that rotation always pivots around the volume center, or
- refresh the page to reset the camera.

## Activity playback appears jittery at 100×

The renderer caps playback at approximately 60 fps and advances multiple samples per frame at high speeds. The motion appears less smooth at 100× because samples are being skipped per frame. Use 10× or 50× for the smoothest visual.

## "Gene expression" view appears uniformly dim

If **Colors → Gene expression** is active and the brain appears uniformly dark:

- No gene is pinned (the Transcriptomics toggle is set to **Subtype** or **All**, or **Gene** mode has no genes added), so the scheme falls back to [gene richness](/filters/colors#gene-richness-when-nothing-is-pinned). Try the **log scale** toggle in the same card.
- The **Gene plasma ceiling** in Settings may be set too high for the dataset's spot-count distribution, mapping typical values to the dim end. Reduce the ceiling.
- The currently pinned gene may be genuinely sparse. Choose another gene from the Transcriptomics gene row dropdown.

## "Stim correlation" view appears uniformly dim

If **Colors → Stim correlation** is active and almost every cell is dim:

- The **responsive floor (|r| ≥)** may be too high. The default is `0.13`; values much above that will hide increasingly many cells.
- The selected stimulus may have few responsive cells.
- The region in view may not encode the modality being queried.

## A cluster selection in Subtype mode shows no cells

Some clusters are small (< 100 cells) and can be entirely hidden by an overlapping Anatomy filter. Reset the Anatomy card to "all" and the cluster should reappear.

## A copied URL did not capture the expected state

Address-bar caches in browsers can lag the application state. After a state change, click into the address bar (or refresh) before copying to ensure the URL is current. During fast Activity playback the URL hash is briefly stale by design.

## Help, Filters, or Settings tab is empty after a dataset error

When data loading fails, some cards short-circuit to an empty state to avoid rendering against missing data. Resolve the data error first (see the top of this page); the tabs repopulate on reload.
