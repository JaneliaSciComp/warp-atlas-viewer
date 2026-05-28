---
title: Settings
description: Threshold cutoffs, ramp anchors, point density, rendering, and the gene-expression threshold mode.
---

# Settings

The **Settings** tab in the bottom panel holds the parameters that are not part of the everyday filter loop. All values are persisted in the [URL hash](/sharing).

A **↺ reset settings** button at the top of the tab reverts everything to defaults; it is disabled when no setting has been changed.

A **show descriptions** checkbox sits next to the reset button. When unchecked, every per-section description paragraph is hidden so the tab compresses to titles and controls once the meanings are familiar. The preference is stored in `localStorage` rather than the URL hash, so it is a per-browser viewer-chrome choice and is not carried by shared links.

---

## 3D point density

Controls how big the dots are and how visible out-of-filter cells (ghosts) are in the 3D brain view. Two independent knobs:

- **auto** *(default on)* — derives point size and ghost visibility from the live 3D canvas area, so the viewer self-adapts as you resize the window or expand/collapse the bottom panel. Sliders are hidden while auto is on.
- **scale by filter** *(default off, nested under auto)* — additionally enlarges *active* (in-set) cells as the filter narrows, so a small selected cluster reads louder than the surrounding population. Ghost cells are not boosted.

With auto **off**, the two sliders are exposed directly:

- **point size (px)** — base size used for active cells. Range 2 – 40.
- **ghost visibility** (0..1) — `0` makes out-of-filter cells fully transparent and the click pickers skip them; `1` renders them at the standard dim alpha and keeps them fully pickable. Pickability flips off below the midpoint (slider < 0.5).

The ghost setting also drives **render order**: out-of-filter cells render first and in-filter cells render last, so foreground (in-set) cells never get occluded by the dim background regardless of true 3D depth — even when ghosts are still visible.

### How auto mode works

Auto mode treats the 3D canvas area as the input and produces two outputs.

**Point size** lerps linearly in `log(canvasArea)` between `(100 000 px², 3 px)` and `(~722 736 px² = 1512 × 478, 9 px)`. Below the lower anchor the size clamps at 3 px; above the upper anchor it clamps at 9 px. Log space matches how density scales with area — doubling the canvas should bump the dot diameter by roughly the same fraction regardless of where you started — so the curve drops fast on small canvases and flattens out as the window grows. The upper anchor is the typical 3D-viewer panel height on a 1500-pixel-wide laptop with the bottom panel open; once you've reached that size, dots stay at 9 px even on a 4K monitor.

**Ghost visibility** follows a negative-exponential approach to 1.0:

```
ghost = clamp(1 - 0.8447 · exp(-k · (area - area₀)), 0.1, 1.0)
```

with `k ≈ 1.32 × 10⁻⁶` per px² and `area₀ ≈ 170 460 px²`. The floor (`0.10`) kicks in for tiny canvases — necessary because ghost cells stack visually on a small canvas and would smother the colored cells if they stayed at higher opacity. The ceiling (`1.00`) is approached gradually as the canvas grows past `h ≈ 2000` (assuming the standard 1500 px width); at typical laptop sizes the curve sits around 0.5 – 0.7. The constants were fit by least-squares against user-chosen reference points at canvas heights `(100, 250, 350, 550)` mapping to ghost values `(0.1, 0.4, 0.5, 0.6)`; the asymptote (1.0) was held fixed, and the residual error per anchor is under 0.1.

### How scale by filter works

When **scale by filter** is on (only available with auto on), active in-set cells get an additional multiplier on top of auto's `basePointSize`:

```
inSetBoost = clamp(2 - tFilter, 1.0, 2.0)
tFilter    = log(max(50, inSetCount) / 50) / log(totalCells / 50)
```

So a tightly filtered subset of `~50` cells reaches `2×` the base size, the full population stays at `1×`, and the lerp runs in log space between those endpoints. Ghosts are untouched — this knob is purely an active-cell emphasis, not a re-tune of the dim background.

The applied values (`base pointSize`, `effective pointSize`, `effective ghost`, the `tArea` and `tFilter` lerp parameters, `inSetBoost`) are inspectable via the **Debug overlay** described below.

## t-SNE point density

The t-SNE scatter has its own size and ghost-visibility section because its dot field is much denser per cell and there's no perspective falloff to shrink distant points. The controls work like the 3D manual-mode sliders, with no auto:

- **point size (px)** — uniform dot diameter for every cell. Defaults to `11`.
- **ghost visibility** (0..1) — visibility of out-of-filter cells in t-SNE specifically. Defaults to `0.25` because the higher density of t-SNE points makes them stack more aggressively than in the 3D view; the lower default keeps the active population readable without hiding the ghosts you're aiming at when re-lassoing.

These settings do not interact with the 3D-viewer controls in either direction.

## Rendering

Controls that affect how scatter plots are drawn. They do not change the Detail panel plots or which cells pass filters.

### Ambient occlusion

**Ambient occlusion** enables a screen-space post-processing pass in the **3D brain view** that adds local contact shadows around dense boundaries and overlapping cells. It is off by default and does not affect the t-SNE panel.

When enabled, two numeric controls become active:

- **occlusion strength** — how dark the local shadows can become. Range `0` – `0.4`; the default is `0.1`.
- **shadow radius (px)** — the screen-space neighborhood used by the occlusion pass. Smaller values keep shadows tight around local overlaps; larger values create broader depth shading. Range `1` – `72` px; the default is `8`.

These settings are intended as visual depth cues for the 3D view. They are persisted in the URL hash so shared links reproduce the same rendering style.

### Opaque active cells

**Opaque active cells** makes active / in-filter foreground cells render at full opacity in both the 3D viewer and the t-SNE panel while leaving ghost/background cells dimmed. This can make the active population easier to read when it would otherwise be partially transparent.

Any user selection still dims non-selected cells on top of this setting, so selection emphasis remains visible.

### Active brightness

**Active brightness** additively lifts the color of every in-set cell by `b` in both the 3D and t-SNE views: `c' = min(1, c + b)`, applied per RGB channel. Useful when the active palette reads too dark against the dark background. Range `0` – `0.4`, step `0.01`; the default is `0.1`. Ghost cells (out-of-filter or out-of-selection) are not lifted — their `DIM_RGB` stays as designed.

The color legend is rebuilt with the same lift so the swatches (Region, Specimen) and gradients (Gene, Activity, Stim, Swim) stay visually in sync with what the scatter renders.

## Gene plasma ceiling

Upper anchor for the **Gene expression** color scheme's plasma ramp, expressed as a raw FISH spot count. Cells above this value saturate at the bright end of the ramp.

The default is chosen so that the brightest typical gene does not saturate cells of interest. Adjust to match the practical ceiling of the panel's spot-count distribution.

- **Range:** 50 – 5000 spots.

## Multi-gene coloring

Controls what the [Gene color scheme](/filters/colors#multi-gene-mode-2-genes-pinned) displays when two or more genes are pinned:

- **Max** — strongest single gene per cell.
- **Sum** — total spot count across the pinned genes; emphasizes co-expression strength.
- **Richness** — count of pinned genes a cell expresses, using the [gene-expression threshold](#gene-expression-threshold) below.

This setting has no effect with a single gene pinned.

## Gene expression threshold

Defines what counts as "expressing" a gene, for the [gene filter](/filters/transcriptomics#what-counts-as-expressing-a-gene) and for the [Richness multi-gene coloring](#multi-gene-coloring) above:

- **Paper** *(default)* — uses the paper's per-gene spot-count cutoffs (typically 25 spots, adjusted per gene/fish via the Maximum-Deviation approach). Backed by `BinaryGenes_All` from the manifest.
- **Global** — applies a single user-set spot-count threshold uniformly across all genes via `geneCounts >= threshold`. The companion "global threshold (spots)" numeric input sets the cutoff; default `25`. Set to 1 for "any detected".

::: warning Subtypes are precomputed
Switching to Global threshold currently only affects the *gene filter* and the *gene-richness coloring*. Molecular subtype membership is precomputed from the paper's thresholds in the manifest, so a Subtype-mode filter doesn't shift when you change the global threshold.
:::

## Stim correlation cutoffs

Two anchors for the signed per-cell Pearson r between calcium activity and the stimulus regressor:

- **responsive floor (|r| ≥)** — the magnitude floor for the stim filter (cells must clear `±stimLo` per the active mode on the [Visual Stimuli card](/filters/stimuli#mode-dropdown)) and the **deadband** boundary for the divergent [Stim correlation color ramp](/filters/colors#stim-correlation).
- **saturation (|r| ≥)** — magnitude at which the divergent ramp reaches its endpoints. Does not affect the filter.

Defaults are floor `0.13` and saturation `0.30`. The floor matches the manuscript's full-vector responsive threshold (Methods: "Selecting positively and negatively correlated neurons"); the saturation sits near the 99th percentile of the cycle-wide correlation distribution.

## Swim correlation cutoffs

Two anchors for the signed per-cell correlation between calcium activity and estimated swim power:

- **responsive floor (|r| ≥)** — magnitude below which a cell is treated as unresponsive (neutral midpoint of the divergent color ramp; rejected by the swim filter unless `swimMode` is `off`).
- **saturation (|r| ≥)** — magnitude at which the divergent ramp reaches its endpoints.

Defaults are floor `0.10` and saturation `0.35`. The floor matches the manuscript's swim-correlation cutoff (Methods: "Correlation to swimming behavior"; R > 0.1 / R < −0.1 identifies the swim-related subtypes). Lower the floor to be more permissive in either direction.

## Fade weak correlations

When **on** *(default)*, the [Stim](/filters/colors#stim-correlation) and [Swim](/filters/colors#swim-correlation) divergent color ramps scale alpha by `|r|` so cells near the neutral midpoint fade into the dark background instead of competing with the colored extremes. Floor at 0.12 keeps midpoint cells faintly visible.

When **off**, every in-set cell renders at full opacity, including the bright midpoint of the divergent ramp — which can dominate visually on a dark background.

This setting interacts with the `visibleCount` reported in the [Filters tab](/filters/overview#visible-cell-readout): a cell counts as visible when its final alpha is ≥ 0.5, so cells faded out by this setting drop out of the count as well as out of the visual.

## Activity ΔF/F anchors

Two anchors for the [Activity color scheme](/filters/colors#activity):

- **floor (ΔF/F)** — cells at or below this value map to the dim end of the plasma ramp.
- **ceiling (ΔF/F)** — cells at or above this value saturate at the bright end.

The default range accommodates quiet cells at the dim end while allowing peaks to saturate.

## Debug overlay

A developer toggle. When **on**, the 3D viewer renders a small monospace readout in the top-left corner with the inputs and outputs of the auto / scale-by-filter math: canvas dimensions and area, total + in-set cell counts, the toggle states, the slider inputs, the `tArea` and `tFilter` lerp parameters, `inSetBoost`, and the resulting `basePointSize`, `effectivePointSize`, and `effectiveGhostIntensity`. Useful for tuning the formulas or sanity-checking the rendered values against expectations.

Off by default; persisted in the URL hash like every other setting.

## What Settings does not control

The Settings tab governs thresholds, palette anchors, point density, and rendering style. The following are intentionally excluded:

- the active color scheme (use the [Colors card](/filters/colors)),
- selections (use [click or lasso](/selections)),
- the 3D camera position (orbit and wheel),
- the t-SNE viewport (pan and zoom).

These are also stored in the URL hash, but outside the Settings tab.
