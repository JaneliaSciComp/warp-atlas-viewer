---
title: Quick start
description: A brief tour of the viewer's main panels and how they relate.
---

# Quick start

The viewer renders approximately 274,000 zebrafish neurons as a 3D point cloud. Each point corresponds to a single cell from one of three specimens, co-registered into the mapzebrain reference frame. Every cell carries:

- spot counts for 41 panel genes,
- a transcriptomic subtype label (one of 333 molecularly defined clusters),
- a 134 s calcium-imaging trace recorded under 8 visual stimuli,
- per-stimulus Pearson correlations against the stimulus regressors.

The 3D viewer and the t-SNE panel display the same cells in two coordinate systems; selections in one propagate to the other.

## Suggested first session

1. **Set Colors → Region** and orbit the 3D viewer to inspect the anatomical layout. ([Colors reference](/filters/colors))
2. **Switch Colors → Gene expression.** With no gene selected, cells are colored by [gene richness](/filters/colors#gene-richness-when-nothing-is-pinned) — the number of panel genes detected per cell. To inspect a single-gene map, use **Transcriptomics → + add gene** and choose a gene from the row dropdown.
3. **In Transcriptomics, select Subtype mode** and choose, for example, `pou4f2_cckb`. Most of this cluster is located in the optic tectum. ([Subtype filter](/filters/transcriptomics#subtype-mode))
4. **Co-expression view.** Set Colors → **Stim correlation**, select a stimulus in **Visual Stimuli**, and pin a single gene in **Transcriptomics**. The remaining cells are gene-positive and colored by their response strength to the chosen stimulus.
5. **Click any cell** to populate the [Detail panel](/ui/detail) with its per-gene spot counts, mean ΔF/F trace with stimulus on-windows shaded, and per-stimulus correlation chart.

## Conceptual layout

![Conceptual layout of the WARP viewer: 3D viewer occupies the top-left, the filter strip the bottom-left, the t-SNE panel the bottom-right, and the detail panel the right edge.](/layout-overview.svg)

- **Filters determine which cells are visible.** Four cards (Transcriptomics, Visual Stimuli, Swim, Anatomy) combine under logical AND. ([Filtering rules](/filters/overview))
- **Selections are independent of filters.** A focused cell or lasso selection is retained across filter changes. ([Selections](/selections))
- **Colors determine how visible cells are painted.** The Colors card and the Settings tab control the palette. ([Colors](/filters/colors))
- **The Detail panel reflects the current selection,** falling back to the filter intersection when nothing is explicitly selected, and to a whole-dataset summary when no filter narrows the view either. ([Detail panel](/ui/detail))
- **The URL hash encodes the full view state.** Copying the URL reproduces the view exactly. ([Sharing views](/sharing))

## Terminology

| Term | Definition |
|---|---|
| **Cell** / **neuron** | One point in the viewer. Approximately 274,000 total. |
| **Subtype** / **cluster** | One of 333 molecularly defined transcriptomic groups. |
| **Region** | One of 16 focal anatomical regions (plus "Unassigned"). |
| **Stimulus** | One of 8 visual stimuli (forward / backward / right / left motion, dark flash, bright flash, right loom, left loom). |
| **Specimen** / **fish** | One of 3 source specimens. |
| **ΔF/F** | Calcium-imaging activity readout. |
| **Spot count** | FISH transcript spots detected for one gene in one cell. |
| **Pearson r** | Correlation between a cell's activity trace and a stimulus regressor. |

See the [full glossary](/glossary) for additional terms.

## Next

- [Layout & panels](/ui/panels) — function of each panel.
- [How filters combine](/filters/overview) — AND between cards, OR or AND within a card.
- [Exploring findings from the paper](/findings) — single-click presets.
