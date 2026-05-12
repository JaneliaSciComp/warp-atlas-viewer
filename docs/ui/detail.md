---
title: Detail panel
description: How to read the gene bar chart, ΔF/F trace, and per-stimulus correlation chart.
---

# Detail panel

The right-edge sidebar. It populates whenever you have a [selection](/selections):

- **Click-focus on a cell** → the panel shows that one cell.
- **Lasso selection** → the panel shows the *mean* over the lasso.
- **Nothing selected** → the panel shows the mean over the [filter intersection](/filters/overview) (i.e. whatever's currently visible).
- **Empty filter + nothing selected** → the panel prompts you to pick something.

Collapse with the **‹** handle on the panel's left edge.

## Charts

### 1. Gene bar chart

A horizontal bar chart of per-gene FISH spot counts.

- **Single cell:** raw spot counts for each of the 41 panel genes.
- **Selection:** **mean** spot count per gene across the selected cells.
- Bars at zero are hidden — only genes with non-zero expression in the selection appear.
- Bars are sorted descending. If the selection expresses more than 20 genes, the panel truncates and shows a count of how many more were hidden.

::: tip How to read it
For a single cell, the bar lengths are a fingerprint of which genes are detectable. For a group, the same bars tell you the dominant transcriptomic identity of the group — useful for naming an unfamiliar lasso selection.
:::

### 2. Mean ΔF/F trace

A line chart of the calcium-imaging signal as a function of time.

- **X-axis:** seconds (a full cycle is ~134 s; one cycle contains all 8 stimuli back-to-back).
- **Y-axis:** ΔF/F, the standard relative-fluorescence readout. Higher = more active.
- **Single cell:** that cell's trace.
- **Selection:** the *mean* trace across the selection.
- **Shaded vertical bands:** when each stimulus was on. The colors correspond to the [stimulus icons](/filters/stimuli#the-eight-stimuli) used in the Visual Stimuli card.
- **Vertical scrub cursor:** if Colors is set to **Activity**, the time point currently driving the brain's color is shown as a yellow vertical line. Drag the Activity time slider or hit play to see the trace cursor move in lockstep with the brain.

::: warning Single-cell traces are noisy
A single zebrafish cell's calcium trace is intrinsically noisy — group-averaging (lasso a cluster) is usually more informative than focusing one cell.
:::

### 3. Per-stimulus correlation

A bar chart of the Pearson r between the (mean) trace and each of the 8 stimulus regressors.

- **X-axis:** the 8 stimuli, in order.
- **Y-axis:** Pearson r (can be negative).
- Positive r ≈ the cell ramps up when the stimulus is on. Negative r ≈ the cell suppresses.
- The [Stim correlation Colors scheme](/filters/colors#stim-correlation) paints the brain by this same value.

::: tip Reading negative correlations
Strongly negative bars are real signals — they mark inhibitory or anti-correlated populations. The dorsal-raphe `gad1b_tph2_gfra1a` preset ([Findings](/findings)) is a good example.
:::

### 4. Per-fish breakdown

Below the charts the panel shows how the selection splits across the 3 source fish (counts and percentages). A selection driven by a single fish is a flag to double-check that the finding holds across all three.

## Selection precedence

When multiple things are selected at once, the panel obeys this order:

1. **Focused neuron** (click) — always wins.
2. **Lasso polygon** (drag in t-SNE) — used if no click-focus.
3. **Filter intersection** — used if nothing is explicitly selected.
4. **Empty** — prompt shown when neither filter nor selection produces any cells.

To drop level 1, click empty space in the 3D viewer or use the clear-selection button. To drop level 2, use the same clear-selection button (top of the t-SNE).
