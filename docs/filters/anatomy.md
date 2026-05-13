---
title: Anatomy filter
description: Restrict to one of 16 brain regions, one of 3 specimens, or both.
---

# Anatomy

Two dropdowns:

## Region

One of 16 focal anatomical regions, plus *Unassigned* at index 0, plus an "all" option. Selecting a region restricts visibility to cells in that region.

The 16 regions correspond to the focal anatomical groupings carried in the dataset. See [Preprocessing → Region names](/preprocess#anatomy-mapping) for how the human-readable names are assigned.

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
| Tectal cells across all specimens | `Optic tectum` | all |
| Hindbrain cells from Fish 1 only | `Hindbrain` | `Fish 1` |
| All cells in Fish 3 | all | `Fish 3` |

Anatomy combines under AND with the other cards. For example, `Anatomy = Hindbrain` together with `Transcriptomics = pou4f2_cckb` retains cells in the hindbrain that also belong to that cluster — the appropriate combination for assessing whether a transcriptomic cluster has a meaningful anatomical footprint.
