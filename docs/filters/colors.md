---
title: Colors
description: The six color schemes and how to read each one.
---

# Colors

The Colors card decides how visible cells are painted. There are six schemes; each maps a per-cell quantity onto a categorical palette or a plasma ramp.

::: tip Colors is not a filter
The Colors card never removes cells from the view. To narrow the visible set, use the other three filter cards. ([How filters combine](./overview))
:::

## Simple

Single-color highlight. Every visible cell is painted yellow (the viewer's accent color). Filtered-out cells stay dim and transparent.

**When to use:** "Where in the brain are these cells?" — the spatial silhouette of whatever subset your filters produced.

## Region

Categorical palette over 16 focal anatomical regions, plus an "Unassigned" slot at index 0.

**When to use:** Anatomical overview. Useful as your default first look.

::: tip 16 regions, not 112
The raw atlas distinguishes ~112 regions. The viewer collapses them to 16 focal groupings via a hand-built `Brain_reg → anatomy` mapping baked into the preprocessor. See [Preprocessing](/preprocess#anatomy-mapping).
:::

## Gene expression

Plasma ramp over FISH spot counts.

### Gene richness (when nothing is pinned)

If **no single gene** is pinned in **Transcriptomics** — i.e. the gene set is "all" or you're in Subtype mode — every cell is painted by **gene richness**: the count of the 41 panel genes that the cell expresses. Brighter cells are transcriptomically richer.

This is the default if you switch to **Colors → Gene expression** without first picking a gene.

### Single-gene mode (one gene pinned)

Pin exactly one gene in **Transcriptomics**. The plasma ramp now shows that gene's raw FISH spot count per cell — the classic single-gene expression map.

The `‹ ›` arrows in **Transcriptomics → Gene** step through the gene list in alphabetical order, which makes browsing the whole panel quick.

### Multi-gene mode (2+ genes pinned)

With 2 or more genes pinned, the scheme honors **Settings → Multi-gene coloring**:

- **Max** — the strongest-expressing of the selected genes per cell. Highlights cells where *any one* of the picks is bright.
- **Sum** — total spot count across the selected genes. Emphasises co-expression *strength*.
- **Richness** — how many of the selected genes the cell expresses (using the same predicate as the gene filter). Emphasises co-expression *breadth*.

### Log / linear scale

A small `log ↔ linear` toggle appears in the card when Colors is set to **Gene expression**. Spot counts span several orders of magnitude (many cells at 0 — a few at hundreds), so the default `log` scale is usually more readable.

## Stim correlation

Plasma ramp over Pearson r against the selected visual-stimulus regressor.

The colored value depends on what's selected in **Visual Stimuli**:

- **Nothing selected** → max r across all 8 stimuli (the cell's strongest-responding stimulus). Useful as a general "how stimulus-driven is this cell?" map.
- **Exactly one selected** → that stimulus's r per cell. Classic single-stimulus response map.
- **Two or more selected** → max r across just the selected stimuli. Independent of whether you have the card set to OR or AND for filter purposes.

The dim end of the ramp anchors at **Settings → responsive floor (r ≥)**; the bright end at **saturation (r ≥)**. Cells below the floor look dim (treated as non-responsive). See [Settings → Stim correlation cutoffs](/settings#stim-correlation-cutoffs).

::: warning Negative correlations
Cells with strongly negative r (anti-correlated) clamp to the dim end. To see them as a population, switch **Colors → Stim correlation** with a single stimulus selected and look for the cells that are *dim* in regions where you'd expect *bright* — those are your negative correlators. The `gad1b_tph2_gfra1a` preset in [Findings](/findings) is a worked example.
:::

## Activity

Plasma ramp over the mean ΔF/F trace at a scrubbable time point. The Colors card grows a **time slider**, a **‹ ›** stepper, and a **▶ / ⏸** playback button that steps through the 134-second representative cycle.

- **Time slider** picks the sample to color by.
- **Play** runs an interval; speed is selectable from `1x / 2x / 10x / 50x / 100x` (10x is a good default for a fast tour).
- The same time cursor is mirrored on the [Detail-panel ΔF/F trace](/ui/detail#mean-f-f-trace), so you can watch the brain animate while the trace cursor walks across the chart.

::: tip URL-state safe
The activity time is part of the URL hash, so a shared link reproduces the exact frame. While playback is running, the app stops writing the cursor to the URL (a tick every 16 ms would otherwise spam history) — pause to lock in the current time.
:::

The plasma anchors are **Settings → Activity ΔF/F anchors**: `floor` clamps the dim end, `ceiling` saturates the bright end. ([Settings → Activity ΔF/F anchors](/settings#activity-f-f-anchors))

## Specimen

Categorical palette over the 3 source fish.

**When to use:** Sanity-check that a finding holds across all three fish — a population that's mostly one color is mostly one specimen. ([Specimens](/filters/anatomy#specimens))
