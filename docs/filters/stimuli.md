---
title: Visual Stimuli filter
description: The 8 visual stimuli, the responsive-floor threshold, and OR / AND logic.
---

# Visual Stimuli

This card filters by responsiveness to one or more visual stimuli. Each stimulus is represented by an icon button; selections combine under `OR` (default) or `AND`.

## The eight stimuli

| # | Label | Description |
|---|---|---|
| 1 | motion forward | Whole-field motion in the swim-eliciting direction. |
| 2 | motion backward | Reverse whole-field motion. |
| 3 | motion right | Lateral motion to the fish's right. |
| 4 | motion left | Lateral motion to the fish's left. |
| 5 | dark | Sudden full-field darkening (dark flash). |
| 6 | bright | Sudden full-field brightening (light flash). |
| 7 | loom right | Expanding looming disk approaching from the right. |
| 8 | loom left | Expanding looming disk approaching from the left. |

A single representative cycle (~134 s) presents all 8 stimuli sequentially. The stimulus on-windows are shaded on the [Detail panel's mean ΔF/F trace](/ui/detail#mean-f-f-trace).

## Definition of "responsive"

A cell is considered responsive to a stimulus when its Pearson r with the corresponding regressor meets the **responsive floor** in [Settings → Stim correlation cutoffs](/settings#stim-correlation-cutoffs). The default is `r ≥ 0.30`.

The same threshold drives:

- the Visual Stimuli filter card (visibility, this page),
- the [Stim correlation color scheme](./colors#stim-correlation) (dim end of the plasma ramp).

::: warning Display threshold, not statistical significance
The responsive floor is an interactive viewer threshold. It is useful for screening cells, but it is not a p-value, confidence interval, or substitute for the statistical criteria used in the manuscript.
:::

## OR versus AND

- `OR` *(default)* — retain cells responsive to **any** of the selected stimuli. The set grows as stimuli are added.
- `AND` — retain cells responsive to **every** selected stimulus. The set shrinks quickly; useful for identifying cells that generalize across modalities (e.g. both `dark` and `bright` flashes).

::: tip Stim correlation max is independent of OR / AND
With two or more stimuli selected, the **Stim correlation** color scheme paints cells by their maximum r across the selected set, regardless of whether the filter card is set to OR or AND. Filtering with AND while coloring by max is therefore a valid combination. See [Colors → Stim correlation](./colors#stim-correlation).
:::

## Adjusting the threshold

The responsive floor is conservative by default (`r = 0.30`). Lower it to include weakly correlated cells; raise it for a stricter "definitely responding" set.

The **saturation** anchor on the same Settings row affects only the [Stim correlation color ramp](./colors#stim-correlation); it does not change the filter result. The [visible-cell readout](./overview#visible-cell-readout) in the Filters tab reports how many cells remain visible.

## Worked example

Exploring the abstract's observation that `pou4f2_cckb` is a dark-flash population:

| Card | Setting |
|---|---|
| Colors | `Stim correlation` |
| Transcriptomics | Subtype = `pou4f2_cckb` |
| Visual Stimuli | `[dark]` |
| Anatomy | all |

The remaining cells are `pou4f2_cckb` cluster members responsive to the dark flash, colored by correlation strength. This is preset #1 in the [Findings](/findings) page.
