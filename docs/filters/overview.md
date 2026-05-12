---
title: How filters combine
description: The AND-between-cards / OR-or-AND-within-card rule that drives visibility.
---

# How filters combine

The Filters tab has four cards:

```
┌──────────┐ × ┌────────────────┐ × ┌──────────┐ × ┌─────────┐
│  Colors  │   │ Transcriptomics│   │ Stimuli  │   │ Anatomy │
└──────────┘   └────────────────┘   └──────────┘   └─────────┘
```

The `×` between the cards is logical **AND** — a cell has to clear every active card to stay visible.

::: tip Colors is not a filter
**Colors** decides how visible cells are *painted*. The other three cards decide which cells are visible. They're grouped together because they live in the same tab and follow the same UI pattern (a `Card` with a small Reset button), but the Colors card never removes cells from the view.
:::

## A card with "all" doesn't filter anything

Each filter card has a sensible "everything passes" default — usually a dropdown set to **all**. A card in that state contributes nothing to the AND chain. Setting any other value tightens the visible set.

The Filters tab's top-right **Reset** button reverts every card to its "all" default in one click.

## OR vs. AND inside a card

Two cards have a logical toggle on the selections within them:

- **Transcriptomics (gene mode)** — `OR` keeps cells expressing **any** of the selected genes; `AND` keeps cells expressing **all** of them.
- **Visual Stimuli** — `OR` keeps cells responsive to **any** of the selected stimuli; `AND` keeps cells responsive to **all** of them.

There is no OR toggle for Anatomy: the region and specimen dropdowns each pick a single value or "all".

## Worked example

> "Show me cells that express both `otpa` and `slc17a7a`, are responsive to forward visual motion **or** dark flash, and live in the hindbrain — colored by their stim-correlation strength."

| Card | Setting |
|---|---|
| Colors | `Stim correlation` |
| Transcriptomics | Gene mode, `[otpa, slc17a7a]`, **AND** |
| Visual Stimuli | `[forward motion, dark flash]`, **OR** |
| Anatomy | Region = `Hindbrain` |

The remaining visible cells are gene-positive **AND** stim-responsive **AND** anatomically constrained. The plasma ramp in the legend (top-right of the 3D viewer) tells you which of them respond *strongly*.

## "Responsive" — what's the threshold?

A cell counts as responsive to a stimulus if its Pearson r with that stimulus's regressor clears the **responsive floor** in [Settings](/settings#stim-correlation-cutoffs). Default is `r ≥ 0.1`; tune up to be stricter, down to be more permissive.

The same floor is used by:

- The **Visual Stimuli** filter card (visibility).
- The **Stim correlation** color scheme (dim end of the plasma ramp).

## Selections survive filter changes

If you click-focus a cell or lasso a group, that selection stays even if you change filters and the cell would have been filtered out. The Detail panel keeps showing it. This is intentional — you can drill down into a cell, then change filters to compare its neighborhood without losing the cell itself. ([Selections](/selections))

## Next

- [Colors](./colors) — what the six schemes paint.
- [Transcriptomics](./transcriptomics) — gene multi-select and subtype dropdown.
- [Visual Stimuli](./stimuli) — the 8 stimuli and OR/AND logic.
- [Anatomy](./anatomy) — region and specimen filters.
