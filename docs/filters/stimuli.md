---
title: Visual Stimuli filter
description: The 8 visual stimuli, the responsive-floor threshold, and OR / AND logic.
---

# Visual Stimuli

This card filters by which visual stimulus or stimuli a cell responds to. Each stimulus shows up as an icon button; click to toggle. Combine selections with `OR` (the default) or `AND`.

## The eight stimuli

| # | Label | Icon meaning |
|---|---|---|
| 1 | motion forward | Whole-field motion in the swim-eliciting direction |
| 2 | motion backward | Reverse whole-field motion |
| 3 | motion right | Lateral motion to the fish's right |
| 4 | motion left | Lateral motion to the fish's left |
| 5 | dark | Sudden full-field darkening (dark flash) |
| 6 | bright | Sudden full-field brightening (light flash) |
| 7 | loom right | Expanding looming disk approaching from the right |
| 8 | loom left | Expanding looming disk approaching from the left |

One representative cycle (~134 s) plays all 8 stimuli back-to-back. The stimulus on-windows are shaded on the [Detail panel's mean ΔF/F trace](/ui/detail#mean-f-f-trace).

## How "responsive" is defined

A cell counts as responsive to a stimulus iff its Pearson r with that stimulus's regressor clears the **responsive floor** in [Settings → Stim correlation cutoffs](/settings#stim-correlation-cutoffs). Default is `r ≥ 0.1`.

The same threshold drives:

- The Visual Stimuli filter card (visibility, this page).
- The [Stim correlation color scheme](./colors#stim-correlation) (dim end of the plasma ramp).

## OR vs. AND

- `OR` *(default)* — keep cells responsive to **any one** of the selected stimuli. The set grows as you add stimuli.
- `AND` — keep cells responsive to **every** selected stimulus. The set shrinks fast; useful when you want cells that *generalize* across modalities (e.g. both `dark` and `bright` flashes).

::: tip Stim correlation max is independent of OR/AND
The **Stim correlation** color scheme uses a separate rule: with two or more stimuli selected, cells are colored by their `max r` across the selected set, regardless of whether the filter card is set to OR or AND. So you can color by max-of-two-stimuli while filtering with AND-of-two-stimuli. ([Colors → Stim correlation](./colors#stim-correlation))
:::

## Tuning the threshold

The `responsive floor` is conservative by default (`r = 0.1`). Lower it if you suspect you're hiding real, weakly-correlated cells; raise it for a stricter "definitely responding" set.

- The **saturation** anchor on the same Settings row only affects how the [Stim correlation color ramp](./colors#stim-correlation) clamps — it doesn't change which cells the filter keeps.
- After tuning, the bottom-strip cell-count readout shows how many cells remain visible.

## Worked example

Reproducing the abstract's claim that `pou4f2_cckb` is a dark-flash population:

| Card | Setting |
|---|---|
| Colors | `Stim correlation` |
| Transcriptomics | Subtype = `pou4f2_cckb` |
| Visual Stimuli | `[dark]` |
| Anatomy | all |

The remaining cells are `pou4f2_cckb` cluster members **and** are responsive to the dark flash. The plasma ramp paints them by exactly how strongly they correlate. This is preset #1 in the [Findings](/findings) page; the button there sets all four cards in one click.
