---
title: Exporting cells
description: Download the cells you're currently looking at as a CSV file.
---

# Exporting cells

The viewer's header includes an **Export** button next to *Links*. It opens a dialog that summarises what's about to be saved and triggers a CSV download. In [embedded mode](/ui/viewer#embedded-mode) there is no header: the same dialog opens from the **export** icon on the orientation bar above the 3D view.

## Scope: the Detail-panel population

The export matches what the [Detail panel](/ui/detail) is currently describing, by this precedence:

1. If a **focused cell** is active (click a cell in the 3D viewer or t-SNE), the export covers that one cell.
2. Otherwise, if a **t-SNE lasso** is active, the export covers the lassoed cells.
3. Otherwise the export covers every cell that passes the currently active filter cards.
4. With no filter and no selection, every cell in the dataset is exported.

The dialog tells you which case applies in plain English and reports the row count before you commit.

## CSV columns

Each row is one cell. Columns appear in this order:

| # | Column | Notes |
|---:|---|---|
| 1 | `cell_id` | 0-based index into the in-memory arrays. |
| 2–4 | `x`, `y`, `z` | Viewer coordinates in the [mapZebrain](https://mapzebrain.org) frame: axis-reordered, centered on the population mean, AP axis flipped. These are *preprocessed* coordinates: the viewer additionally rotates the volume 90° for display, so they don't map one-to-one onto screen axes. Two decimal places. |
| 5–6 | `tsne_x`, `tsne_y` | 2D t-SNE embedding, scaled to roughly the `[-50, 50]` box. Two decimal places. |
| 7 | `fish` | Source specimen as 1, 2, or 3 (user-facing labels). |
| 8 | `manuscript_region` | The paper's 16-region abbreviation (or `Unassigned`). |
| 9 | `mapzebrain_regions` | Semicolon-separated list of the cell's 112-region atlas memberships. May be empty for cells outside every atlas region. |
| 10 | `cluster` | Transcriptomic subtype name (one of the 332 named subtypes or `Unassigned`). |
| 11 → `10+G` | `gene_<name>` | Raw FISH spot count per gene in the 41-gene panel. Integer-formatted. |
| `11+G` → `10+G+S` | `corr_<name>` | Signed Pearson r between the cell's calcium trace and each of the 8 stimulus regressors. Three decimal places. |
| `11+G+S` | `swim_corr` | Signed Pearson r between the calcium trace and estimated swim power. Three decimal places. |

Header row is included. Values containing commas, quotes, or newlines are escaped per RFC 4180 (wrap in `"..."`, double any embedded quotes).

## Activity traces (optional)

The dialog has an opt-in checkbox **Include the 268-sample mean ΔF/F activity trace**. When ticked, the export appends 268 columns at the end of each row (`dff_t0`, `dff_t1`, …, `dff_t267`), one per trace sample, at the [published 2 Hz sample rate](/preprocess#trace-sample-rate) — divide the index by 2 for the sample's time in seconds.

It's default-off because traces substantially increase file size and add 268 columns that most spreadsheet-driven analyses don't want. Leave it on when you intend to recompute correlations or fit your own models against the raw trace.

## What's never included

- **Binary gene calls.** Reconstructable from `gene_*` columns plus the paper's per-gene threshold; see the [Transcriptomics filter](/filters/transcriptomics) doc for thresholds.
- **Filter or settings state.** Not part of the row data — share the URL to reproduce the view that produced an export.
- The full per-trial calcium recordings, raw imaging data, electrophysiology, and behavioral analyses live in the [source dataset on Figshare](https://figshare.com/s/d1d19b105c4f74865c32).

## File naming

`warp-export-YYYYMMDD-HHMMSS-Ncells.csv`, timestamped in local time so multiple exports during one session don't collide.

## Tips

- A typical filtered export (a few thousand to a few tens of thousands of cells) opens in any spreadsheet or notebook environment.
- Worst case is the full population with no filter (~274k cells × ~60 base columns, plus 268 optional trace columns). The dialog shows an estimated size before you commit — narrow the filter first if that's larger than you intended.
- Floating-point precision is fixed (2 decimals for coordinates, 3 for correlations and ΔF/F) — enough headroom for downstream analysis without bloating the file.
