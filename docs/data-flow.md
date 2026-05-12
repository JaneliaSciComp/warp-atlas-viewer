---
title: Data flow
description: From the raw paper dataset to the dots on your screen — what happens at each stage.
---

# Data flow

```
┌────────────────────────────────────────────────────────────┐
│  RAW DATA  (Figshare, ~30 GB)                              │
│  Fish1/, Fish2/, Fish3/ — spot counts, ephys, masks, …     │
│  postprocessed/  — cell-level analysis arrays              │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           │  scripts/preprocess.py
                           │  (one-time, Python + numpy)
                           ▼
┌────────────────────────────────────────────────────────────┐
│  PREPROCESSED  (~210 MB, ships with the viewer)            │
│  neurons.json — manifest                                   │
│  *.bin        — typed-array blobs (positions, genes, …)    │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           │  fetch() at startup
                           │  (browser, dataLoader.ts)
                           ▼
┌────────────────────────────────────────────────────────────┐
│  IN-MEMORY DATASET  (NeuronDataset object)                 │
│  Float32Array positions, Uint16Array spot counts, …        │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           │  filter + color compute
                           │  (useColoring.ts)
                           ▼
┌────────────────────────────────────────────────────────────┐
│  PER-CELL BUFFERS  (Float32Array color, alpha, size)       │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           │  GPU upload, one draw call
                           ▼
┌────────────────────────────────────────────────────────────┐
│  3D VIEWER  +  t-SNE  +  DETAIL PANEL                      │
└────────────────────────────────────────────────────────────┘
```

The viewer is entirely client-side. There is no backend, no database, no auth. Everything is static files plus client-side rendering.

## Stage 1 — Raw data on Figshare

The original WARP dataset is hosted on [Figshare](https://figshare.com/s/d1d19b105c4f74865c32). It is the source of truth and comes from the manuscript pipeline:

- **Per-fish folders** (`Fish1/`, `Fish2/`, `Fish3/`) — gene spot counts, ephys recordings, brain masks, the upstream registrations, etc.
- **`postprocessed/`** — cell-level analysis arrays produced by the paper authors: cluster labels, registered coordinates, binary gene calls, stimulus correlations, mean ΔF/F traces, t-SNE embedding.

The viewer never reads these files directly. They are converted by a one-time preprocessing step.

## Stage 2 — Preprocessing (one-time, Python)

`scripts/preprocess.py` converts the `.npy` analysis arrays to web-friendly binary blobs plus a JSON manifest. This is the place where editorial decisions about *which cells to keep* and *how to encode them* happen.

Key transformations (see [Preprocessing](/preprocess) for the full list):

- **Cell filter:** drop cells without valid coordinates; ~274,455 cells survive.
- **Coordinate fix:** reorder (z, x, y) → (x, y, z), center on origin, flip the AP axis so anterior renders at the top of the screen.
- **Downsample traces 2×:** 268 → 134 timepoints, 2 Hz → 1 Hz. Halves wire size with no perceptible loss.
- **Quantize traces to uint16:** trace files drop below the browser's per-resource HTTP-cache cap so they stick across reloads.
- **Remap fish IDs:** 59 / 63 / 71 → dense 0 / 1 / 2.
- **Anatomy mapping:** collapse the upstream ~112-region atlas to 16 focal regions, hard-coded.
- **Cluster alignment:** align cluster labels to names using `cluster_labelsAll2` (not the permuted `cluster_labelsAll3`), so index 0 is `Unassigned` and 1..332 align to the 332 named subtypes.

Output: `preprocessed/neurons.json` plus 10 `.bin` files (~210 MB total).

## Stage 3 — Loading into the browser

On page load, `dataLoader.ts` issues `fetch()` calls for the manifest and each of the binary blobs. Each blob is decoded into a typed array (`Float32Array`, `Uint16Array`, `Uint8Array`) sized to the cell count from the manifest.

Total on-the-wire payload after gzip is well below the ~210 MB on-disk number, but the browser still has to download it all once. The trace blob is quantized so it fits under the per-resource cache cap, which means it stays cached across reloads — second-load is much faster.

If `preprocessed/neurons.json` is missing the loader surfaces an error. Appending `?mock=1` to the URL bypasses the real data and synthesizes a 10,000-cell dataset for UI demos.

## Stage 4 — In-memory dataset

The result is a single in-memory **NeuronDataset** object containing:

- `positions: Float32Array` — `[x, y, z, x, y, z, …]`, one triplet per cell.
- `geneSpots: Uint16Array` — `[cell0_g0, cell0_g1, … cell0_g40, cell1_g0, …]`.
- `geneBinary: Uint8Array` — same shape, but the curated binary call.
- `clusterIds: Uint16Array` — cluster index per cell.
- `regionIds: Uint8Array` — region index per cell.
- `fishIds: Uint8Array` — 0 / 1 / 2 per cell.
- `meanTraces: Uint16Array` — quantized ΔF/F traces, `cellCount × traceLength`.
- `stimCorr: Float32Array` — Pearson r per cell × stimulus.
- `tsne: Float32Array` — `[u, v, u, v, …]` per cell.
- Name arrays (`geneNames`, `clusterNames`, `regionNames`, `stimulusNames`).

Plus precomputed metadata: `traceSampleRateHz`, `stimulusWindowsSec`, etc.

## Stage 5 — Filter + color compute

Every render the app:

1. Walks the cell array once, building a per-cell **visibility** (boolean from the four filter cards) and **color** (4 floats — R, G, B, alpha) and **size** scalar.
2. Uploads the resulting buffers to the GPU as Three.js BufferAttributes.
3. Draws the entire point cloud in one Three.js draw call using a custom GLSL shader.

The single-pass compute lives in `src/utils/coloring.ts`; the shader in `src/shaders/neuron.{vert,frag}.glsl`. Switching color schemes or filter cards is just a re-run of that pass — there's no separate "filtered subset" data structure.

## Stage 6 — Three views, one source

The 3D viewer, t-SNE panel, and Detail panel all read from the same in-memory dataset:

- **3D viewer** plots `positions` with the shared color / alpha / size buffer.
- **t-SNE panel** plots `tsne` with the same color / alpha / size buffer.
- **Detail panel** indexes into `geneSpots`, `meanTraces`, `stimCorr` for the current selection.

This is why selections cross views for free — there is no separate "highlighted-in-3D" vs. "highlighted-in-t-SNE" copy of the data.

## See also

- [Preprocessing](/preprocess) — the full list of transformations the Python script does.
- [Sharing views](/sharing) — what the URL hash encodes.
