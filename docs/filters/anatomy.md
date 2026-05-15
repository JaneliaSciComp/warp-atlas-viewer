---
title: Anatomy filter
description: Restrict to one of 16 brain regions, one of 3 specimens, or both.
---

# Anatomy

Two dropdowns:

## Region

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

## Specimens

One of the 3 source specimens, or "all" *(default)*. The specimens were imaged separately and their cells co-registered into the mapzebrain reference frame. Every point in the viewer is a single cell from a single specimen; no synthesized averages are displayed.

Per-specimen views appear in three places:

| Location | Function |
|---|---|
| [**Colors → Specimen**](./colors#specimen) | Paint each cell by source specimen; useful for assessing per-specimen coverage and registration consistency. |
| **Anatomy → specimen** *(this card)* | Restrict visibility to one specimen; useful for verifying that a finding holds in each individual. |
| [**Detail panel** per-specimen breakdown](/ui/detail#per-specimen-breakdown) | Counts by specimen for the current selection. |

## Combinations

| Goal | Region | Specimen |
|---|---|---|
| Tectal periventricular cells across all specimens | `OTpv` | all |
| Pallial cells from Fish 1 only | `Pal` | `Fish 1` |
| All cells in Fish 3 | all | `Fish 3` |

Anatomy combines under AND with the other cards. For example, `Anatomy = OTpv` together with `Transcriptomics = pou4f2_cckb` retains cells in the tectal periventricular layer that also belong to that cluster — the appropriate combination for assessing whether a transcriptomic cluster has a meaningful anatomical footprint.
