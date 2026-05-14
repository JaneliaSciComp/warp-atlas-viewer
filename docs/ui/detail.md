---
title: Detail panel
description: Interpretation of the gene bar chart, ΔF/F trace, and per-stimulus correlation chart.
---

# Detail panel

The right-edge sidebar. It displays the active focus, lasso selection, or current filter intersection:

- **Click-focus on a cell** → the panel displays that one cell.
- **Lasso selection** → the panel displays the *mean* across the lasso, unless a focused cell is also active.
- **No explicit selection, active filters** → the panel displays the mean across the [filter intersection](/filters/overview) (i.e. whatever is currently visible).
- **Empty filter and no selection** → the panel prompts for a selection.

The **‹** handle on the panel's left edge collapses it.

## Charts

### 1. Gene bar chart

A horizontal bar chart of per-gene FISH spot counts.

- **Single cell:** raw spot counts for each of the 41 panel genes.
- **Group selection:** the mean spot count per gene across the selection.
- Bars at zero are omitted; only genes with non-zero expression appear.
- Bars are sorted by magnitude (descending). If more than 20 genes have non-zero values, the panel truncates and reports the number hidden.

::: tip Reading the bar chart
For a single cell, the bars are a fingerprint of detectable genes. For a group, the same bars summarize the dominant transcriptomic identity — useful for identifying an unfamiliar lasso selection.
:::

### 2. Mean ΔF/F trace

A line chart of the calcium-imaging signal over time.

- **X-axis:** seconds. One full cycle is approximately 134 s and contains all 8 stimuli back-to-back.
- **Y-axis:** ΔF/F.
- **Single cell:** the cell's trace.
- **Group selection:** the mean trace across the selection.
- **Shaded vertical bands:** stimulus on-windows. The band colors correspond to the [stimulus icons](/filters/stimuli#the-eight-stimuli) in the Visual Stimuli card.
- **Vertical scrub cursor:** when Colors is set to **Activity**, the current time point is indicated by a yellow vertical line. Dragging the Activity time slider or starting playback moves the cursor in lockstep with the brain coloring.

::: warning Single-cell traces are noisy
Single-cell calcium traces are intrinsically noisy. For most interpretation, lasso-averaged group traces are more informative than single-cell traces.
:::

### 3. Per-stimulus correlation

A bar chart of the mean per-cell Pearson r values for the current selection. For a single focused cell this is that cell's r for each stimulus; for a group, each bar is the average of the selected cells' precomputed correlations.

- **X-axis:** the 8 stimuli, in order.
- **Y-axis:** Pearson r (can be negative).
- Positive r corresponds to activation during the stimulus on-window; negative r corresponds to suppression.
- The [Stim correlation Colors scheme](/filters/colors#stim-correlation) paints each cell by its own per-stimulus correlation, using the same underlying values before any group averaging.

::: tip Reading negative correlations
Strongly negative bars are meaningful signals, identifying inhibitory or anti-correlated populations. The dorsal-raphe `gad1b_tph2_gfra1a` preset ([Findings](/findings)) provides a worked example.
:::

### 4. Swim correlation {#swim-correlation}

A 40-bin histogram of the selection's per-cell Pearson r against estimated swim power.

- **X-axis:** signed r over `[−1, +1]`, with ticks at `±1`, `±0.5`, and `0`.
- **Y-axis:** count per bin (hidden, but encoded in bar height).
- **Bar colors:** each bin is painted with the same coolwarm divergent map used by the Swim color scheme — so the histogram is visually consistent with the 3D viewer when Colors → Swim correlation is active.
- **Shaded gray band:** the `±swimLo` deadband (cells inside it count as "off" for the pro/anti/off summary).
- **Dashed gray line:** `r = 0`.
- **Yellow vertical line, labeled "mean":** the selection's mean r.

For a single focused cell the histogram collapses to a single bar at that cell's r; the summary line below reads `r = …`. For a group selection the summary line shows mean, range, and the pro / anti / off partition counts using `swimLo` as the boundary.

::: tip Why a histogram instead of a single bar?
Swim correlation is signed and biologically interesting on both sides. A selection that's 50% strongly positive and 50% strongly negative averages to ~0, which would look unresponsive under a mean-only display. The histogram exposes that bimodality directly.
:::

### Selection summary and per-specimen breakdown {#per-specimen-breakdown}

Above the charts, the panel reports how the selection partitions across the 3 source specimens as counts. A selection dominated by a single specimen warrants a check that the finding holds across all three.

## Using the panel with the paper

For paper-guided inspection, use the Detail panel as a sanity check on the visible cells:

- the gene bars should match the marker identity implied by the subtype or gene filter,
- the ΔF/F trace should show peaks or suppressions at the shaded stimulus windows relevant to the figure,
- the per-stimulus correlation chart is the best place to confirm negative stimulus-response examples (the Stim correlation color ramp is positive-only),
- the swim correlation histogram is the analogous tool for swim-related findings, and uniquely exposes within-selection distribution shape,
- the per-specimen breakdown helps separate a cross-specimen population from a view dominated by one fish.

The panel summarizes the current viewer selection. It does not show trial-by-trial variability or manuscript-level statistical tests.

## Selection precedence

When multiple sources could populate the Detail panel, the following order applies:

1. **Focused cell** (click) — always takes precedence.
2. **Lasso polygon** (drag in t-SNE) — used in the absence of a click-focus.
3. **Filter intersection** — used when nothing is explicitly selected.
4. **Empty** — prompt shown when neither filter nor selection produces any cells.

To clear level 1, click empty space in the 3D viewer or t-SNE panel. To clear level 2, use the clear-selection button at the top of the t-SNE.
