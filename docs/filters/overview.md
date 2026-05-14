---
title: How filters combine
description: The AND-between-cards / OR-or-AND-within-card rule that determines visibility.
---

# How filters combine

The Filters tab contains five cards:

![Five filter cards in a row — Colors, Transcriptomics, Visual Stimuli, Swim, and Anatomy — combined by logical AND.](/filter-cards.svg)

The `×` between cards denotes logical **AND**: a cell must pass every active card to remain visible.

::: tip Colors is not a filter
The **Colors** card controls how visible cells are *painted*. The remaining four cards determine which cells are visible. The cards share the same tab and UI pattern, but the Colors card never removes cells from the view.
:::

## A card set to "all" does not filter

Each filter card has an "everything passes" default, typically a dropdown set to **all**. A card in this state contributes nothing to the AND chain. Selecting any other value narrows the visible set.

The Filters tab's **Reset** button restores the viewer's default filter state in one action: Transcriptomics and Visual Stimuli return to no selection, Anatomy's region and specimen controls return to "all", and Colors returns to the default Region scheme.

### Visible-cell readout {#visible-cell-readout}

A small readout next to the reset button reports the **number of cells currently visible** after the active filters. It serves as a quick confirmation that a filter combination has not inadvertently emptied the view.

## OR versus AND within a card

Two cards support a logical toggle on selections within them:

- **Transcriptomics (gene mode)** — `OR` retains cells expressing **any** of the selected genes; `AND` retains cells expressing **all** of them.
- **Visual Stimuli** — `OR` retains cells responsive to **any** of the selected stimuli; `AND` retains cells responsive to **all** of them.

Anatomy provides no OR toggle: the region and specimen dropdowns each select a single value or "all".

## Worked example

> "Cells that express both `otpa` and `slc17a7a`, are responsive to forward visual motion or the dark flash, and are located in the hindbrain — colored by stimulus correlation strength."

| Card | Setting |
|---|---|
| Colors | `Stim correlation` |
| Transcriptomics | Gene mode, `[otpa, slc17a7a]`, **AND** |
| Visual Stimuli | `[forward motion, dark flash]`, **OR** |
| Anatomy | Region = `Hindbrain` |

The visible cells are gene-positive, stimulus-responsive, and anatomically constrained. The plasma ramp in the legend indicates the strength of response.

## "Responsive": threshold

A cell is considered responsive to a stimulus if its Pearson r with the corresponding regressor meets the **responsive floor** in [Settings](/settings#stim-correlation-cutoffs). The default is `r ≥ 0.13` (the manuscript's full-vector threshold); raising it imposes a stricter criterion, lowering it a more permissive one.

The same floor is used by:

- the **Visual Stimuli** filter card (visibility),
- the **Stim correlation** color scheme (dim end of the plasma ramp).

## Selections survive filter changes

A click-focused cell or lasso group is retained across filter changes, even when the cell or group would otherwise be filtered out. The Detail panel continues to display the selection. This permits comparison of a specific cell or group against successive filtered populations. See [Selections](/selections).

## Next

- [Colors](./colors) — the seven color schemes.
- [Transcriptomics](./transcriptomics) — gene multi-select and subtype dropdown.
- [Visual Stimuli](./stimuli) — the 8 stimuli and OR / AND logic.
- [Swim correlation](./swim) — the behavioral regressor channel.
- [Anatomy](./anatomy) — region and specimen filters.
