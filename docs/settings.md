---
title: Settings
description: Threshold cutoffs, ramp anchors, point density, rendering, projection, and the gene-expression threshold mode.
---

# Settings

The **Settings** tab in the bottom panel holds the parameters that are not part of the everyday filter loop. Settings values are persisted in the [URL hash](/sharing); the per-browser **show descriptions** preference is the one exception.

A **↺ reset settings** button at the top of the tab reverts every setting to its default; it is disabled when no setting has been changed.

A **show descriptions** checkbox sits next to the reset button. When unchecked, every per-section description paragraph is hidden so the tab compresses to titles and controls once the meanings are familiar. The preference is stored in `localStorage` rather than the URL hash, so it is a per-browser viewer-chrome choice and is not carried by shared links.

---

## 3D point density {#3d-point-density}

Controls how big the points are and how visible out-of-filter cells (ghosts) are in the 3D brain view.

- **show ghosts** *(default on; off in [embedded mode](#embedded-mode))* — whether out-of-filter cells are drawn in the 3D view at all. Off leaves only the cells passing the filters, the same result as a **3D ghost visibility** of `0` — including the click pickers skipping them — but it works with `auto point sizes` left on, where ghost visibility is derived from the canvas height rather than read from the slider. While it is off the visibility slider is greyed out. The t-SNE panel keeps its own ghosts either way (see [t-SNE point density](#t-sne-point-density)).
- **auto point sizes** *(default on)* — derives point size and ghost visibility from the live 3D canvas height, so the viewer self-adapts as you resize the window or expand/collapse the bottom panel. Manual sliders are hidden while auto is on.
- **scale by filter** *(default on, nested under auto)* — additionally enlarges *active* (in-set) cells as the filter narrows, so a small selected cluster reads louder than the surrounding population. Ghost cells are not boosted.
- **scale by depth** *(default on)* — shrinks cells the farther they sit from the camera (the familiar perspective look). Turn it off to drop that per-cell perspective falloff so every cell contributes equally regardless of depth — the "see through the volume" convention used by max-intensity projection. Flat-mode points are matched to the perspective size at the default zoom, so flipping the toggle doesn't change density, and they scale gently with camera zoom so on-screen density stays roughly constant as you zoom in and out. Independent of `auto point sizes` and of the projection mode, so any combination is valid.

With auto **off**, the two sliders are exposed directly:

- **3D point size (px)** — base size used for active cells. Range `1` – `40` px; default `10`.
- **3D ghost visibility** (0..1) — `0` makes out-of-filter cells fully transparent and the click pickers skip them; `1` renders them at the standard dim alpha and keeps them fully pickable. Pickability flips off below the midpoint (slider < 0.5). Default `0.6`. Greyed out while **show ghosts** is off, since there is then nothing to set the visibility of.

The ghost setting also drives **render order**: out-of-filter cells render first and in-filter cells render last, so foreground (in-set) cells never get occluded by the dim background regardless of true 3D depth, even when ghosts are still visible.

### How auto point sizes works

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

When **scale by filter** is on (only available with auto point sizes on), active in-set cells get an additional multiplier on top of auto's `basePointSize`:

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

The t-SNE scatter has its own size and ghost-visibility section because its point field is much denser per cell and there's no perspective falloff to shrink distant points. These controls are always manual; there is no t-SNE auto mode.

- **point size (px)** — uniform point diameter for every cell. Range `2` – `40` px; default `11`.
- **ghost visibility** (0..1) — visibility of out-of-filter cells in t-SNE specifically. Defaults to `0.25` because the higher density of t-SNE points makes them stack more aggressively than in the 3D view; the lower default keeps the active population readable without hiding the ghosts you're targeting when re-lassoing.

These settings do not interact with the 3D-viewer controls in either direction.

## Rendering

Controls that affect how scatter plots are drawn. They do not change the Detail panel plots or which cells pass filters.

### Ambient occlusion

**Ambient occlusion** enables a screen-space post-processing pass in the **3D brain view** that adds local contact shadows around dense boundaries and overlapping cells. It is off by default and does not affect the t-SNE panel.

When enabled, two numeric controls become active:

- **occlusion strength** — how dark the local shadows can become. Range `0` – `0.4`, step `0.005`; the default is `0.1`.
- **shadow radius (px)** — the screen-space neighborhood used by the occlusion pass. Smaller values keep shadows tight around local overlaps; larger values create broader depth shading. Range `1` – `72` px; the default is `8`.

These settings are intended as visual depth cues for the 3D view. They are persisted in the URL hash so shared links reproduce the same rendering style.

Ambient occlusion is disabled while a [Projection](#projection) mode is active because projection renders through its own off-screen reduction path.

### Opaque active cells

**Opaque active cells** makes active / in-filter foreground cells render at full opacity in both the 3D viewer and the t-SNE panel while leaving ghost/background cells dimmed. This can make the active population easier to read when it would otherwise be partially transparent. It is off by default.

Any user selection still dims non-selected cells on top of this setting, so selection emphasis remains visible.

This control is disabled while a [Projection](#projection) mode is active because projection ignores per-cell alpha overrides.

### Active brightness

**Active brightness** additively lifts the color of every in-set cell by `b` in both the 3D and t-SNE views: `c' = min(1, c + b)`, applied per RGB channel. Useful when the active palette reads too dark against the dark background. Range `0` – `0.4`, step `0.01`; the default is `0.1`. Ghost cells (out-of-filter or out-of-selection) are not lifted, so their `DIM_RGB` stays as designed.

The color legend is rebuilt with the same lift so the swatches (Region, Specimen) and gradients (Gene, Activity, Stim, Swim) stay visually in sync with what the scatter renders.

## Projection

Projection renders the 3D point cloud as a per-pixel scalar reduction along the current view ray, then recolors the reduced scalar. It is available only for scalar color schemes — **Gene expression**, **Activity**, **Stim correlation**, and **Swim correlation** — because categorical schemes do not have a meaningful scalar to reduce.

The same control appears in two places:

- **Settings → Projection**, with the full set of projection parameters.
- A small **projection:** pill in the 3D viewer's top-left overlay, for quick mode changes without leaving the view. In [embedded mode](#embedded-mode) it moves to the lower left, directly above the colour legend.

Modes:

- **Off** *(default)* — normal 3D point rendering.
- **Min** — lowest scalar along the ray. For signed Stim/Swim views, this highlights negative correlations.
- **Max** — highest scalar along the ray. For signed Stim/Swim views, this highlights positive correlations.
- **Min/Max** — the value that deviates most from neutral wins, preserving its sign; useful for seeing strong positive and negative correlations at once.
- **Mean** — arithmetic mean scalar. In signed Stim/Swim views with weak correlations faded, near-zero samples are down-weighted so they do not dominate the mean.
- **Sum** — exposure-scaled integrated scalar; useful for dense or cumulative signal.

Projection uses the same active color scheme and honors **active brightness**, **fade weak correlations**, **projection threshold**, and, for **Sum**, **sum exposure**. Ghost cells remain visible as context underneath the projection but do not contribute to the scalar reduction.

### Projection threshold

**projection threshold** culls cells whose scheme-aware normalized intensity is below the threshold before the reduction runs. Range `0` – `1`, step `0.01`; default `0.05`.

Lower values include weaker signal; higher values reduce haze/noise. For signed mean/sum projections, the threshold also suppresses near-zero or cancelled projected output.

### Sum exposure

When the mode is **Sum**, **sum exposure** multiplies the accumulated scalar before display clamping. Range `0.05` – `5`, step `0.05`; default `1.0`.

Lower values preserve detail in dense projections; higher values boost faint integrated signal.

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

- **Paper** *(default)* — uses the paper's per-gene spot-count cutoffs (typically 25 spots, adjusted per gene/fish via the Maximum-Deviation approach). Backed by `BinaryGenes_All` from the manifest; individual per-gene thresholds are not exposed in the viewer UI.
- **Global** — applies a single user-set spot-count threshold uniformly across all genes via `geneCounts >= threshold`. The companion **global threshold (spots)** numeric input sets the cutoff; range `1` – `500`, default `25`. Set to `1` for "any detected".

::: warning Subtypes are precomputed
Switching to Global threshold currently only affects the *gene filter* and the *gene-richness coloring*. Molecular subtype membership is precomputed from the paper's thresholds in the manifest, so a Subtype-mode filter doesn't shift when you change the global threshold.
:::

## Stim correlation cutoffs

Anchors for the signed per-cell Pearson r between calcium activity and the stimulus regressor:

- **responsive floor** — the magnitude floor for the stim filter (cells must clear `±stimLo` per the active mode on the [Visual Stimuli card](/filters/stimuli#mode-dropdown)) and the **deadband** boundary for the divergent [Stim correlation color ramp](/filters/colors#stim-correlation).
- **saturation** — magnitude at which the divergent ramp reaches its endpoints. Does not affect the filter.
- **split +/− saturation** — when enabled, exposes separate positive and negative saturation anchors. This is useful because the stimulus-correlation distribution is skewed positive; a single symmetric anchor can make one sign wash out.

Defaults are floor `0.13` and saturation `0.30`. The floor matches the manuscript's full-vector responsive threshold (Methods: "Selecting positively and negatively correlated neurons"); the saturation is near the 99th percentile of the cycle-wide correlation distribution.

In **no filter** mode on the Visual Stimuli card, Stim coloring and projection map continuously from zero rather than using `stimLo` as a gate. Once a sign-band mode is active, `stimLo` becomes both the filter criterion and the neutral deadband.

The sliders constrain the floor to stay below saturation and saturation to stay above the floor; all values are bounded by the valid correlation range (`0` – `1`).

## Swim correlation cutoffs

Two anchors for the signed per-cell correlation between calcium activity and estimated swim power:

- **responsive floor** — magnitude below which a cell is treated as unresponsive (neutral midpoint of the divergent color ramp; rejected by the swim filter unless `swimMode` is `off`).
- **saturation** — magnitude at which the divergent ramp reaches its endpoints.

Defaults are floor `0.10` and saturation `0.35`. The floor matches the manuscript's swim-correlation cutoff (Methods: "Correlation to swimming behavior"; R > 0.1 / R < −0.1 identifies the swim-related subtypes). Lower the floor to be more permissive in either direction.

The sliders constrain the floor to stay below saturation and saturation to stay above the floor; both values are bounded by the valid correlation range (`0` – `1`).

## Fade weak correlations

When **on** *(default)*, the [Stim](/filters/colors#stim-correlation) and [Swim](/filters/colors#swim-correlation) divergent color ramps scale alpha by correlation strength so cells near the neutral midpoint fade into the dark background instead of competing with the colored extremes. A floor at `0.12` keeps midpoint cells faintly visible.

When **off**, every in-set cell renders at full opacity, including the bright midpoint of the divergent ramp, which can dominate visually on a dark background.

In signed Stim/Swim projection modes, the same setting controls the opacity of the projected reduced scalar: weak or cancelled projected correlations use low opacity when the setting is enabled.

## Activity ΔF/F anchors {#activity-f-f-anchors}

Two anchors for the [Activity color scheme](/filters/colors#activity):

- **floor (ΔF/F)** — cells at or below this value map to the dim end of the plasma ramp. Range `-2` up to just below the ceiling; default `0.0`.
- **ceiling (ΔF/F)** — cells at or above this value saturate at the bright end. Range just above the floor up to `5`; default `1.5`.

Tune these to match the practical dynamic range of the dataset's calcium traces.

## Brain models {#brain-models}

Draws mapZebrain's whole-brain reference meshes as translucent anatomical
context around the cells: **Brain outline** (the whole-brain surface),
**Brain fibers** (neuropil) and **Brain cell bodies** (soma-rich
compartments). Each has its own checkbox and opacity slider, and all three are
off by default, so the standard view is unchanged.

The meshes ship separately from the cell data and are fetched only when you
turn one on. They require `python3 scripts/fetch_meshes.py` to have been run —
until then the rows are disabled and say so. See
[Preprocessing → Brain meshes](/preprocess#brain-meshes).

The mesh toggles and their opacities travel in the URL hash, so a shared link
reproduces them.

## Embedded mode {#embedded-mode}

Not a Settings-tab control — it is documented here because it changes what
several of the settings above do. Reworks the whole layout for running the
viewer inside an iframe on
[mapzebrain.org](https://mapzebrain.org), so it reads as part of that
site's own atlas page rather than a bolted-on panel:

- The bottom panel moves to a resizable **left sidebar** with four tabs —
  Filters, t-SNE, Settings, About. 
- The **t-SNE plot** moves to the second tab. Its
  pan/zoom and any lasso persist across a tab switch, so leaving the tab
  and coming back lands you exactly where you left off. While the t-SNE
  tab is hidden, the **t-SNE selection card** on the Filters tab is how
  you see the lasso's cell count and clear it.
- There is **no page header**. The title and cell count move into a strip at
  the top of the sidebar, with **Links** as a hamburger (☰) to their left, and
  the Janelia logo becomes a corner overlay on the 3D view instead of sitting
  in a header bar. **Export** moves further — onto the orientation bar as an
  icon (see below) — since it opens a dialog rather than living in the strip.
  **Links** gains a first entry, **open full viewer**, which
  opens the standalone viewer in a new tab at the current view — it is the
  iframe's URL minus `?embed`, so the hash carries the view across.
- To mimick and integrate with mapZebrain's UI, two **35px collapse rails** 
  are introduced at the left and right viewport edges, replacing the `⌄`/`⌃` 
  bottom-panel handle and the `›`/`‹` detail-panel handle. The left rail 
  toggles the sidebar; the right rail toggles the Detail panel.
- The view-orientation bar (see [3D viewer → Embedded
  mode](/ui/viewer#embedded-mode)) gains a **screenshot** icon, an **export**
  icon, and a **gear** icon after the seven orientation icons, again mimicking
  the mapZebrain UI. The gear opens the sidebar and switches it to the Settings
  tab; the export icon opens the CSV [export](/export) dialog.
- The accent and links colors are updated to use mapZebrain's color scheme.
- The [whole-brain outline mesh](#brain-models) is **on by default**, since
  it is the anatomical context mapZebrain's own 3D view always shows. This
  is a default rather than an override, so a shared link that explicitly
  turns it off still opens with it off.
- **Show ghosts** is **off by default**, matching mapZebrain's own view, which
  shows only the cells you asked for. Also a default rather than an override, so
  a link carrying `show ghosts` on still opens with the ghost haze. The t-SNE
  tab is unaffected — it keeps its own ghost visibility.
- The [3D camera controls](#3d-camera-controls) open on mapZebrain's feel
  rather than warp's: **object-centric rotation off** and **momentum 0**, so
  the view orbits freely with no damped coast and right-drag uses native
  trackball pan. Both are ordinary settings you can turn back on.
- The volume is nudged **up by 7.8% of the viewer height** so the portrait brain
  sits vertically centred in the iframe. The camera targets the volume origin,
  but the brain outline is not centred on it — it runs further caudally (the
  spinal-cord stub) than rostrally, and perspective magnifies that end further
  still — so a view framed symmetrically about the origin rests the tail on the
  bottom edge with a large gap above the snout. Both gaps scale with the
  viewer, which is why the correction is a fraction of the height rather than a
  fixed pixel count. This is a framing offset, not a pan: it
  is kept out of the pan that share links record, so it does not make the
  camera read as moved-from-default, and **reset view** and the orientation
  presets return to it rather than undoing it.

Embedded mode is activated via the `?embed=1` parameter in the URL and it is not persisted in the URL hash.

## Screenshot mode {#screenshot-mode}

A presentation toggle for capturing a clean image of the viewer. When **screenshot mode** is on, the on-canvas chrome that is only useful for interaction is hidden: the panel show/hide tabs that stick out into the 3D view (the `⌄`/`⌃` bottom-panel tab and the `›`/`‹` detail-panel tab), the **reset view** buttons on the 3D viewer and t-SNE panel, the `▾` caret on the **projection** control, and the **Export** and **Links** items in the top bar. The Janelia logo and all data — points, colors, legend, charts — are untouched; this only removes UI affordances, never anything you would want in the figure.

Resizing still works while it is on: the bottom, detail, and t-SNE panels keep their drag handles (the thin strips that highlight on mouse-over), so you can set the exact layout for the shot without leaving screenshot mode. Set the layout first, then toggle on, since the panel show/hide tabs are hidden.

While screenshot mode is on, a **screenshot mode** checkbox also appears at the top of the Settings tab (next to **show descriptions**) as an always-visible escape — unchecking it leaves the mode and restores the hidden chrome. It disappears again once the mode is off.

Off by default. Unlike every other setting, screenshot mode is **not** persisted in the URL hash — it is an ephemeral presentation state, so a shared or reloaded link never lands someone in a chrome-hidden view they cannot easily escape. Turn it off from this same toggle or the top-of-tab checkbox.

## Debug {#debug-overlay}

A developer toggle. When **debug overlay** is on, the 3D viewer renders a small monospace readout in the top-left corner with the rendered frame rate (`fps`) plus the inputs and outputs of the auto / scale-by-filter math: canvas dimensions, total + in-set cell counts, the toggle states, the slider inputs, the `tFilter` lerp parameter, `inSetBoost`, and the resulting `basePointSize`, `effectivePointSize`, and `effectiveGhostIntensity`. Useful for tuning the formulas or sanity-checking the rendered values against expectations.

Off by default; persisted in the URL hash like every other setting.

## What Settings does not control

The Settings tab governs thresholds, palette anchors, point density, projection, rendering style, and 3D camera-control behavior. The following are intentionally excluded:

- the active color scheme (use the [Colors card](/filters/colors)),
- Activity time and playback speed (use the [Colors card's Activity controls](/filters/colors#activity)),
- selections (use [click or lasso](/selections)),
- the current 3D camera pose (position, orientation, orbit target, and pan),
- the t-SNE viewport (pan and zoom),
- [embedded mode](#embedded-mode), which is a deployment mode set only by
  `?embed=1` and has no toggle at all.

These are also stored in the URL hash, but outside the Settings tab.
