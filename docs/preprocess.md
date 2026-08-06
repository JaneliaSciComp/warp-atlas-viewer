---
title: Preprocessing
description: The one-time conversion from the published dataset to the binary bundle the viewer loads.
---

# Preprocessing

The viewer does not load the published `.npy` files directly. A one-time preprocessing step reads the Figshare distribution and writes a manifest plus a set of typed-array blobs that together make up the bundle the viewer fetches at startup.

This page documents the decisions baked into that conversion, so that quantities seen in the viewer can be related back to the published dataset.

## Input and output

![Preprocessing reduces a ~30 GB source — per-specimen folders and post-processed analysis arrays — to a ~125 MB output bundle of a neurons.json manifest plus gzipped typed-array blobs (positions, genes, traces, atlas membership, …).](/preprocess-io.svg)

## Transformations, in order

### Cell filter

Only cells with valid coordinates are retained; approximately 274,455 cells pass through every subsequent step. NaN values in the calcium-trace, stimulus-correlation, and swim-correlation arrays are zero-filled rather than dropped, so a cell retains its position and transcriptomic identity even when its functional readout is unavailable.

### Coordinate reorientation

- Axes are reordered to match the renderer's convention.
- Coordinates are centered on the origin so that the orbit pivot is meaningful.
- The AP axis is flipped so that anterior renders upward.

### Trace sample rate {#trace-sample-rate}

The published calcium traces are 268 samples at 2 Hz, representing a 134 s mean stimulus cycle. The preprocessor ships them at this native rate; no temporal downsampling is applied.

These traces are representative mean stimulus cycles from the published post-processed arrays, not raw trial-by-trial recordings.

### Trace quantization

The traces are affine-quantized to uint16 over an auto-fit range. The quantization step is roughly three orders of magnitude below the per-sample measurement noise, making the conversion effectively lossless, and the uint16 storage halves the file size relative to float32.

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

The integer-to-name mapping isn't shipped with the source data. It was recovered by intersecting `Brain_reg.npy` with `BrainRegions_All.npy` (the cell × 112-atlas-region matrix) and resolving ties against the paper's 16-region list. The default region colors are sampled directly from the paper's region figure legend (`data/brain_regions.png`), with optional Turbo and high-contrast categorical palettes available in the same 16-region slot order; *Unassigned* is rendered as a dedicated neutral gray rather than a hue in every palette.

### Atlas regions (mapZebrain 112) {#atlas-regions}

The published dataset also ships a 112-region [mapZebrain](https://mapzebrain.org) atlas (*Modified from Kunst et al., 2019*) as a cell × region boolean matrix in `BrainRegions_All.npy`, with names in each fish's `region_names.npy`. The atlas is hierarchical and overlapping: each cell can sit in 0–9 regions (e.g. a cerebellar cell is in both `cerebellum` and `rhombencephalon`).

The preprocessor packs this matrix into a 14-byte little-endian bitfield per cell (~3.84 MB in memory; shipped as `atlasRegionMask.bin.gz`, ~0.12 MB on disk) and emits the cleaned region names (`_` → space) in the manifest as `atlasRegionNames`. The viewer decodes membership with `(mask[i*14 + (r>>3)] >> (r&7)) & 1`. The 112-region atlas is filter-only. It does not drive a color scheme.

### Stimulus on-windows

The stimulus on-windows, in seconds, are extracted from the regressor traces and written into the manifest. The Detail panel uses these to shade the corresponding bands on the ΔF/F trace.

### Stimulus correlations

The viewer loads `big_corr_regsAllMix` from the published dataset. This array holds the **cycle-wide** Pearson r between each cell's activity trace and each stimulus regressor (maximum of the regular and delayed variants), and the manuscript uses it for Fig 5C/D and for naming stimulus-responsive subtypes. The dataset also publishes a windowed variant (`high_corr_perSimMix`, median across the 9 presentations); that array biases everything positive and is not currently surfaced in the viewer.

### Swim correlation

The viewer loads `swim_corr_All`, the per-cell Pearson r between each cell's calcium activity and estimated swim power (windowed variance of the ephys tail-electrode channel). NaN values are zero-filled in the same pattern as the stimulus correlations. This is the channel surfaced by the [Swim card](/filters/swim) and the swim color scheme.

### Gzip {#gzip}

Each binary blob is written to disk as `<name>.bin.gz` (gzip level 6). Static hosts such as GitHub Pages and S3 serve these files opaquely, and the viewer decompresses them in the browser via `DecompressionStream('gzip')`. Compression varies sharply by file: the sparse gene-call and atlas-membership bitfields collapse to a few percent of their raw size, while the noise-dominated activity trace lands around 77%. The overall on-disk bundle is approximately 125 MB versus ~225 MB raw.

## Manifest

The manifest is a small JSON file that records:

- cell count and the counts of genes, clusters, regions, atlas regions, and stimuli,
- name arrays (genes, clusters, focal regions, mapZebrain atlas regions, stimuli),
- stimulus on-windows in seconds,
- the trace sample rate (2 Hz, the published native rate),
- quantization parameters needed to recover trace values,
- the list of binary blob filenames. Per-blob byte sizes aren't shipped; the viewer derives them from the cell count, gene count, and other scalars above.

The viewer fetches the manifest first, then issues the remaining requests for the binary blobs in parallel.

## Brain meshes (mapZebrain) {#brain-meshes}

`scripts/fetch_meshes.py` downloads mapZebrain's three whole-brain reference
meshes and converts them into the viewer's coordinate space. It is optional —
the viewer runs without it, and the **Brain models** controls in Settings stay
disabled until it has been run. It needs network access and must run *after*
`scripts/preprocess.py`, which emits the `voxelCenter` it reads.

```bash
python3 scripts/fetch_meshes.py
```

| mesh | source | triangles |
|---|---|---|
| outline | `api.mapzebrain.org/media/Brains/Outline/Outline_new.stl` | 54,874 |
| fibers | `api.mapzebrain.org/media/Brains/Fibers/Fibers.stl` | 9,758 |
| cell bodies | `api.mapzebrain.org/media/Brains/Cell_bodies/Cell bodies.stl` | 9,756 |

The meshes are generated on mapZebrain's side from the reference-brain TIFF
masks by ImageJ's 3D Viewer, so their vertices are in **reference-volume voxel
indices** (597 × 974 × 359 = LR × AP × DV) — the same space as the WARP
dataset's `Coords_All.npy`. Converting them is therefore exactly the transform
preprocessing already applies to cell positions:

```
out_x =   stl_x - voxelCenter[0]     # LR
out_y = -(stl_y - voxelCenter[1])    # AP, negated so rostral is +y
out_z =   stl_z - voxelCenter[2]     # DV
```

`voxelCenter` is read from `neurons.json` rather than hardcoded, so the mesh
center cannot drift from the cell center.

### Three coordinate spaces {#coordinate-spaces}

Worth keeping straight, because two of them look alike:

| space | x | y | z |
|---|---|---|---|
| mapZebrain voxel / WARP raw | LR column | AP row (caudal +) | DV slice (dorsal +) |
| preprocessed (`positions.bin`) | lateral, centered | rostral + | dorsal + |
| world (what the camera sees) | rostral + | lateral | dorsal + |

The last hop is a group transform in the viewer, not in preprocessing — see
`src/components/brain/volumeTransform.ts`. It rotates the volume 90° so the
brain's long axis lies across the wide 3D panel, which is why the default view
shows the fish pointing screen-right. It is also a mirror (determinant −1), so
anatomical left/right in world space cannot be derived from the voxel axes.

### Output

Blobs are non-indexed float32 vertex positions, 9 floats per triangle, gzipped
like every other binary. They get their **own** manifest rather than entries in
`neurons.json`, which keeps the primary load path untouched and lets the viewer
fetch a mesh lazily, only when a toggle turns it on.

```
preprocessed/meshOutline.bin.gz      0.59 MB gz  (1.98 MB raw)
preprocessed/meshFibers.bin.gz       0.10 MB gz  (0.35 MB raw)
preprocessed/meshCellBodies.bin.gz   0.10 MB gz  (0.35 MB raw)
preprocessed/meshes.json
```

### Self-check

The script asserts each mesh's triangle count matches its STL header and that
the transformed outline mesh encloses the cell bounds from `neurons.json` on all
six faces, exiting non-zero and naming the offending axis otherwise. That
containment is what catches a coordinate-transform regression; without it a
wrong flip produces a brain drawn confidently in the wrong place.

## Mock data

Appending `?mock=1` to the viewer URL bypasses the preprocessed bundle and synthesizes a 10,000-cell dataset with plausible gene, cluster, and stimulus distributions. Mock data is intended for UI demonstration only; none of the numerical values are meaningful.
