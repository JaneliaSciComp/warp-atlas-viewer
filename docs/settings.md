---
title: Settings
description: Threshold cutoffs, ramp anchors, point density, rendering, and the gene-expression threshold mode.
---

# Settings

The **Settings** tab in the bottom panel holds the parameters that are not part of the everyday filter loop. Settings values are persisted in the [URL hash](/sharing); the per-browser **show descriptions** preference is the one exception.

A **↺ reset settings** button at the top of the tab reverts every setting to its default; it is disabled when no setting has been changed.

A **show descriptions** checkbox sits next to the reset button. When unchecked, every per-section description paragraph is hidden so the tab compresses to titles and controls once the meanings are familiar. The preference is stored in `localStorage` rather than the URL hash, so it is a per-browser viewer-chrome choice and is not carried by shared links.

---

## 3D point density {#3d-point-density}

Controls how big the dots are and how visible out-of-filter cells (ghosts) are in the 3D brain view.

- **auto** *(default on)* — derives point size and ghost visibility from the live 3D canvas height, so the viewer self-adapts as you resize the window or expand/collapse the bottom panel. Manual sliders are hidden while auto is on.
- **scale by filter** *(default on, nested under auto)* — additionally enlarges *active* (in-set) cells as the filter narrows, so a small selected cluster reads louder than the surrounding population. Ghost cells are not boosted.

With auto **off**, the two sliders are exposed directly:

- **point size (px)** — base size used for active cells. Range `1` – `40` px; default `10`.
- **ghost visibility** (0..1) — `0` makes out-of-filter cells fully transparent and the click pickers skip them; `1` renders them at the standard dim alpha and keeps them fully pickable. Pickability flips off below the midpoint (slider < 0.5). Default `0.6`.

The ghost setting also drives **render order**: out-of-filter cells render first and in-filter cells render last, so foreground (in-set) cells never get occluded by the dim background regardless of true 3D depth, even when ghosts are still visible.

### How auto mode works

Auto mode treats the 3D canvas **height** as the input. Width is shown in the debug overlay, but it does not feed the point-size or ghost-visibility formulas because the brain fills the viewport vertically.

**Point size** follows a negative-exponential approach to an asymptote:

```
pointSize = 32.22 - 31.10 · exp(-0.000481 · height)
```

The curve is fit to approximate anchors `(100 px, ~2 px)`, `(300 px, ~6 px)`, `(600 px, ~9 px)`, `(1000 px, ~13 px)`, and `(1500 px, ~17 px)`, and approaches ~32 px far above realistic viewport heights. In other words, 9 px is the around-600-px-tall value, not a hard cap.

**Ghost visibility** uses a smooth rise-and-fall shape:

```
ghost = clamp(
  0.5 + 0.319 · σ((height - 285) / 101.8) · σ((1364 - height) / 97.3),
  0.5,
  1.0
)
```

It is floored at `0.5`, rises through short-to-medium canvases, peaks around the 800–1000 px height band near `0.8`–`0.85`, then eases back toward roughly the mid-0.6 range by ~1380 px tall. This keeps ghosts visible enough to provide context without letting the background haze overpower active cells.

### How scale by filter works

When **scale by filter** is on (only available with auto on), active in-set cells get an additional multiplier on top of auto's `basePointSize`:

```
tFilter    = clamp(
  (log(max(50, inSetCount)) - log(50))
  / (log(max(51, totalCells)) - log(50)),
  0,
  1
)
inSetBoost = 2 - tFilter
```

So a tightly filtered subset of `~50` cells reaches `2×` the base size, the full population stays at `1×`, and the lerp runs in log space between those endpoints. Ghosts are untouched. This knob is purely an active-cell emphasis, not a re-tune of the dim background.

The applied values (`base pointSize`, `effective pointSize`, `effective ghost`, the `tFilter` lerp parameter, and `inSetBoost`) are inspectable via the **Debug** section described below.

## 3D camera controls {#3d-camera-controls}

Controls how the 3D viewer interprets drag inertia and right-drag panning. These settings change camera *behavior*; the current camera pose itself (position, orientation, orbit target, and screen-space pan) is still stored separately in the [URL hash](/sharing#contents-of-the-hash).

### Object-centric rotation

**Object-centric rotation** is on by default. In this mode:

- regular drag orbits around the volume center,
- right-drag shifts the view in screen space without moving that orbit target,
- subsequent rotations continue to pivot around the volume center, even after the volume has been shifted within the viewport.

Turn it off for native trackball-style panning. In that mode, right-drag moves the camera and the orbit target together; subsequent rotations pivot around the panned target instead of the volume center. Shared links and refreshes preserve whichever target is active, so the recreated view behaves the same way.

The 3D viewer's **reset view** button restores the default camera position, orientation, orbit target, and any screen-space pan.

### Momentum

**Momentum** controls how long rotation, pan, and zoom continue to drift after mouse release:

- `0` disables inertia, so motion stops immediately,
- `1` gives the slowest decay,
- the default `0.9` matches the original trackball feel.

The slider range is `0` – `1` in `0.05` steps.

## t-SNE point density

The t-SNE scatter has its own size and ghost-visibility section because its dot field is much denser per cell and there's no perspective falloff to shrink distant points. These controls are always manual; there is no t-SNE auto mode.

- **point size (px)** — uniform dot diameter for every cell. Range `2` – `40` px; default `11`.
- **ghost visibility** (0..1) — visibility of out-of-filter cells in t-SNE specifically. Defaults to `0.25` because the higher density of t-SNE points makes them stack more aggressively than in the 3D view; the lower default keeps the active population readable without hiding the ghosts you're aiming at when re-lassoing.

These settings do not interact with the 3D-viewer controls in either direction.

## Rendering

Controls that affect how scatter plots are drawn. They do not change the Detail panel plots or which cells pass filters.

### Ambient occlusion

**Ambient occlusion** enables a screen-space post-processing pass in the **3D brain view** that adds local contact shadows around dense boundaries and overlapping cells. It is off by default and does not affect the t-SNE panel.

When enabled, two numeric controls become active:

- **occlusion strength** — how dark the local shadows can become. Range `0` – `0.4`, step `0.005`; the default is `0.1`.
- **shadow radius (px)** — the screen-space neighborhood used by the occlusion pass. Smaller values keep shadows tight around local overlaps; larger values create broader depth shading. Range `1` – `72` px; the default is `8`.

These settings are intended as visual depth cues for the 3D view. They are persisted in the URL hash so shared links reproduce the same rendering style.

### Opaque active cells

**Opaque active cells** makes active / in-filter foreground cells render at full opacity in both the 3D viewer and the t-SNE panel while leaving ghost/background cells dimmed. This can make the active population easier to read when it would otherwise be partially transparent. It is off by default.

Any user selection still dims non-selected cells on top of this setting, so selection emphasis remains visible.

### Active brightness

**Active brightness** additively lifts the color of every in-set cell by `b` in both the 3D and t-SNE views: `c' = min(1, c + b)`, applied per RGB channel. Useful when the active palette reads too dark against the dark background. Range `0` – `0.4`, step `0.01`; the default is `0.1`. Ghost cells (out-of-filter or out-of-selection) are not lifted, so their `DIM_RGB` stays as designed.

The color legend is rebuilt with the same lift so the swatches (Region, Specimen) and gradients (Gene, Activity, Stim, Swim) stay visually in sync with what the scatter renders.

## Gene plasma ceiling

Upper anchor for the **Gene expression** color scheme's plasma ramp, expressed as a raw FISH spot count. Cells above this value saturate at the bright end of the ramp.

- **max spot count** — range `50` – `5000` spots in steps of `50`; default `1000`.

Adjust to match the practical ceiling of the panel's spot-count distribution.

## Multi-gene coloring

Controls what the [Gene color scheme](/filters/colors#multi-gene-mode-2-genes-pinned) displays when two or more genes are selected:

- **Max** *(default)* — strongest single gene per cell.
- **Sum** — total spot count across the selected genes; emphasizes co-expression strength.
- **Richness** — count of selected genes a cell expresses, using the [gene-expression threshold](#gene-expression-threshold) below.

This setting has no effect with a single gene selected.

## Gene expression threshold

Defines what counts as "expressing" a gene, for the [gene filter](/filters/transcriptomics#what-counts-as-expressing-a-gene) and for the [Richness multi-gene coloring](#multi-gene-coloring) above:

- **Paper** *(default)* — uses the paper's per-gene spot-count cutoffs (typically 25 spots, adjusted per gene/fish via the Maximum-Deviation approach). Backed by `BinaryGenes_All` from the manifest; the per-gene threshold appears in each gene-row tooltip.
- **Global** — applies a single user-set spot-count threshold uniformly across all genes via `geneCounts >= threshold`. The companion **global threshold (spots)** numeric input sets the cutoff; range `1` – `500`, default `25`. Set to `1` for "any detected".

::: warning Subtypes are precomputed
Switching to Global threshold currently only affects the *gene filter* and the *gene-richness coloring*. Molecular subtype membership is precomputed from the paper's thresholds in the manifest, so a Subtype-mode filter doesn't shift when you change the global threshold.
:::

## Stim correlation cutoffs

Two anchors for the signed per-cell Pearson r between calcium activity and the stimulus regressor:

- **responsive floor (|r| ≥)** — the magnitude floor for the stim filter (cells must clear `±stimLo` per the active mode on the [Visual Stimuli card](/filters/stimuli#mode-dropdown)) and the **deadband** boundary for the divergent [Stim correlation color ramp](/filters/colors#stim-correlation).
- **saturation (|r| ≥)** — magnitude at which the divergent ramp reaches its endpoints. Does not affect the filter.

Defaults are floor `0.13` and saturation `0.30`. The floor matches the manuscript's full-vector responsive threshold (Methods: "Selecting positively and negatively correlated neurons"); the saturation sits near the 99th percentile of the cycle-wide correlation distribution.

The sliders constrain the floor to stay below saturation and saturation to stay above the floor; both values are bounded by the valid correlation range (`0` – `1`).

## Swim correlation cutoffs

Two anchors for the signed per-cell correlation between calcium activity and estimated swim power:

- **responsive floor (|r| ≥)** — magnitude below which a cell is treated as unresponsive (neutral midpoint of the divergent color ramp; rejected by the swim filter unless `swimMode` is `off`).
- **saturation (|r| ≥)** — magnitude at which the divergent ramp reaches its endpoints.

Defaults are floor `0.10` and saturation `0.35`. The floor matches the manuscript's swim-correlation cutoff (Methods: "Correlation to swimming behavior"; R > 0.1 / R < −0.1 identifies the swim-related subtypes). Lower the floor to be more permissive in either direction.

The sliders constrain the floor to stay below saturation and saturation to stay above the floor; both values are bounded by the valid correlation range (`0` – `1`).

## Fade weak correlations

When **on** *(default)*, the [Stim](/filters/colors#stim-correlation) and [Swim](/filters/colors#swim-correlation) divergent color ramps scale alpha by `|r|` so cells near the neutral midpoint fade into the dark background instead of competing with the colored extremes. A floor at `0.12` keeps midpoint cells faintly visible.

When **off**, every in-set cell renders at full opacity, including the bright midpoint of the divergent ramp, which can dominate visually on a dark background.

This setting interacts with the `visibleCount` reported in the [Filters tab](/filters/overview#visible-cell-readout): a cell counts as visible when its final alpha is ≥ 0.5, so cells faded out by this setting drop out of the count as well as out of the visual.

## Activity ΔF/F anchors {#activity-f-f-anchors}

Two anchors for the [Activity color scheme](/filters/colors#activity):

- **floor (ΔF/F)** — cells at or below this value map to the dim end of the plasma ramp. Range `-2` up to just below the ceiling; default `0.0`.
- **ceiling (ΔF/F)** — cells at or above this value saturate at the bright end. Range just above the floor up to `5`; default `1.5`.

Tune these to match the practical dynamic range of the dataset's calcium traces.

## Debug {#debug-overlay}

A developer toggle. When **debug overlay** is on, the 3D viewer renders a small monospace readout in the top-left corner with the inputs and outputs of the auto / scale-by-filter math: canvas dimensions, total + in-set cell counts, the toggle states, the slider inputs, the `tFilter` lerp parameter, `inSetBoost`, and the resulting `basePointSize`, `effectivePointSize`, and `effectiveGhostIntensity`. Useful for tuning the formulas or sanity-checking the rendered values against expectations.

Off by default; persisted in the URL hash like every other setting.

## What Settings does not control

The Settings tab governs thresholds, palette anchors, point density, rendering style, and 3D camera-control behavior. The following are intentionally excluded:

- the active color scheme (use the [Colors card](/filters/colors)),
- Activity time and playback speed (use the [Colors card's Activity controls](/filters/colors#activity)),
- selections (use [click or lasso](/selections)),
- the current 3D camera pose (position, orientation, orbit target, and pan),
- the t-SNE viewport (pan and zoom).

These are also stored in the URL hash, but outside the Settings tab.
