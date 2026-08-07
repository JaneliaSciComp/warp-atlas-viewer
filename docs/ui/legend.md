---
title: Color legend
description: The overlay on the 3D viewer that describes the active color scheme.
---

# Color legend

The legend on the 3D viewer adapts to the active **Colors** scheme. It is the authoritative description of what each color denotes at any moment.

It sits in the **top-right** corner, except in [embedded mode](/settings#embedded-mode), where it moves to the **lower left** so it does not cover the right end of mapZebrain's icon bar.

| Active scheme | Legend content |
|---|---|
| **Simple** | No legend is displayed; all visible cells use the same highlight color. |
| **Region** | 17 colored swatches in paper anatomical order (Pal → InfMO → Unassigned), each labeled with its abbreviation. |
| **Gene expression** | A plasma ramp with numeric anchors. With no gene pinned, anchors are gene-richness counts; with one gene, FISH spot counts; with multiple genes, values reflect the **Settings → Multi-gene coloring** selection (max / sum / richness). |
| **Stim correlation** | A signed coolwarm ramp. With an active stimulus sign-band filter it marks `−stimLo`, `0`, and `+stimLo`, then saturates at `stimHi` (or separate `stimHiNeg` / `stimHiPos` when split saturation is on). In `no filter` mode the ramp maps continuously from zero. The title shows the active stim (e.g. *"Stim: motion forward"*) for a single selection, or the representative value used across multiple/all stimuli (*"max \|r\|"*, *"max r+"*, or *"min r−"*). |
| **Swim correlation** | A signed coolwarm ramp annotated with `−swimHi`, `−swimLo`, `0`, `+swimLo`, `+swimHi`. The deadband around 0 is the unresponsive region. |
| **Activity** | A plasma ramp annotated with ΔF/F anchors (floor and ceiling, from Settings). Cells below the floor are dim; cells above the ceiling saturate. |
| **Specimen** | Three swatches, one per source specimen. |

## Plasma ramp

The Gene expression and Activity schemes share a single plasma colormap (dark purple → magenta → orange → yellow). Plasma is perceptually uniform and color-blind safe.

The numeric anchors at each end of the ramp are configurable in [Settings](/settings):

- **Activity:** `floor (ΔF/F)` and `ceiling (ΔF/F)`.
- **Gene expression:** the upper anchor (`max spot count`); the lower anchor is fixed at zero.

Values outside the `[floor, ceiling]` range clamp to the corresponding end of the ramp.

## Divergent ramp

The Stim correlation and Swim correlation schemes use the same coolwarm divergent map (blue → neutral → red) because both underlying values are signed. The midpoint corresponds to the deadband around `r = 0`, allowing positive and negative populations to be told apart by *color hue* rather than only by *magnitude*.

When [Settings → Fade weak correlations](/settings#fade-weak-correlations) is on, alpha is scaled by `|r|` so cells near the midpoint fade into the dark background and the colored extremes stand out. The legend gradient mirrors this: its midpoint is partially transparent, matching what's on screen. Turning the setting off renders both the gradient and the cells at full opacity.

Anchors `±stimLo` / `stimHi` (optionally split into `stimHiNeg` and `stimHiPos`) and `±swimLo` / `±swimHi` are configurable in [Settings](/settings#stim-correlation-cutoffs).

## Categorical palettes

- **Region** uses a 17-color palette ordered anterior → posterior. The default samples the paper-matching `nipy_spectral` legend; the optional `turbo` palette samples Google's smoother Turbo ramp in the same order; the optional `distinct` palette uses high-contrast categorical colors for label separation. *Unassigned* (index 0) renders as a dedicated neutral gray rather than a hue.
- **Specimen** uses a 3-color palette so that the per-specimen split is unambiguous.
