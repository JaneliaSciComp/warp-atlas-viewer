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

Use **+ add gene** to insert a gene row, then choose the marker from that row's dropdown. Additional rows add more genes to the same filter; the remove button beside a row drops that gene. With **Colors → Gene expression** active, changing the single selected gene switches the displayed single-gene expression map.

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

The subtype labels come from the manuscript's molecular-subtype pipeline and are based on binary expression combinations for the subtype marker set. They should be read as cluster labels, not as exhaustive lists of every gene detected in a cell. Use Gene mode and the Detail-panel gene bars when you need to inspect raw spot-count patterns directly.

::: warning URL dataset coupling
The Help-tab presets resolve subtypes by name, but shareable URLs persist the selected subtype as its current dataset index. Links are therefore tied to the cluster ordering in the bundle they were created against. See [Preprocessing](/preprocess#cluster-alignment).
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
