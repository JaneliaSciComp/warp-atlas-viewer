---
title: Visual Stimuli filter
description: The 8 visual stimuli, signed correlation modes, the responsive-floor threshold, and OR / AND logic.
---

# Visual Stimuli

This card scopes or filters by signed Pearson correlation with one or more visual-stimulus regressors. A mode dropdown is always visible, and each stimulus is represented by an icon button. Once you select at least one stimulus, an OR / AND row appears for multi-stimulus filter logic.

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

## Mode dropdown

The mode dropdown controls whether selected stimuli only affect coloring or also filter cells:

- **`no filter`** *(default)* — selected stimulus icons scope the [Stim correlation coloring](./colors#stim-correlation), but no cells are filtered out by stimulus response.
- **`+ correlated`** — keep cells with `r ≥ +stimLo` for the selected stim(s) (positively correlated; the paper's classic "stim-driven").
- **`- anti-correlated`** — keep cells with `r ≤ -stimLo` (anti-correlated).
- **`± either`** — keep cells with `|r| ≥ stimLo` in either direction.

In `no filter` mode, the OR / AND row grays out because there is no active stimulus-response predicate for it to combine.

::: tip `no filter` and the active color scheme
`no filter` mode never removes cells from the view. Its only visible effect is to scope which stimuli the **Stim correlation** color ramp paints by, so a stim selection in this mode looks like a no-op unless Colors is set to **Stim correlation**. The mode dropdown still tracks the value when other color schemes are active; it has no visible effect until you switch back to Stim coloring.
:::

## Definition of "responsive"

The `stimLo` and `stimHi` anchors live in [Settings → Stim correlation cutoffs](/settings#stim-correlation-cutoffs). The default `stimLo = 0.13` is the manuscript's full-vector threshold (the 90th-percentile-per-stimulus average, Methods).

`stimLo` drives:

- the **filter floor** (cells must clear `±stimLo` per the active mode),
- the **deadband** in the [Stim correlation color scheme](./colors#stim-correlation) — within `[-stimLo, +stimLo]` cells map to the neutral midpoint of the divergent coolwarm ramp.

`stimHi` sets where the divergent ramp saturates and doesn't affect the filter.

::: warning Display threshold, not statistical significance
The responsive floor is an interactive viewer threshold. It is useful for screening cells, but it is not a p-value, confidence interval, or substitute for the statistical criteria used in the manuscript.
:::

## OR versus AND

OR / AND only matters when 2+ stimuli are selected *and* the mode is not `no filter`.

- `OR` *(default)* — retain cells passing the direction check for **any** selected stimulus. The set grows as stimuli are added.
- `AND` — retain cells passing the direction check for **every** selected stimulus. The set shrinks quickly; useful for identifying cells that generalize across modalities (e.g. responsive to both `dark` and `bright`).

## Coloring follows the filter direction

With 2+ stims selected, the [Stim correlation](./colors#stim-correlation) ramp picks the representative `r` so it matches the active filter mode:

- `+ correlated` → max-positive r across the selected stims (cell colored by its strongest positive evidence).
- `- anti-correlated` → min-negative r.
- `± either` or `no filter` → max-|r| (signed).

So a cell passing the `+ correlated` filter doesn't get colored blue by a different stim's larger-magnitude negative correlation.

## Worked example

Exploring the abstract's observation that `pou4f2_cckb` is a dark-flash population:

| Card | Setting |
|---|---|
| Colors | `Stim correlation` |
| Transcriptomics | Subtype = `pou4f2_cckb` |
| Visual Stimuli | `[dark]` + `+ correlated` |
| Anatomy | all |

The remaining cells are `pou4f2_cckb` cluster members positively correlated with the dark flash, colored by correlation strength. This matches the `pou4f2_cckb` dimming-light preset in the [Findings](/findings) page and the About tab.
