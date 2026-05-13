---
title: Data flow
description: How the published dataset becomes the rendered point cloud.
---

# Data flow

![Pipeline: the published dataset on Figshare is converted by a preprocessing step into a bundle that the viewer fetches at startup into an in-memory dataset, which is reduced each frame to per-cell visibility, color, and size buffers and drawn by the GPU into the 3D viewer, t-SNE, and Detail panel.](/data-flow.svg)

The viewer runs entirely in the browser. There is no backend or database — only static files served alongside the page.

## Source dataset

The WARP dataset is hosted on [Figshare](https://figshare.com/s/d1d19b105c4f74865c32) and is the canonical source for the underlying measurements:

- **Per-specimen folders** containing gene spot counts, electrophysiological recordings, brain masks, and the upstream registrations.
- **Post-processed analysis arrays** produced by the manuscript pipeline: cluster labels, registered coordinates, binary gene calls, stimulus correlations, mean ΔF/F traces, and the t-SNE embedding.

The viewer does not read these files directly; they are first converted by a one-time preprocessing step.

## Preprocessing

A Python script reduces the published arrays to web-friendly binary blobs and a JSON manifest. This stage incorporates several decisions about which cells to retain and how each quantity is encoded — see [Preprocessing](/preprocess) for the full list. The principal transformations are:

- Cells without valid coordinates are excluded; approximately 274,455 cells are retained.
- Coordinates are reordered and centered, and the AP axis is flipped so that anterior renders upward.
- Calcium traces are downsampled 2× (268 → 134 samples, 2 Hz → 1 Hz) with negligible perceptual loss on the smooth ΔF/F signal.
- Traces are quantized to uint16 over an auto-fit range, reducing file size and enabling browser caching across reloads.
- Region names are attached to the 16 focal anatomical groupings carried in the dataset.
- Cluster labels are aligned so that index 0 corresponds to *Unassigned* and indices 1…332 correspond to the 332 named subtypes.

The output is a manifest plus ten binary blobs totaling approximately 210 MB.

## Loading

On page load the manifest is fetched first, followed by parallel requests for each binary blob. Each blob is decoded into a typed array sized to the cell count declared in the manifest. After gzip the on-the-wire payload is substantially smaller than the on-disk total, and quantized traces remain in the browser's HTTP cache so subsequent loads are markedly faster.

If the manifest is missing, the loader surfaces an error. Appending `?mock=1` to the URL bypasses real data and synthesizes a 10,000-cell dataset suitable for UI demonstration.

## In-memory representation

After loading, all per-cell quantities are held in a single in-memory dataset:

- 3D positions and t-SNE coordinates,
- per-cell gene spot counts (41 genes) and curated binary gene calls,
- transcriptomic cluster, anatomical region, and source-specimen indices,
- quantized mean ΔF/F traces (134 samples per cell),
- per-stimulus Pearson correlations (8 stimuli per cell),
- name arrays for genes, clusters, regions, and stimuli,
- supporting metadata including the trace sample rate and stimulus on-windows.

## Rendering

On each render the viewer:

1. Walks the cell array once, computing per-cell visibility (from the four filter cards), color (RGBA), and size.
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
