---
title: Colors
description: The six color schemes and their semantics.
---

# Colors

The Colors card determines how visible cells are painted. There are six schemes; each maps a per-cell quantity onto a categorical palette or a plasma ramp.

::: tip Colors is not a filter
The Colors card never removes cells from the view. To restrict the visible set, use the other three filter cards. See [How filters combine](./overview).
:::

## Simple

Uniform highlight. Every visible cell is painted in the viewer's accent color. Filtered-out cells remain dim and transparent.

**When to use:** to inspect the spatial distribution of the filtered subset.

## Region

Categorical palette over 16 focal anatomical regions, plus *Unassigned* at index 0.

**When to use:** anatomical overview; a sensible default first look.

::: tip Region granularity
The viewer exposes the 16 focal groupings carried in the dataset (rather than the finer ~112-region reference atlas). See [Preprocessing → Region names](/preprocess#anatomy-mapping).
:::

## Gene expression

Plasma ramp over FISH spot counts.

### Gene richness (no gene pinned)

If no single gene is pinned in **Transcriptomics** — that is, the gene set is empty or Subtype mode is active — every cell is painted by **gene richness**: the number of panel genes the cell expresses. Brighter cells are transcriptomically richer.

This is the default when switching to **Colors → Gene expression** without first selecting a gene.

### Single-gene mode (one gene pinned)

Pinning exactly one gene in **Transcriptomics** colors the plasma ramp by that gene's raw FISH spot count per cell — the conventional single-gene expression map.

The `‹ ›` arrows in **Transcriptomics → Gene** step through the panel in alphabetical order.

### Multi-gene mode (2+ genes pinned)

With two or more genes pinned, the scheme follows **Settings → Multi-gene coloring**:

- **Max** — the strongest-expressing of the selected genes per cell. Highlights cells where any single gene is bright.
- **Sum** — total spot count across the selected genes. Emphasizes co-expression strength.
- **Richness** — the number of selected genes a cell expresses (using the same predicate as the gene filter). Emphasizes co-expression breadth.

### Log / linear scale

A `log ↔ linear` toggle appears in the card when Colors is set to **Gene expression**. Spot counts span several orders of magnitude, so the default `log` scale is generally more readable.

## Stim correlation

Plasma ramp over Pearson r against the selected visual-stimulus regressor.

The colored value depends on the Visual Stimuli selection:

- **Nothing selected** — maximum r across all 8 stimuli, a general measure of stimulus-driven responsiveness.
- **One selected** — that stimulus's r per cell; the conventional single-stimulus response map.
- **Two or more selected** — maximum r across the selected stimuli, independent of whether the filter card is set to OR or AND.

The dim end of the ramp anchors at **Settings → responsive floor (r ≥)**; the bright end at **saturation (r ≥)**. Cells below the floor appear dim, reflecting non-responsiveness. See [Settings → Stim correlation cutoffs](/settings#stim-correlation-cutoffs).

::: warning Negative correlations
Strongly anti-correlated cells clamp to the dim end of the ramp. To identify them as a population, select a single stimulus and look for cells that are dim in regions where they would be expected to be bright. The `gad1b_tph2_gfra1a` preset in [Findings](/findings) is a worked example.
:::

## Activity

Plasma ramp over the mean ΔF/F trace at a scrubbable time point. The Colors card exposes a **time slider**, a **‹ ›** stepper, and a **▶ / ⏸** playback control that traverses the 134 s representative cycle.

- The **time slider** selects the sample by which to color.
- **Play** steps through the trace; speed is selectable from `1× / 2× / 10× / 50× / 100×`.
- The same time cursor is mirrored on the [Detail-panel ΔF/F trace](/ui/detail#mean-f-f-trace).

::: tip URL-state safe
The activity time is part of the URL hash, so a shared link reproduces the exact frame. During playback the cursor is not written to the URL on every tick; pause to commit the current time.
:::

The plasma anchors are **Settings → Activity ΔF/F anchors**: `floor` clamps the dim end and `ceiling` saturates the bright end. See [Settings → Activity ΔF/F anchors](/settings#activity-f-f-anchors).

## Specimen

Categorical palette over the 3 source specimens.

**When to use:** to verify that a finding holds across all three specimens. A population dominated by a single color is dominated by a single specimen. See [Specimens](/filters/anatomy#specimens).
