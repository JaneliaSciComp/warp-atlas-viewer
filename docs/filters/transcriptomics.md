---
title: Transcriptomics filter
description: Filter by gene expression (multi-select with OR / AND) or by molecular subtype.
---

# Transcriptomics

This card filters by gene expression. It has two modes — toggle between them with the **Gene / Subtype** switch at the top of the card.

## Gene mode

A multi-select over the 41 panel genes. Combine selections with `OR` or `AND`.

- `OR` — keep cells expressing **any** of the selected genes. Permissive — widens the visible set as you add genes.
- `AND` — keep cells expressing **all** of the selected genes. Strict — narrows fast; useful for co-expression questions.

The `‹ ›` arrows next to the gene name step through the gene list in alphabetical order. With **Colors → Gene expression** active, this gives you a quick way to flip through every gene's brain map.

### What counts as "expressing" a gene?

Driven by **Settings → Gene expression predicate**:

- **Binary call** *(default)* — uses the dataset's curated, conservative classification (the per-cell `geneBinary === 1` flag from the manuscript pipeline).
- **Any detected** — more permissive — any raw FISH spot count above zero.

The same predicate is used for the **Richness** count in [multi-gene coloring](./colors#multi-gene-mode-2-genes-pinned).

::: tip When to flip the predicate
Default to **binary call** — it tracks the paper's calls. Switch to **any detected** when looking for traces of low-level expression that the binary call rejects (sparse markers, sub-threshold detections). Expect noisier-looking maps.
:::

## Subtype mode

A single dropdown over the 333 molecularly-defined functional subtypes (plus an "all" option). Pick one and only cells in that cluster are visible.

Subtype names follow the convention `gene1_gene2[_gene3]` — the dominant markers of the cluster, e.g. `pou4f2_cckb` or `gad1b_tph2_gfra1a`. Index 0 is reserved for **Unassigned** (cells the upstream clustering didn't confidently label).

::: warning Names, not indices
The viewer references subtypes by **name** in shareable URLs and Help-tab presets, not by numeric index. The preprocessor aligns the cluster labels to names from `cluster_labelsAll2` (not the permuted `cluster_labelsAll3`) so the indices are stable across dataset versions. See [Preprocessing](/preprocess#cluster-alignment).
:::

### Counter-intuitive: Gene mode "all" still filters

If you switch to Gene mode with the multi-select empty and **OR** active, the card keeps everything (equivalent to "all"). If you switch to **AND** with no genes, the card also keeps everything (vacuously true). To actually filter, pick at least one gene.

## Combinations to try

| Goal | Gene mode | OR/AND | Subtype mode |
|---|---|---|---|
| "Cells that express *otpa*" | `[otpa]` | — | — |
| "Cells that express *otpa* **and** *slc17a7a*" | `[otpa, slc17a7a]` | AND | — |
| "Cells that express **either** *otpa* or *slc17a7a*" | `[otpa, slc17a7a]` | OR | — |
| "All cells in the `pou4f2_cckb` cluster" | — | — | `pou4f2_cckb` |
| "Just the `pou4f2_cckb` cells in the hindbrain" | — | — | `pou4f2_cckb` + [Anatomy](./anatomy) = Hindbrain |
