---
title: Reproducing findings
description: One-click presets in the Help tab that reproduce specific findings from the WARP paper.
---

# Reproducing findings from the paper

The **Help** tab in the bottom panel includes a list of one-click presets that set the filters and color scheme to reproduce a specific finding from [Marquez-Legorreta, Fleishman, Hesselink et al. (bioRxiv 2026)](https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1). Clicking a preset:

- Sets the **Colors** scheme.
- Sets **Transcriptomics** (Gene or Subtype mode, with one selection).
- Sets the **Visual Stimuli** picks.
- Clears any active selection (focused cell, lasso).
- Leaves Anatomy and Settings alone.

The state encoded by each preset is also a shareable URL — once a preset is applied, copy the address bar to send the exact view.

## The presets

### `pou4f2_cckb` dimming-light response — Figure 5F / abstract

Tectal `pou4f2_cckb` subtype is positively correlated with the dark-flash stimulus — the cckb-pou4f2 luminance-coding population highlighted in the abstract.

- **Colors:** `Stim correlation`
- **Transcriptomics:** Subtype = `pou4f2_cckb`
- **Visual Stimuli:** `[dark]`

### `pvalb7_eomesa` task-related neurons — Figure 4D-E / abstract

Hippocampal-like pvalb7⁺ / eomesa⁺ population in the dorsal pallium with task-structured calcium activity.

- **Colors:** `Simple`
- **Transcriptomics:** Subtype = `pvalb7_eomesa`

### `calb2a_nefma` — forward visual motion — Figure 3C

Hindbrain `calb2a_nefma` cells respond strongest to forward visual motion (the swim-eliciting stimulus).

- **Colors:** `Stim correlation`
- **Transcriptomics:** Subtype = `calb2a_nefma`
- **Visual Stimuli:** `[motion forward]`

### `calb2a_gfra1a` — luminance & looming — Figure 3C

Tectal `calb2a_gfra1a` cells respond preferentially to the last four stimuli (light flash, dark flash, right loom, left loom).

- **Colors:** `Stim correlation`
- **Transcriptomics:** Subtype = `calb2a_gfra1a`
- **Visual Stimuli:** `[dark, bright, loom right, loom left]`

### `pou4f2_cckb_chata` — dark and bright flashes — Figure 3D

Tectal `pou4f2_cckb_chata` cells respond to both bright and dark flashes — combined via **OR** logic so cells that pass either count.

- **Colors:** `Stim correlation`
- **Transcriptomics:** Subtype = `pou4f2_cckb_chata`
- **Visual Stimuli:** `[dark, bright]` with OR

### `otpa` expression — motor-coding cells — Figure 3G

Brain map of `otpa` transcript counts. `otpa` is enriched in cells whose activity correlates with swimming.

- **Colors:** `Gene expression`
- **Transcriptomics:** Gene = `[otpa]`

### `gad1b_tph2_gfra1a` — anti-correlated raphe — Figure 5D

Dorsal-raphe `gad1b_tph2_gfra1a` cells are *negatively* correlated with forward visual motion / swimming. Cells with the strongest negative r appear **dim** in the plasma ramp (the ramp clamps negative values to its dim end).

- **Colors:** `Stim correlation`
- **Transcriptomics:** Subtype = `gad1b_tph2_gfra1a`
- **Visual Stimuli:** `[motion forward]`

::: tip Why are they dim?
The Stim correlation plasma ramp anchors at the [responsive floor](/settings#stim-correlation-cutoffs) (default `r = 0.1`). Cells with r below that — including strongly negative cells — clamp to the dim end. Negative-correlation populations are a real, useful category; the dim coloring is a known limitation of using a single positive-only ramp. Switching to **Colors → Region** keeps the same cells visible with a categorical palette.
:::

## Extending the presets

The presets list is hard-coded in `src/components/filters/HelpTab.tsx`. Each entry references the dataset by **name** (cluster name, gene name, stimulus index) rather than by numeric index — so the presets keep working even if upstream re-numbering shifts indices around. To add a finding, add a `FindingPreset` entry and an optional `figure` reference. A button is automatically rendered in the Help tab, and the button is greyed out if any of the referenced names don't exist in the loaded dataset (so the UI fails gracefully on mock data).
