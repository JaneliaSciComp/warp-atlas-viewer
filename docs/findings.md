---
title: Exploring findings
description: Preset views in the Help tab for exploring specific findings from the WARP paper.
---

# Exploring findings from the paper

The **Help** tab in the bottom panel provides preset views that reconfigure the filters and color scheme around specific findings from [Marquez-Legorreta, Fleishman, Hesselink et al. (bioRxiv 2026)](https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1). Applying a preset:

- sets the **Colors** scheme,
- sets **Transcriptomics** (Gene or Subtype mode, with one selection),
- sets the **Visual Stimuli** selection,
- clears any active selection (focused cell or lasso),
- resets Anatomy to all regions/specimens while leaving Settings unchanged.

The state produced by each preset is fully captured by the URL hash, so the resulting view can be shared directly from the address bar.

::: warning Presets are exploratory entry points
The presets are designed for reading the paper alongside the viewer. They do not reproduce every statistical test, behavioral analysis, consensus-neuron filter, or panel-specific threshold used in the manuscript.
:::

## Presets

### `pou4f2_cckb` — dimming-light response (Figure 5F, abstract)

The tectal `pou4f2_cckb` subtype is positively correlated with the dark-flash stimulus, corresponding to the luminance-coding population highlighted in the abstract.

- **Colors:** `Stim correlation`
- **Transcriptomics:** Subtype = `pou4f2_cckb`
- **Visual Stimuli:** `[dark]`

What to look for: cells concentrated in the optic tectum, with positive dark-flash correlation in the Detail panel. Looming responses can also be explored by adding the loom stimuli.

### `pvalb7_eomesa` — task-related neurons (Figure 4D–E, abstract)

A hippocampal-like pvalb7⁺ / eomesa⁺ population in the dorsal pallium with task-structured calcium activity.

- **Colors:** `Simple`
- **Transcriptomics:** Subtype = `pvalb7_eomesa`

What to look for: a telencephalic / dorsal-pallial distribution. Use the Detail panel trace and per-stimulus bars to inspect task structure, and **Colors → Specimen** to check whether the filtered population is represented across fish.

### `calb2a_nefma` — forward visual motion (Figure 3C)

Hindbrain `calb2a_nefma` cells respond most strongly to forward visual motion, the swim-eliciting stimulus.

- **Colors:** `Stim correlation`
- **Transcriptomics:** Subtype = `calb2a_nefma`
- **Visual Stimuli:** `[motion forward]`

What to look for: hindbrain cells with a peak around the first stimulus. If many cells appear dim, lower the responsive floor cautiously or inspect the correlation bars before changing thresholds.

### `calb2a_gfra1a` — luminance and looming (Figure 3C)

Tectal `calb2a_gfra1a` cells respond preferentially to the four luminance and looming stimuli (bright flash, dark flash, right loom, left loom).

- **Colors:** `Stim correlation`
- **Transcriptomics:** Subtype = `calb2a_gfra1a`
- **Visual Stimuli:** `[dark, bright, loom right, loom left]`

What to look for: tectal cells retained by response to at least one of the four selected stimuli. Switch the Visual Stimuli card from **OR** to **AND** only when asking for cells that meet the threshold for all four stimuli.

### `pou4f2_cckb_chata` — dark and bright flashes (Figure 3D)

Tectal `pou4f2_cckb_chata` cells respond to both bright and dark flashes; the two stimuli are combined with **OR** so that cells responsive to either are retained.

- **Colors:** `Stim correlation`
- **Transcriptomics:** Subtype = `pou4f2_cckb_chata`
- **Visual Stimuli:** `[dark, bright]` with OR

What to look for: optic-tectum cells with flash-driven correlation bars. Use **AND** if you want the stricter subset responsive to both flashes under the current responsive floor.

### `otpa`+ swim-related neurons (Figure 3G)

`otpa`-expressing neurons whose calcium activity correlates with swim power — the motor-coding population the paper maps in Fig 3G. The visible set is `otpa+ AND swim-driven`, painted by `otpa` spot count.

- **Colors:** `Gene expression`
- **Transcriptomics:** Gene = `[otpa]`
- **Swim:** `+ swim-driven` (`r ≥ +swimLo`)

What to look for: a hindbrain-weighted subset of `otpa+` cells (the paper highlights medial-hindbrain neurons in particular). The Detail-panel swim histogram should show a positive mean by construction. Drop the Swim filter to see the full `otpa+` expression landscape for comparison.

### `gad1b_tph2_gfra1a` — anti-forward-motion raphe (Figure 5D)

Dorsal-raphe `gad1b_tph2_gfra1a` cells, one of the 15 largest multi-gene subtypes negatively correlated with forward visual motion (Fig 5D). The whole cluster is highlighted; the anti-correlation shows up in the Detail panel rather than in the 3D coloring (the Stim color ramp is positive-only).

- **Colors:** `Simple`
- **Transcriptomics:** Subtype = `gad1b_tph2_gfra1a`

What to look for:

- the **Detail panel's per-stimulus correlation chart** — the leftmost bar (forward motion) should be negative, while the other bars are near zero or modestly positive,
- the **swim correlation histogram** at the bottom of the Detail panel — exposes the per-cell distribution, including the cluster's anti-swim tail,
- the cluster's **anatomical signature** in the 3D viewer (a subset is in Superior raphe, though most cells in the cluster fall outside the viewer's 16 focal regions and carry the *Unassigned* label).

The previous version of this preset added a `[motion forward]` stimulus filter, but the Visual Stimuli filter is one-sided (`r ≥ +floor`), so it retained the positive outliers — the opposite of the paper's finding. The current preset drops that filter so the cluster's actual signature is visible.
