---
title: Anatomy filter
description: Isolate one of 16 brain regions, one of 3 source fish, or both at once.
---

# Anatomy

Two dropdowns:

## Region

One of 16 focal anatomical regions, plus "Unassigned" at index 0, plus an "all" option. Pick one to keep only cells from that region.

The 16 regions are a hand-built collapse of the upstream atlas (~112 regions in the source data) into a manageable focal set for the viewer. The mapping is baked into the preprocessor — see [Preprocessing → Anatomy mapping](/preprocess#anatomy-mapping).

::: tip "Unassigned" is a real category
A non-trivial number of cells have an `Unassigned` region label — usually because they fell outside the 16 focal groupings during the upstream collapse, not because they lacked a coordinate. Don't be alarmed if `Unassigned` is one of the larger groups.
:::

## Specimens

One of 3 source fish, or "all" *(default)*. Originally labeled Fish 1 / 2 / 3 in the raw data; the preprocessor remaps the source IDs (59 / 63 / 71) to a dense 0 / 1 / 2.

The 3 fish were imaged separately, then their cells were co-registered into a single mapzebrain coordinate frame. Every dot in the viewer is one real cell from one real fish — there are no synthesized averages.

Per-specimen views surface in three places:

| Where | What it does |
|---|---|
| [**Colors → Specimen**](./colors#specimen) | Paint each cell by its source fish — per-fish coverage and registration consistency become visible. |
| **Anatomy → specimen** *(this card)* | Keep only cells from one fish — useful for sanity-checking whether a finding holds in every individual. |
| [**Detail panel** per-fish breakdown](/ui/detail#per-fish-breakdown) | Counts and percentages by fish for the current selection. |

## Combinations

| Goal | Region | Specimen |
|---|---|---|
| "Tectum cells across all fish" | `Optic tectum` | all |
| "Hindbrain cells from Fish 1 only" | `Hindbrain` | `Fish 1` |
| "Everything in Fish 3" | all | `Fish 3` |

Anatomy combines AND-wise with the other cards. So `Anatomy = Hindbrain` plus `Transcriptomics = pou4f2_cckb` keeps cells that are both in the hindbrain and in that cluster — which is the right pattern for checking whether a transcriptomic cluster has a meaningful anatomical footprint.
