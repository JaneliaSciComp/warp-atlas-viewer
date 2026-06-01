---
title: Glossary
description: Terms and abbreviations used in the WARP Atlas Viewer and these docs.
---

# Glossary

## Cells and anatomy

**Cell** / **neuron**
: One point in the viewer. Approximately 274,000 in total, pooled from 3 specimens.

**Specimen** / **fish**
: One of the 3 source specimens, remapped to indices 0 / 1 / 2 in the viewer's arrays.

**Region (Manuscript atlas)**
: One of 16 focal anatomical groupings (plus *Unassigned* at index 0). Each cell has exactly one region. Drives the [Region color scheme](/filters/colors#region) and the focal-region option of the [Anatomy card](/filters/anatomy)'s region dropdown. See [Preprocessing → Region names](/preprocess#anatomy-mapping).

**Region (mapZebrain atlas)**
: One of 112 hierarchical, overlapping mapzebrain regions (*Modified from Kunst et al., 2019*, version 1). Each cell can sit in 0–9 atlas regions at once. Exposed via the [Anatomy card](/filters/anatomy)'s atlas toggle. Filter-only — no color scheme. See [Preprocessing → Atlas regions](/preprocess#atlas-regions).

**[Mapzebrain](https://mapzebrain.org)**
: The shared zebrafish brain coordinate frame into which the specimens were co-registered. The viewer's 3D positions are in mapzebrain coordinates, and the 112-region atlas is also drawn from this reference.

## Transcriptomics

**FISH**
: Fluorescence *in situ* hybridization.

**Spot count**
: The number of FISH transcript spots detected for one gene in one cell, prior to any binary call.

**Binary call**
: A curated, conservative per-cell classification of whether a gene is expressed, produced by the manuscript pipeline using per-gene spot-count thresholds (typically 25 spots, adjusted per gene/fish per Data S1). Used by the **Paper** mode of the [gene filter](/filters/transcriptomics#what-counts-as-expressing-a-gene) and the [Richness multi-gene coloring](/filters/colors#multi-gene-mode-2-genes-pinned). The **Global** mode replaces it with a single user-set spot-count threshold applied across the panel.

**Gene panel**
: The 41 marker genes in the dataset, listed in the Transcriptomics card's gene selector.

**Subtype** / **cluster**
: One of 333 molecularly defined groups, named `gene1_gene2[_gene3]` after their dominant markers (e.g. `pou4f2_cckb`). Index 0 is *Unassigned*. Subtype names are cluster labels, not a complete list of every expressed gene.

**Gene richness**
: The number of panel genes a cell expresses. Used as the default driver of the Gene expression color scheme when no gene is pinned.

## Activity

**ΔF/F**
: Relative change in fluorescence; the readout of neural activity in calcium imaging.

**Calcium trace**
: A cell's ΔF/F as a function of time over the 134 s representative cycle.

**Regressor**
: A boxcar (or smoothed) trace indicating when each stimulus was on. The viewer correlates each cell's trace against each regressor to compute per-stimulus Pearson r.

**Pearson r**
: Linear correlation coefficient. Used as the per-cell, per-stimulus responsiveness score.

**Responsive floor**
: The Pearson r threshold above which a cell is considered responsive. Default `r = 0.13`, matching the manuscript's full-vector cutoff. Adjustable in [Settings](/settings#stim-correlation-cutoffs).

**Swim correlation**
: Per-cell Pearson r between calcium activity and estimated swim power (the windowed variance of the ephys tail-electrode channel). Signed: positive = swim-driven, negative = anti-correlated with swimming. Surfaced through the [Swim card](/filters/swim) and the swim color scheme.

**On-window**
: The interval during which a stimulus was on. Shown as a vertical shaded band on the Detail panel's ΔF/F trace.

## Visualization

**Plasma**
: A perceptually uniform, color-blind-safe colormap (dark purple → magenta → orange → yellow) used by the Gene expression, Stim correlation, and Activity schemes.

**Categorical palette**
: A discrete set of colors used by the Region (16-way) and Specimen (3-way) schemes.

**t-SNE**
: A non-linear dimensionality reduction that places transcriptomically similar cells nearby in 2D. The viewer's t-SNE panel renders a precomputed embedding.

**Lasso**
: A polygon drawn in the t-SNE to select the enclosed cells. See [Selections](/selections).

**Click-focus**
: Selecting a single cell by clicking. See [Selections](/selections).

**Plasma ramp anchors**
: The numeric values at the dim and bright ends of the plasma ramp. Configurable per color scheme in [Settings](/settings).

## Application

**Mock data**
: A 10,000-cell synthetic dataset the viewer loads when `?mock=1` is appended to the URL. Permits UI demonstration without the preprocessed bundle.

**Manifest**
: The JSON file that declares cell counts, name arrays, and the binary blobs that compose the preprocessed bundle. Loaded first at startup.

**URL hash**
: The `#…` portion of the address bar, used to encode the full view state for sharing. See [Sharing views](/sharing).
