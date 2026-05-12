---
title: Quick start
description: A five-minute tour that gets you from "I just opened the viewer" to "I know what every panel does."
---

# Quick start

The viewer renders ~274,000 zebrafish neurons as a 3D point cloud. Each dot is one real cell from one real fish, registered into a shared brain coordinate frame. Beyond its position, every cell carries:

- expression counts for 41 panel genes,
- a functional subtype label (one of 333 molecularly-defined clusters),
- a 134-second calcium-imaging trace recorded under 8 visual stimuli,
- per-stimulus correlation scores against the stimulus regressors.

The 3D viewer and the t-SNE panel show the same cells in two spaces. Anything you select in one is highlighted in the other.

## Five things to try first

1. **Set Colors → Region** and orbit the 3D viewer to see the anatomy. ([Colors reference](/filters/colors))
2. **Switch Colors → Gene expression** and step through genes with the **‹ ›** arrows. With no gene pinned, the viewer paints by [gene richness](/filters/colors#gene-richness-when-nothing-is-pinned) (how many of the 41 genes each cell expresses).
3. **In Transcriptomics, flip to Subtype** and pick e.g. `pou4f2_cckb` — most of the cluster lands in the optic tectum. ([Subtype filter](/filters/transcriptomics#subtype-mode))
4. **Co-expression view:** set Colors → **Stim correlation**, pick a stimulus in **Visual Stimuli**, and pick a single gene in **Transcriptomics**. The remaining cells are gene-positive, colored by how strongly they respond to that stimulus.
5. **Click any cell** to fill in the [Detail panel](/ui/detail): its per-gene spot counts, mean ΔF/F trace with each stimulus's on-window shaded, and a per-stimulus correlation bar chart.

## The mental model

```
┌────────────────────────────────────────────┐ ┌──────────┐
│                                            │ │          │
│              3D BRAIN VIEWER               │ │  DETAIL  │
│            (cells in anatomy)              │ │          │
│                                            │ │  gene    │
├────────────────────────────────────────────┤ │  bar     │
│                            │               │ │  chart   │
│  Colors × Transcriptomics  │   t-SNE       │ │          │
│      × Stimuli × Anatomy   │   (lasso)     │ │  ΔF/F    │
│        + Settings + Help   │               │ │  trace   │
│                            │               │ │          │
└────────────────────────────────────────────┘ └──────────┘
```

- **Filters decide which cells are visible.** Four cards combine with logical AND. ([Filtering rules](/filters/overview))
- **Selections are independent of filters.** A focused cell or a lasso selection survives every filter change. ([Selections](/selections))
- **Colors decide how the visible cells are painted.** The Colors card and the Settings tab fully drive the palette. ([Colors](/filters/colors))
- **The Detail panel responds to selection or filter intersection.** When nothing is explicitly selected, it falls back to whatever the filter intersection produces. ([Detail panel](/ui/detail))
- **The URL hash mirrors the full app state.** Copy the URL to share the exact view. ([Sharing views](/sharing))

## Glossary cheat sheet

| Term | What it means |
|---|---|
| **Cell** / **neuron** | One dot in the viewer. ~274,000 total. |
| **Subtype** / **cluster** | One of 333 molecularly-defined transcriptomic groups. |
| **Region** | One of 16 focal anatomical regions (plus "Unassigned"). |
| **Stimulus** | One of 8 visual stimuli (forward / back / right / left motion, dark flash, bright flash, right loom, left loom). |
| **Specimen** / **fish** | One of 3 source fish (originally Fish 1 / 2 / 3 in the raw data). |
| **ΔF/F** | Calcium-imaging signal — relative fluorescence change, the standard readout of neural activity. |
| **Spot count** | Number of FISH transcript spots detected for one gene in one cell. |
| **Pearson r** | Linear correlation between a cell's activity trace and a stimulus regressor. |

See the [full glossary](/glossary) for everything else.

## Next

- [Layout & panels](/ui/panels) — what every region of the screen does.
- [How filters combine](/filters/overview) — the AND rule between cards, OR/AND within a card.
- [Reproducing findings from the paper](/findings) — one-click presets.
