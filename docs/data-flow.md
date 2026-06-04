---
title: Data flow
description: How the published dataset becomes the rendered point cloud.
---

# Data flow

![Pipeline: the published dataset on Figshare is converted by a preprocessing step into a bundle that the viewer fetches at startup into an in-memory dataset, which is reduced each frame to per-cell visibility, color, and size buffers and drawn by the GPU into the 3D viewer, t-SNE, and Detail panel.](/data-flow.svg)

The viewer runs entirely in the browser. There is no backend or database, only static files served alongside the page.

## Source dataset

The WARP dataset is hosted on [Figshare](https://figshare.com/s/d1d19b105c4f74865c32) and is the canonical source for the underlying measurements:

- **Per-specimen folders** containing gene spot counts, electrophysiological recordings, brain masks, and the upstream registrations.
- **Post-processed analysis arrays** produced by the manuscript pipeline: cluster labels, registered coordinates, binary gene calls, stimulus correlations, mean ΔF/F traces, and the t-SNE embedding.

The viewer does not read these files directly; they are first converted by a one-time preprocessing step.

The functional quantities shown in the viewer are summary arrays from the published analysis pipeline. The viewer does not load raw imaging movies, raw trial series, electrophysiology traces, or the full behavioral analyses used in the manuscript.

## Preprocessing

A Python script reduces the published arrays to web-friendly binary blobs and a JSON manifest. This stage incorporates several decisions about which cells to retain and how each quantity is encoded. See [Preprocessing](/preprocess) for the full list. The principal transformations are:

- Cells without valid coordinates are excluded; approximately 274,455 cells are retained.
- Coordinates are reordered and centered, and the AP axis is flipped so that anterior renders upward.
- Calcium traces ship at the published 2 Hz sampling rate (268 samples per cell over a 134 s mean stimulus cycle).
- Traces are quantized to uint16 over an auto-fit range, halving the file size and enabling browser caching across reloads.
- Region names are attached to the 16 focal anatomical groupings carried in the dataset.
- The overlapping 112-region [mapZebrain](https://mapzebrain.org) atlas membership matrix is packed into a 14-byte-per-cell bitfield.
- Cluster labels are aligned so that index 0 corresponds to *Unassigned* and indices 1…332 correspond to the 332 named subtypes.
- Each binary blob is gzipped on disk; the bundle is decompressed by the browser at load time.

The output is a manifest plus 12 gzipped binary blobs totaling approximately 125 MB on disk.

## Loading

On page load the manifest is fetched first, followed by parallel requests for each gzipped blob. The viewer pipes each response body through `DecompressionStream('gzip')` (or accepts the auto-decoded body in dev environments that set `Content-Encoding: gzip`), then decodes the result into a typed array sized to the cell count declared in the manifest. Quantized traces remain in the browser's HTTP cache so subsequent loads are markedly faster.

If the manifest is missing, the loader surfaces an error. Appending `?mock=1` to the URL bypasses real data and synthesizes a 10,000-cell dataset suitable for UI demonstration.

## In-memory representation

After loading, all per-cell quantities are held in a single in-memory dataset:

- 3D positions and t-SNE coordinates,
- per-cell gene spot counts (41 genes) and curated binary gene calls,
- transcriptomic cluster, focal-region, and source-specimen indices,
- mapZebrain 112-region atlas membership (packed bitfield, 14 bytes per cell),
- quantized mean ΔF/F traces (268 samples per cell at 2 Hz),
- per-stimulus Pearson correlations (8 stimuli per cell, cycle-wide),
- per-cell Pearson correlation against estimated swim power,
- name arrays for genes, clusters, focal regions, atlas regions, and stimuli,
- supporting metadata including the trace sample rate and stimulus on-windows.

## Rendering

On each render the viewer:

1. Walks the cell array once, computing per-cell visibility (from the active filter cards), color (RGBA), and size.
2. Uploads the resulting buffers to the GPU.
3. Draws the full point cloud in a single GPU draw call using a custom shader.

Changing a color scheme or filter re-runs this single pass; the viewer does not maintain a separate "filtered subset" structure.

## Three views, one source

The 3D viewer, t-SNE panel, and Detail panel all read from the same in-memory dataset:

- The 3D viewer plots cell positions with the shared color, alpha, and size buffers.
- The t-SNE panel plots the precomputed embedding with the same buffers.
- The Detail panel indexes the gene, trace, and correlation arrays for the current selection.

Because the views share the underlying buffers, selections propagate across views without requiring separate highlight state.

## See also

- [Preprocessing](/preprocess) — full list of transformations applied to the published arrays.
- [Sharing views](/sharing) — what the URL hash encodes.
