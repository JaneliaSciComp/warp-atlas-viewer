---
title: Preprocessing
description: The one-time conversion from the published dataset to the binary bundle the viewer loads.
---

# Preprocessing

The viewer does not load the published `.npy` files directly. A one-time preprocessing step reads the Figshare distribution and writes a manifest plus a set of typed-array blobs that together make up the bundle the viewer fetches at startup.

This page documents the decisions baked into that conversion, so that quantities seen in the viewer can be related back to the published dataset.

## Input and output

![Preprocessing reduces a ~30 GB source — per-specimen folders and post-processed analysis arrays — to a ~150 MB output bundle of a neurons.json manifest plus typed-array blobs (positions, genes, traces, atlas membership, …).](/preprocess-io.svg)

## Transformations, in order

### Cell filter

Only cells with valid coordinates are retained; approximately 274,455 cells pass through every subsequent step. NaN values in the calcium-trace and stimulus-correlation arrays are zero-filled rather than dropped, so a cell retains its position and transcriptomic identity even when its functional readout is unavailable.

### Coordinate reorientation

- Axes are reordered to match the renderer's convention.
- Coordinates are centered on the origin so that the orbit pivot is meaningful.
- The AP axis is flipped so that anterior renders upward.

### Trace downsampling

The published calcium traces are 268 samples at 2 Hz. A 2× boxcar downsample yields 134 samples at 1 Hz. The same downsample is applied to the stimulus regressors so that on-window timings remain aligned with the cell traces.

These traces are representative mean stimulus cycles from the published post-processed arrays, not raw trial-by-trial recordings. The downsampling changes only the display bundle; it does not re-estimate response correlations.

### Trace quantization

The downsampled traces are affine-quantized to uint16 over an auto-fit range. The quantization step is roughly three orders of magnitude below the per-sample measurement noise, making the conversion effectively lossless. The resulting file fits below the browser's per-resource HTTP-cache limit and therefore persists across reloads.

### Specimen ID remapping

Source-specimen labels in the published data are remapped to a dense 0 / 1 / 2 for use within the viewer's arrays. Unknown labels raise an error rather than silently aliasing.

### t-SNE rescaling {#tsne}

The t-SNE embedding is centered and scaled to approximately the `[-50, 50]` box. This decouples the pixel projection in the viewer from the absolute scale of the upstream embedding.

### Cluster alignment

Indices 1…332 in the cluster array correspond one-to-one with the 332 named subtypes. Index 0 is reserved for *Unassigned*. Cluster *names* (e.g. `pou4f2_cckb`) are the stable identifiers across dataset versions; indices may shift.

### Region names {#anatomy-mapping}

The dataset assigns each cell to one of 16 focal anatomical groupings (plus *Unassigned* at index 0). The preprocessor attaches paper-canonical names to these 17 indices and emits them in the manifest:

| `Brain_reg` | Abbreviation | Full name |
|---:|---|---|
| 0 | Unassigned | (cells outside the 16 focal groupings) |
| 1 | InfMO | Inferior medulla oblongata |
| 2 | IntMO | Intermediate medulla oblongata |
| 3 | SupMO | Superior medulla oblongata |
| 4 | SupRaphe | Superior dorsal raphe |
| 5 | Cb | Cerebellum |
| 6 | Tg | Tegmentum |
| 7 | NI | Nucleus isthmi |
| 8 | OTpv | Optic tectum periventricular layer |
| 9 | OTnp | Optic tectum neuropil |
| 10 | Pt | Pretectum |
| 11 | preTh | Prethalamus |
| 12 | Th | Dorsal thalamus |
| 13 | Hab | Habenula |
| 14 | HypTh | Hypothalamus |
| 15 | SubP | Subpallium |
| 16 | Pal | Dorsal pallium |

The integer-to-name mapping isn't shipped with the source data — it was recovered by intersecting `Brain_reg.npy` with `BrainRegions_All.npy` (the cell × 112-atlas-region matrix) and resolving ties against the paper's 16-region list. The default region colors are sampled directly from the paper's region figure legend (`data/brain_regions.png`), with optional Turbo and high-contrast categorical palettes available in the same 16-region slot order; *Unassigned* is rendered as a dedicated neutral gray rather than a hue in every palette.

### Atlas regions (mapzebrain 112) {#atlas-regions}

The published dataset also ships a 112-region [mapzebrain](https://mapzebrain.org) atlas (*Modified from Kunst et al., 2019*) as a cell × region boolean matrix in `BrainRegions_All.npy`, with names in each fish's `region_names.npy`. The atlas is hierarchical and overlapping: each cell can sit in 0–9 regions (e.g. a cerebellar cell is in both `cerebellum` and `rhombencephalon`).

The preprocessor packs this matrix into a 14-byte little-endian bitfield per cell (`atlasRegionMask.bin`, ~3.84 MB) and emits the cleaned region names (`_` → space) in the manifest as `atlasRegionNames`. The viewer decodes membership with `(mask[i*14 + (r>>3)] >> (r&7)) & 1`. The 112-region atlas is filter-only — it does not drive a color scheme.

### Stimulus on-windows

The stimulus on-windows, in seconds, are extracted from the downsampled regressor traces and written into the manifest. The Detail panel uses these to shade the corresponding bands on the ΔF/F trace.

### Stimulus correlations

The viewer loads `big_corr_regsAllMix` from the published dataset — the **cycle-wide** Pearson r between each cell's activity trace and each stimulus regressor (maximum of the regular and delayed variants). This is the array the manuscript uses for Fig 5C/D and for naming stimulus-responsive subtypes. The dataset also publishes a windowed variant (`high_corr_perSimMix`, median across the 9 presentations); that array biases everything positive and is not currently surfaced in the viewer.

### Swim correlation

The viewer loads `swim_corr_All` — the per-cell Pearson r between each cell's calcium activity and estimated swim power (windowed variance of the ephys tail-electrode channel). NaN values are zero-filled in the same pattern as the stimulus correlations. This is the channel surfaced by the [Swim card](/filters/swim) and the swim color scheme.

## Manifest

The manifest is a small JSON file that records:

- cell count and the counts of genes, clusters, regions, atlas regions, and stimuli,
- name arrays (genes, clusters, focal regions, mapzebrain atlas regions, stimuli),
- stimulus on-windows in seconds,
- the trace sample rate (1 Hz after downsampling),
- quantization parameters needed to recover trace values,
- the list of binary blobs and their expected sizes.

The viewer fetches the manifest first to determine the size of each blob, then issues the remaining requests in parallel.

## Mock data

Appending `?mock=1` to the viewer URL bypasses the preprocessed bundle and synthesizes a 10,000-cell dataset with plausible gene, cluster, and stimulus distributions. Mock data is intended for UI demonstration only; none of the numerical values are meaningful.
