---
title: Glossary
description: Terms and abbreviations used in the WARP Atlas Viewer and these docs.
---

# Glossary

## Cells & anatomy

**Cell** / **neuron**
: One dot in the viewer. ~274,000 total, pooled from 3 source fish.

**Specimen** / **fish**
: One of the 3 source fish — originally Fish 1 / 2 / 3 in the raw data, remapped to 0 / 1 / 2 by the preprocessor.

**Region**
: One of 16 focal anatomical groupings (plus "Unassigned" at index 0). Collapsed from a ~112-region atlas by a hand-built mapping. See [Preprocessing → Anatomy mapping](/preprocess#anatomy-mapping).

**Mapzebrain**
: The shared zebrafish brain coordinate frame the 3 fish were co-registered into. The viewer's 3D positions are in mapzebrain coordinates.

**AP axis**
: Anterior–posterior axis. The preprocessor flips it so anterior renders at the top of the screen.

## Transcriptomics

**FISH**
: Fluorescence in-situ hybridization. The technique used to count transcripts per cell.

**Spot count**
: Number of FISH transcript spots detected for one gene in one cell. The raw count, before any binary call.

**Binary call**
: A curated, conservative classification ("does this cell express this gene?") from the manuscript pipeline. Used as the default predicate for the [gene filter](/filters/transcriptomics#what-counts-as-expressing-a-gene) and the [Richness multi-gene coloring](/filters/colors#multi-gene-mode-2-genes-pinned).

**Gene panel**
: The 41 marker genes in the dataset. The full list is visible in the Transcriptomics card's gene dropdown.

**Subtype** / **cluster**
: One of 333 molecularly-defined functional groups, named `gene1_gene2[_gene3]` after their dominant markers (e.g. `pou4f2_cckb`). Index 0 is `Unassigned`.

**Gene richness**
: Count of the 41 panel genes that a cell expresses. The default driver of the Gene expression color scheme when no specific gene is pinned.

## Activity

**ΔF/F**
: "Delta F over F" — relative change in fluorescence; the standard readout of neural activity in calcium imaging. Higher = more active.

**Calcium trace**
: A cell's ΔF/F as a function of time over the 134-second representative cycle.

**Regressor**
: A boxcar (or smoothed) trace of when each stimulus was on. The viewer correlates each cell's trace against each regressor to compute the per-stimulus Pearson r.

**Pearson r**
: Linear correlation coefficient between two signals. Ranges from -1 to +1. Used to score each cell's responsiveness to each stimulus.

**Responsive floor**
: The Pearson r threshold above which a cell is considered "responsive." Default `r = 0.1`. Tunable in [Settings](/settings#stim-correlation-cutoffs).

**On-window**
: The time interval during which a stimulus was on. The Detail-panel ΔF/F trace shades on-windows as vertical bands.

## Visualization

**Plasma**
: A perceptually uniform colormap that runs dark purple → magenta → orange → yellow. Used for the Gene expression, Stim correlation, and Activity color schemes. Color-blind safe.

**Categorical palette**
: A discrete set of colors for the Region (16-way) and Specimen (3-way) schemes.

**t-SNE**
: A non-linear dimensionality reduction (Stochastic Neighbor Embedding) that puts transcriptomically similar cells near each other in 2D. The viewer's t-SNE panel is a precomputed embedding loaded as part of the dataset.

**Lasso**
: A polygon drawn in the t-SNE panel to select cells. See [Selections](/selections).

**Click-focus**
: Selecting a single cell by clicking it. See [Selections](/selections).

**Plasma ramp anchors**
: The numeric values at the bright and dim ends of the plasma ramp. Configurable per color scheme in [Settings](/settings).

## Software

**Mock data**
: A 10,000-cell synthetic dataset the viewer falls back to when `?mock=1` is appended to the URL. Lets you demo the UI without the preprocessed bundle.

**Manifest**
: `preprocessed/neurons.json` — the small JSON file that tells the viewer how many cells, gene names, blob filenames, etc. Loaded first; everything else streams in parallel after.

**Typed-array blob**
: A `.bin` file containing a raw `Float32Array` / `Uint16Array` / `Uint8Array` payload. Decoded directly into a JS typed array by the loader.

**URL hash**
: The `#…` part of the address bar. Stores the full app state for sharing. See [Sharing views](/sharing).
