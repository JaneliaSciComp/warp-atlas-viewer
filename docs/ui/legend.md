---
title: Color legend
description: The overlay in the top-right corner of the 3D viewer that explains the active color scheme.
---

# Color legend

The legend in the top-right corner of the 3D viewer adapts to the active **Colors** scheme. It is the authoritative source for what each color means at any moment.

| Active scheme | What the legend shows |
|---|---|
| **Simple** | A single yellow swatch — "everything visible is highlighted." |
| **Region** | 16 colored swatches with region names (plus "Unassigned"). |
| **Gene expression** | A plasma ramp from dark → bright with numeric anchors (spot count). With no gene pinned, the anchors are gene-richness counts; with one gene, they are FISH spot counts; with multiple genes, they reflect the **Settings → Multi-gene coloring** pick (max / sum / richness). |
| **Stim correlation** | A plasma ramp annotated with Pearson r anchors. The lower anchor is the **responsive floor** from Settings; the upper is the **saturation** anchor. |
| **Activity** | A plasma ramp annotated with ΔF/F anchors (floor / ceiling, from Settings). Cells with values below the floor are dim; values above the ceiling saturate. |
| **Specimen** | 3 swatches, one per source fish. |

::: tip If the legend looks empty
It collapses to nothing when no Colors scheme is selected, but the default scheme is **Region**, so this should never happen in normal use. If you see it blank, refresh — the URL hash may have decoded into an undefined mode.
:::

## Plasma ramp, explained

Several schemes share the same continuous **plasma** colormap — dark purple at the low end, bright yellow at the high end, with magenta and orange in between. Plasma is perceptually uniform (equal numeric steps look like equal color steps) and color-blind safe.

The numeric anchors at each end of the ramp are configurable in [Settings](/settings):

- **Stim correlation:** `responsive floor (r ≥)` and `saturation (r ≥)`.
- **Activity:** `floor (ΔF/F)` and `ceiling (ΔF/F)`.
- **Gene expression:** `max spot count` (the ceiling; the floor is fixed at zero).

Cells outside the [floor, ceiling] range clamp to the ramp ends rather than going off-scale.

## Categorical palettes

- **Region** uses a 16-color categorical palette built to keep adjacent regions visually distinct.
- **Specimen** uses a 3-color palette (red / green / blue family) so the source-fish split is unambiguous.

The exact hex values live in `src/utils/colorMaps.ts` if you need to match the docs to a figure.
