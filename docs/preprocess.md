---
title: Preprocessing
description: The one-time Python step that converts the raw paper dataset into web-friendly typed-array blobs.
---

# Preprocessing

The viewer doesn't load the raw `.npy` files directly. `scripts/preprocess.py` reads the Figshare dump and writes a manifest plus a handful of typed-array `.bin` blobs to `./preprocessed/`.

::: info You probably won't run this
End users of the deployed site never run preprocessing — they get the preprocessed bundle for free. This page exists so you can understand the editorial decisions baked into the data, not so you can replicate them.
:::

## Input → output

```
data/
  Fish1/, Fish2/, Fish3/    ── raw per-fish folders
  postprocessed/             ── cell-level analysis arrays
                                from the manuscript pipeline

           │
           ▼   python3 scripts/preprocess.py

preprocessed/
  neurons.json               ── manifest (cell count, names, ranges)
  *.bin                      ── typed-array blobs
                                (positions, gene matrices, traces, …)
```

Output is ~210 MB total. The raw input is ~30 GB.

## Transformations, in order

### Cell filter

Keep only cells with valid coordinates. The remaining ~274,455 cells pass through every other step. NaN values in the activity-trace and stim-correlation arrays are zero-filled (rather than dropping the cell entirely) so the cell still has a position and a transcriptomic identity even if the functional readout is missing.

### Coordinate fix

- Reorder `(z, x, y) → (x, y, z)` to match three.js convention.
- Center on the origin so the orbit pivot is meaningful.
- Flip the AP axis so anterior renders at the *top* of the screen instead of the bottom.

### Trace downsampling

The original calcium traces are 268 timepoints at 2 Hz. The preprocessor **boxcar-downsamples by 2×** to 134 timepoints at 1 Hz, halving the wire size with no perceptible loss for the smooth ΔF/F signals.

The same downsample is applied to the shared stimulus regressor traces so the on-window timings stay aligned with the cell traces.

### Trace quantization

The downsampled traces are **affine-quantized to uint16** over an auto-fit range. This roughly halves the trace file again and — crucially — pushes it below the browser's per-resource HTTP-cache cap, so the trace blob stays cached across reloads.

The quantization step (~1e-4) is ~1000× below per-sample measurement noise, so the loss is effectively lossless.

### Fish ID remap

Source fish are labeled `59 / 63 / 71` in the raw data. The preprocessor remaps them to a dense `0 / 1 / 2` for the viewer's arrays. Any unknown ID raises an error rather than silently aliasing to `0`.

### t-SNE rescaling {#tsne}

The t-SNE embedding is centered and scaled to roughly the `[-50, 50]` box. This keeps the t-SNE panel's pixel projection independent of the upstream embedding scale — change the upstream parameters and the viewer still renders to the same size.

### Cluster alignment

Indices 1..332 in `clusterIds` align one-to-one with the 332 named subtypes. Index 0 is reserved for `Unassigned`. The preprocessor uses `cluster_labelsAll2`, **not** the permuted `cluster_labelsAll3` — a subtle gotcha if you read the upstream files directly. Cluster *names* (e.g. `pou4f2_cckb`) are the stable identifier across dataset versions; the indices can shift.

### Anatomy mapping {#anatomy-mapping}

A hand-built `Brain_reg → anatomy` mapping collapses the upstream ~112-region atlas to the 16 focal regions the viewer exposes (plus "Unassigned" at index 0).

The mapping was recovered offline by intersecting `Brain_reg` with the 112-region atlas overlap and is hard-coded in the script. If the upstream atlas changes the mapping needs to be regenerated; this is *not* automatic.

### Stimulus on-windows

The preprocessor extracts the stimulus on-windows in seconds from the downsampled regressor traces and writes them into the manifest. The Detail panel's ΔF/F trace overlay reads these to shade the right vertical bands.

## Manifest

`neurons.json` is small (a few KB) and contains:

- Cell count and gene / cluster / region / stimulus counts.
- Name arrays (`geneNames`, `clusterNames`, `regionNames`, `stimulusNames`).
- Stimulus on-windows in seconds.
- The trace sample rate (1 Hz after the 2× downsample).
- Trace quantization parameters (offset + scale to invert the uint16 encoding).
- A list of binary blob filenames + their expected lengths.

The browser fetches the manifest first to learn how big each blob should be, then issues the blob fetches in parallel.

## Mock data

If you need to demo the UI without the full preprocessed bundle, append `?mock=1` to the viewer URL. The app synthesizes a 10,000-cell dataset with plausible gene / cluster / stimulus distributions and skips the `fetch()` calls entirely. Mock data is for UI demos only — none of the numbers are meaningful.
