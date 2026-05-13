---
title: Transcriptomics filter
description: Filter by gene expression (multi-select with OR or AND) or by molecular subtype.
---

# Transcriptomics

This card filters by gene expression. It has two modes, selectable with the **Gene / Subtype** toggle at the top.

## Gene mode

A multi-select over the 41 panel genes, combined with `OR` or `AND`.

- `OR` — retain cells expressing **any** of the selected genes. Widens the visible set as genes are added.
- `AND` — retain cells expressing **all** of the selected genes. Narrows quickly; useful for co-expression questions.

The `‹ ›` arrows step through the panel in alphabetical order. With **Colors → Gene expression** active, this provides a rapid traversal of single-gene expression maps.

### What counts as "expressing" a gene

Controlled by **Settings → Gene expression predicate**:

- **Binary call** *(default)* — uses the curated, conservative classification from the manuscript pipeline.
- **Any detected** — more permissive; any non-zero raw FISH spot count.

The same predicate is used for the **Richness** count in [multi-gene coloring](./colors#multi-gene-mode-2-genes-pinned).

::: tip When to change the predicate
Use **binary call** to track the published calls. Switch to **any detected** to investigate low-level expression that the binary call rejects (sparse markers, sub-threshold detections); expect noisier maps.
:::

## Subtype mode

A single dropdown over the 333 molecularly defined subtypes (plus an "all" option). Selecting one restricts visibility to cells in that cluster.

Subtype names follow the convention `gene1_gene2[_gene3]`, after the dominant markers of the cluster (e.g. `pou4f2_cckb`, `gad1b_tph2_gfra1a`). Index 0 is reserved for *Unassigned* (cells the upstream clustering did not confidently label).

::: warning Names, not indices
The viewer references subtypes by **name** in shareable URLs and presets. Cluster names are stable across dataset versions; indices may shift. See [Preprocessing](/preprocess#cluster-alignment).
:::

### Gene mode with no selection

Switching to Gene mode with no genes selected — under either OR or AND — retains all cells (vacuously true). To filter, select at least one gene.

## Common combinations

| Goal | Gene mode | OR / AND | Subtype mode |
|---|---|---|---|
| Cells expressing `otpa` | `[otpa]` | — | — |
| Cells expressing `otpa` **and** `slc17a7a` | `[otpa, slc17a7a]` | AND | — |
| Cells expressing `otpa` **or** `slc17a7a` | `[otpa, slc17a7a]` | OR | — |
| All cells in the `pou4f2_cckb` cluster | — | — | `pou4f2_cckb` |
| `pou4f2_cckb` cells in the hindbrain | — | — | `pou4f2_cckb` + [Anatomy](./anatomy) = Hindbrain |
