---
title: Colors
description: The seven color schemes and their semantics.
---

# Colors

The Colors card determines how visible cells are painted. There are seven schemes; each maps a per-cell quantity onto a categorical palette, a plasma ramp, or (for stim and swim) a divergent ramp.

::: tip Colors is not a filter
The Colors card never removes cells from the view. To restrict the visible set, use the other three filter cards. See [How filters combine](./overview).
:::

## Simple

Uniform highlight. Every visible cell is painted in the viewer's accent color. Filtered-out cells remain dim and transparent.

**When to use:** to inspect the spatial distribution of the filtered subset.

## Gene expression

Plasma ramp over FISH spot counts.

### Gene richness (no gene pinned)

If no single gene is pinned in **Transcriptomics** — that is, the gene set is empty or the toggle is set to **Subtype** or **All** — every cell is painted by **gene richness**: the number of panel genes the cell expresses. Brighter cells are transcriptomically richer.

This is the default when switching to **Colors → Gene expression** without first selecting a gene.

### Single-gene mode (one gene pinned)

Pinning exactly one gene in **Transcriptomics** colors the plasma ramp by that gene's raw FISH spot count per cell — the conventional single-gene expression map.

Use **Transcriptomics → + add gene** to pin a gene, then change the row dropdown to switch the single-gene expression map.

### Multi-gene mode (2+ genes pinned)

With two or more genes pinned, the scheme follows **Settings → Multi-gene coloring**:

- **Max** — the strongest-expressing of the selected genes per cell. Highlights cells where any single gene is bright.
- **Sum** — total spot count across the selected genes. Emphasizes co-expression strength.
- **Richness** — the number of selected genes a cell expresses (using the same predicate as the gene filter). Emphasizes co-expression breadth.

### Log / linear scale

A `log ↔ linear` toggle appears in the card when Colors is set to **Gene expression**. Spot counts span several orders of magnitude, so the default `log` scale is generally more readable.

## Stim correlation

Divergent coolwarm ramp (blue → neutral → red) over the **signed** per-cell Pearson r against the selected visual-stimulus regressor. Sign reads as colour; magnitude reads as intensity.

The colored value depends on the Visual Stimuli selection and the active mode:

- **Nothing selected** — max-|r| across all 8 stimuli (signed): a general measure of stimulus-driven responsiveness, either polarity.
- **One selected** — that stimulus's signed r per cell; the conventional single-stimulus response map.
- **Two or more selected** — depends on the mode:
  - `+ correlated` → max-positive r across the selected stims.
  - `- anti-correlated` → min-negative r across the selected stims.
  - `± either` or `no filter` → max-|r| (signed).

This keeps the coloring consistent with the filter: with `+ correlated` on, cells passing the filter never get painted blue by a different selected stim's larger-magnitude negative correlation.

The ramp anchors symmetrically at **`±stimLo`** (deadband boundary; cells within `[-stimLo, +stimLo]` map to the neutral midpoint) and **`±stimHi`** (saturation). Both live in [Settings → Stim correlation cutoffs](/settings#stim-correlation-cutoffs); defaults are `0.13` and `0.30`.

::: tip Fading weak correlations
With **Settings → Fade weak correlations** on (default), the Stim and Swim color modes scale alpha by `|r|` so cells near the neutral midpoint fade into the dark background instead of competing with the colored extremes. Turn it off for unmodulated full-opacity coloring. See [Settings → Fade weak correlations](/settings#fade-weak-correlations).
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

## Swim correlation

Divergent coolwarm ramp (blue → neutral → red) over the signed per-cell Pearson r against estimated swim power. Two-sided:

- Blue cells: anti-correlated with swimming (`r ≤ −swimLo`).
- Near-neutral cells: unresponsive (`|r| < swimLo`, the deadband).
- Red cells: swim-driven (`r ≥ +swimLo`).

The ramp anchors symmetrically at `±swimLo` (deadband boundary, where the ramp leaves the neutral midpoint) and `±swimHi` (saturation). Both are configurable in [Settings → Swim correlation cutoffs](/settings#swim-correlation-cutoffs); defaults are `0.10` and `0.35`.

Useful when combined with a Transcriptomics filter to ask "is this gene/subtype swim-driven, anti-swim, or unresponsive?" See the [Swim card](./swim) for the matching filter and the [Detail panel histogram](/ui/detail#swim-correlation) for the per-cell distribution view.

The same **Fade weak correlations** setting that applies to Stim coloring also applies here (default on): cells near the deadband midpoint fade into the background.

## Region

Categorical palette over 16 focal anatomical regions, plus *Unassigned* at index 0.

The default palette is sampled directly from the `nipy_spectral` matplotlib colormap used by the paper's region figure legend (anterior `Pal` = red → posterior `InfMO` = magenta), with *Unassigned* rendered as a dedicated neutral gray.

A **palette** toggle appears under the Colors card when this scheme is active:

- `nipy`: paper-matching `nipy_spectral`; best when preserving figure colors matters.
- `turbo`: Google's smoother rainbow-style Turbo ramp, sampled in the same 16-region anatomical order; useful when the adjacent `nipy_spectral` bands are hard to distinguish.
- `distinct`: high-contrast categorical colors; useful when separating region labels matters more than preserving the anterior/posterior rainbow order.

**When to use:** anatomical overview; a sensible default first look.

A **show unassigned** checkbox appears under the Colors card when this scheme is active (default on). Unchecking it hides every cell in the *Unassigned* bucket entirely — they render at alpha 0 and never reach the framebuffer or write depth — so the view reduces to just the 16 paper-canonical focal regions. The setting is part of the filter state and round-trips through the URL hash.

::: tip Region granularity
The viewer exposes the 16 focal groupings carried in the dataset (rather than the finer ~112-region reference atlas). See [Preprocessing → Region names](/preprocess#anatomy-mapping).
:::

## Specimen

Categorical palette over the 3 source specimens.

**When to use:** to verify that a finding holds across all three specimens. A population dominated by a single color is dominated by a single specimen. See [Specimens](/filters/anatomy#specimens).
