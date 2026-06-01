---
title: Exporting cells
description: Download the cells you're currently looking at as a CSV file.
---

# Exporting cells

The viewer's header includes an **Export** button next to *Links*. It opens a dialog that summarises what's about to be saved and triggers a CSV download.

## Scope: the "effective set"

The export matches what the [Detail panel](/ui/detail) and the visible-cell readout in the [Filters tab](/filters/overview) describe — the *effective set* — by this precedence:

1. If you have an active **selection** (a 3D viewer click-group or a t-SNE lasso), the export covers exactly those cells, intersected with the active filters.
2. Otherwise the export covers every cell that passes the currently active filter cards.
3. With no filter and no selection, every cell in the dataset is exported.

The dialog tells you which case applies in plain English and reports the row count before you commit.

## CSV columns

Each row is one cell. Columns appear in this stable order so downstream parsers can rely on positions:

| # | Column | Notes |
|---:|---|---|
| 1 | `cell_id` | 0-based index into the in-memory arrays for the currently loaded dataset. Stable across reloads of the same bundle. |
| 2–4 | `x`, `y`, `z` | Viewer coordinates in the [mapzebrain](https://mapzebrain.org) frame: axis-reordered, centered on the population mean, AP axis flipped. Matches what you see on screen. Two decimal places. |
| 5–6 | `tsne_x`, `tsne_y` | 2D t-SNE embedding, scaled to roughly the `[-50, 50]` box. Two decimal places. |
| 7 | `fish` | Source specimen as 1, 2, or 3 (user-facing labels). |
| 8 | `manuscript_region` | The paper's 16-region abbreviation (or `Unassigned`). |
| 9 | `mapzebrain_regions` | Semicolon-separated list of the cell's 112-region atlas memberships. May be empty for cells outside every atlas region. |
| 10 | `cluster` | Transcriptomic subtype name (one of the 332 named subtypes or `Unassigned`). |
| 11 → `10+G` | `gene_<name>` | Raw FISH spot count per gene in the panel (currently 41 genes). Integer-formatted. |
| `11+G` → `10+G+S` | `corr_<name>` | Signed Pearson r between the cell's calcium trace and each stimulus regressor (currently 8 stimuli). Three decimal places. |
| `11+G+S` | `swim_corr` | Signed Pearson r between the calcium trace and estimated swim power. Three decimal places. |

Header row is included. Values containing commas, quotes, or newlines are escaped per RFC 4180 (wrap in `"..."`, double any embedded quotes).

## Activity traces (optional)

The dialog has an opt-in checkbox **Include the 134-sample mean ΔF/F activity trace**. When ticked, the export appends 134 columns at the end of each row — `dff_t0`, `dff_t1`, …, `dff_t133` — one per trace sample, in the [preprocessed 1 Hz timebase](/preprocess#trace-downsampling). For the WARP dataset the index doubles as the sample's time in seconds.

It's default-off because traces roughly **double the file size** and add 134 columns that most spreadsheet-driven analyses don't want. Leave it on when you intend to recompute correlations or fit your own models against the raw trace.

## What's never included

- **Binary gene calls.** Reconstructable from `gene_*` columns plus the paper's per-gene threshold; see the [Transcriptomics filter](/filters/transcriptomics) doc for thresholds.
- **Filter or settings state.** Not part of the row data — share the URL to reproduce the view that produced an export.
- The full per-trial calcium recordings, raw imaging data, electrophysiology, and behavioral analyses live in the [source dataset on Figshare](https://figshare.com/s/d1d19b105c4f74865c32).

## File naming

`warp-export-YYYYMMDD-HHMMSS-Ncells.csv`, timestamped in local time so multiple exports during one session don't collide.

## Tips

- A typical filtered export (a few thousand to a few tens of thousands of cells) opens cleanly in any spreadsheet or notebook environment.
- Worst case is the full population with no filter (~274k cells × ~60 columns ≈ 150 MB; with traces enabled ~300 MB). The dialog shows an estimated size before you commit — narrow the filter first if that's larger than you intended.
- Floating-point precision is fixed (2 decimals for coordinates, 3 for correlations and ΔF/F) — enough headroom for downstream analysis without bloating the file.
