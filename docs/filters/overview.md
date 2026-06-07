---
title: How filters combine
description: The AND-between-cards / OR-or-AND-within-card rule that determines visibility.
---

# How filters combine

The Filters tab contains five cards:

![Five filter cards in a row — Colors, Transcriptomics, Visual Stimuli, Swim, and Anatomy — combined by logical AND.](/filter-cards.svg)

The `×` between cards denotes logical **AND**: a cell must pass every active card to remain visible.

::: tip Colors is not a filter
The **Colors** card controls how visible cells are *painted*. The other four cards determine which cells are visible. They share the same tab and UI pattern, but the Colors card never removes cells from the view.
:::

## A card set to "all" does not filter

Each filter card has an "everything passes" default, typically a dropdown set to **all**. A card in this state contributes nothing to the AND chain. Selecting any other value narrows the visible set.

The Filters tab's **Reset** button restores the viewer's default filter state in one action: Transcriptomics and Visual Stimuli return to no selection, Anatomy's atlas toggle returns to Manuscript, the region dropdown returns to "all", and the specimen control returns to "all", and Colors returns to the default Region scheme.

### Visible-cell readout {#visible-cell-readout}

A small readout next to the reset button reports the **number of cells in the active filter intersection**. In the default state this is the full dataset; as filter cards narrow the population, the count tracks the cells that pass those predicates. Visual styling controls such as ghost visibility, active brightness, opaque cells, and fade-weak-correlation alpha do not change the count.

With no focused cell or lasso active, the same filter-intersection population is what the [**Export**](/export) button in the viewer header writes to CSV.

## OR versus AND within a card

Two cards support a logical toggle on selections within them:

- **Transcriptomics (gene mode)** — `OR` retains cells expressing **any** of the selected genes; `AND` retains cells expressing **all** of them.
- **Visual Stimuli** — `OR` retains cells whose correlation passes the active mode for **any** selected stim; `AND` requires the check to hold for **every** selected stim. The OR / AND row only takes effect when the mode is not `no filter`; it grays out otherwise. See [Visual Stimuli → Mode dropdown](./stimuli#mode-dropdown).

Anatomy provides no OR toggle. The atlas toggle picks which atlas the region dropdown reads from; the two atlases are alternatives, not stacked. The region and specimen pickers each select a single value or "all".

## Worked example

> "Cells that express both `otpa` and `slc17a7a`, are positively correlated with forward visual motion or the dark flash, and are located in the optic tectum periventricular layer — colored by stimulus correlation strength."

| Card | Setting |
|---|---|
| Colors | `Stim correlation` |
| Transcriptomics | Gene mode, `[otpa, slc17a7a]`, **AND** |
| Visual Stimuli | `[motion forward, dark]` + `+ correlated`, **OR** |
| Anatomy | Region = `OTpv` |

The visible cells are gene-positive, positively stim-correlated, and anatomically constrained. The divergent coolwarm ramp in the legend reads the signed strength of response.

## "Responsive": threshold

A cell passes the stim filter if its Pearson r against the active stim's regressor clears `±stimLo` according to the mode (`+ correlated`, `- anti-correlated`, `± either`). `no filter` leaves the stim filter off. `stimLo` is in [Settings → Stim correlation cutoffs](/settings#stim-correlation-cutoffs). The default floor `0.13` is the manuscript's full-vector threshold; raising it imposes a stricter criterion, lowering it a more permissive one.

The same floor doubles as the **deadband boundary** for the [Stim correlation color scheme](/filters/colors#stim-correlation) (the divergent coolwarm ramp's neutral midpoint).

## Selections survive filter changes

A click-focused cell or lasso group is retained across filter changes, even when the cell or group would otherwise be filtered out. The Detail panel continues to display the selection. This permits comparison of a specific cell or group against successive filtered populations. See [Selections](/selections).

## Next

- [Colors](./colors) — the seven color schemes.
- [Transcriptomics](./transcriptomics) — gene multi-select and subtype dropdown.
- [Visual Stimuli](./stimuli) — the 8 stimuli and OR / AND logic.
- [Swim correlation](./swim) — the behavioral regressor channel.
- [Anatomy](./anatomy) — atlas toggle (Manuscript ↔ [mapZebrain](https://mapzebrain.org)), region dropdown (16 or 112 entries), and specimen filter.
