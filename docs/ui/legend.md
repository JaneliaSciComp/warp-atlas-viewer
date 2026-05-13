---
title: Color legend
description: The overlay in the top-right of the 3D viewer that describes the active color scheme.
---

# Color legend

The legend in the top-right of the 3D viewer adapts to the active **Colors** scheme. It is the authoritative description of what each color denotes at any moment.

| Active scheme | Legend content |
|---|---|
| **Simple** | A single accent-color swatch, indicating that all visible cells are uniformly highlighted. |
| **Region** | 16 colored swatches labeled with region names, plus *Unassigned*. |
| **Gene expression** | A plasma ramp with numeric anchors. With no gene pinned, anchors are gene-richness counts; with one gene, FISH spot counts; with multiple genes, values reflect the **Settings → Multi-gene coloring** selection (max / sum / richness). |
| **Stim correlation** | A plasma ramp annotated with Pearson r anchors. The lower anchor is the responsive floor; the upper is the saturation anchor (both from Settings). |
| **Activity** | A plasma ramp annotated with ΔF/F anchors (floor and ceiling, from Settings). Cells below the floor are dim; cells above the ceiling saturate. |
| **Specimen** | Three swatches, one per source specimen. |

::: tip Empty legend
The legend is empty when no Colors scheme is active. The default is **Region**, so this should not occur in normal use; if it does, refresh — the URL hash may have decoded to an undefined mode.
:::

## Plasma ramp

The Gene expression, Stim correlation, and Activity schemes share a single plasma colormap (dark purple → magenta → orange → yellow). Plasma is perceptually uniform and color-blind safe.

The numeric anchors at each end of the ramp are configurable in [Settings](/settings):

- **Stim correlation:** `responsive floor (r ≥)` and `saturation (r ≥)`.
- **Activity:** `floor (ΔF/F)` and `ceiling (ΔF/F)`.
- **Gene expression:** the upper anchor (`max spot count`); the lower anchor is fixed at zero.

Values outside the `[floor, ceiling]` range clamp to the corresponding end of the ramp.

## Categorical palettes

- **Region** uses a 16-color palette chosen to keep adjacent regions visually distinct.
- **Specimen** uses a 3-color palette so that the per-specimen split is unambiguous.
