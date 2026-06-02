---
title: Anatomy filter
description: Restrict to one of 16 paper-focal regions or one of 112 mapzebrain atlas regions, optionally combined with a specimen filter.
---

# Anatomy

Three controls:

1. **Atlas** — a toggle that picks which atlas the *region* dropdown reads:
   - **Manuscript** *(default)* — the paper's 16 focal regions.
   - **mapZebrain** — the 112-region [mapzebrain](https://mapzebrain.org) atlas (*Modified from Kunst et al., 2019*, version 1).
   The two atlases are alternatives, not stacked filters; switching the toggle swaps the *region* dropdown's contents. Each atlas's last pick is remembered, so toggling back restores it.
2. **Region** — a searchable dropdown whose entries depend on the active atlas.
3. **Specimen** — restrict to one of the 3 source fish.

## Region — Manuscript atlas

One of 16 focal anatomical regions plus *Unassigned*, plus an "all" option. Selecting a region restricts visibility to cells in that region.

The list is ordered anterior → posterior, matching the paper's figure legends:

| Abbr | Full name |
|---|---|
| Pal | Dorsal pallium |
| SubP | Subpallium |
| HypTh | Hypothalamus |
| Hab | Habenula |
| Th | Dorsal thalamus |
| preTh | Prethalamus |
| Pt | Pretectum |
| OTnp | Optic tectum neuropil |
| OTpv | Optic tectum periventricular layer |
| NI | Nucleus isthmi |
| Tg | Tegmentum |
| Cb | Cerebellum |
| SupRaphe | Superior dorsal raphe |
| SupMO | Superior medulla oblongata |
| IntMO | Intermediate medulla oblongata |
| InfMO | Inferior medulla oblongata |
| Unassigned | (cells outside the 16 focal groupings) |

See [Preprocessing → Region names](/preprocess#anatomy-mapping) for how the integer labels in `Brain_reg.npy` map to these names.

::: tip "Unassigned" is a real category
A non-trivial number of cells carry the *Unassigned* label, generally because they fall outside the 16 focal groupings rather than because they lacked a coordinate. *Unassigned* is expected to be one of the larger groups.
:::

## Region — mapZebrain atlas

When the atlas toggle is set to **mapZebrain**, the *region* dropdown lists all 112 mapzebrain regions as a searchable combobox. Type part of a region name to filter the alphabetical list; each entry shows the cell count in parentheses, e.g. `cerebellum (16,642)`. Long names truncate with an ellipsis in the closed control; hovering reveals the full name.

Unlike the 16-region focal list, the mapzebrain atlas is **hierarchical and overlapping**: each cell can belong to 0–9 regions at once (e.g. a cerebellar cell is also in `rhombencephalon`). Empty regions remain in the dropdown as `(0)` rather than being hidden, so the selectable set always matches the published atlas.

Currently filter-only: the 112-region atlas does not drive a color scheme. *Color = Region* always uses the paper's 16-region palette.

## Specimens

One of the 3 source specimens, or "all" *(default)*. The specimens were imaged separately and their cells co-registered into the mapzebrain reference frame. Every point in the viewer is a single cell from a single specimen; no synthesized averages are displayed.

Per-specimen views appear in three places:

| Location | Function |
|---|---|
| [**Colors → Specimen**](./colors#specimen) | Paint each cell by source specimen; useful for assessing per-specimen coverage and registration consistency. |
| **Anatomy → specimen** *(this card)* | Restrict visibility to one specimen; useful for verifying that a finding holds in each individual. |
| [**Detail panel** per-specimen breakdown](/ui/detail#per-specimen-breakdown) | Counts by specimen for the current selection. |

## Combinations

| Goal | Atlas | Region | Specimen |
|---|---|---|---|
| Tectal periventricular cells across all specimens | Manuscript | `OTpv` | all |
| Pallial cells from Fish 1 only | Manuscript | `Pal` | `Fish 1` |
| All cells in Fish 3 | Manuscript | all | `Fish 3` |
| Cerebellar cells only | mapZebrain | `cerebellum` | all |
| Inferior olive cells, any specimen | mapZebrain | `inferior olive` | all |

The atlas toggle and region dropdown are joined to a single "region" predicate; specimen is independent. Both combine under AND with the other cards. For example, atlas = Manuscript, region = `OTpv` together with `Transcriptomics = pou4f2_cckb` retains cells in the tectal periventricular layer that also belong to that cluster. This is the appropriate combination for assessing whether a transcriptomic cluster has a meaningful anatomical footprint.
