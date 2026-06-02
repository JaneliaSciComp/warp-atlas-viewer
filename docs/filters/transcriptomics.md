---
title: Transcriptomics filter
description: Filter by gene expression (multi-select with OR or AND) or by molecular subtype.
---

# Transcriptomics

This card filters by gene expression. It has three modes, selectable with the **All / Gene / Subtype** toggle at the top. **All** applies no transcriptomics filter; use it to clear a gene or subtype selection without removing it row-by-row.

## Gene mode

A multi-select over the 41 panel genes, combined with `OR` or `AND`.

- `OR` — retain cells expressing **any** of the selected genes. Widens the visible set as genes are added.
- `AND` — retain cells expressing **all** of the selected genes. Narrows quickly; useful for co-expression questions.

Use **+ add gene** to insert a gene row, then choose the marker from that row's dropdown. Additional rows add more genes to the same filter; the remove button beside a row drops that gene. With **Colors → Gene expression** active, changing the single selected gene switches the displayed single-gene expression map.

### What counts as "expressing" a gene

Controlled by **Settings → Gene expression threshold**:

- **Paper** *(default)* — uses the paper's per-gene spot-count cutoffs. Backed by `BinaryGenes_All` from the manifest.
- **Global** — applies a single user-set spot-count threshold uniformly across all genes via `geneCounts >= threshold`. Default 25; set to 1 for "any detected".

The same predicate is used for the **Richness** count in [multi-gene coloring](./colors#multi-gene-mode-2-genes-pinned).

::: tip When to switch modes
Use **Paper** to track the published calls. Switch to **Global** for sensitivity analysis; sweep stricter or looser cutoffs uniformly across the panel to see which markers are sensitive to threshold choice.

Global threshold currently only affects the **gene filter** and the richness coloring. Molecular subtype membership is precomputed from the paper's per-gene thresholds and does not recompute when you change the global threshold.
:::

## Subtype mode

A single dropdown over the 333 molecularly defined subtypes. Selecting one restricts visibility to cells in that cluster. To see every subtype with no cluster filter, switch the toggle to **All**.

Subtype names follow the convention `gene1_gene2[_gene3]`, after the dominant markers of the cluster (e.g. `pou4f2_cckb`, `gad1b_tph2_gfra1a`). Index 0 is reserved for *Unassigned* (cells the upstream clustering did not confidently label).

The subtype labels come from the manuscript's molecular-subtype pipeline and are based on binary expression combinations for the subtype marker set. They should be read as cluster labels, not as exhaustive lists of every gene detected in a cell. Use Gene mode and the Detail-panel gene bars when you need to inspect raw spot-count patterns directly.

::: warning URL dataset coupling
The About-tab presets resolve subtypes by name, but shareable URLs persist the selected subtype as its current dataset index. Links are therefore tied to the cluster ordering in the bundle they were created against. See [Preprocessing](/preprocess#cluster-alignment).
:::

### Gene mode with no selection

Switching to Gene mode with no genes selected (under either OR or AND) retains all cells (vacuously true). To filter, select at least one gene. The **All** toggle is the explicit "no transcriptomics filter" state and is equivalent in effect.

## Common combinations

| Goal | Gene mode | OR / AND | Subtype mode |
|---|---|---|---|
| Cells expressing `otpa` | `[otpa]` | — | — |
| Cells expressing `otpa` **and** `slc17a7a` | `[otpa, slc17a7a]` | AND | — |
| Cells expressing `otpa` **or** `slc17a7a` | `[otpa, slc17a7a]` | OR | — |
| All cells in the `pou4f2_cckb` cluster | — | — | `pou4f2_cckb` |
| `pou4f2_cckb` cells in the hindbrain | — | — | `pou4f2_cckb` + [Anatomy](./anatomy) = Hindbrain |
