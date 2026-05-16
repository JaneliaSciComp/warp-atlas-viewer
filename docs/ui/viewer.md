---
title: 3D viewer
description: Controls and content of the anatomical view.
---

# 3D viewer

The largest panel on screen. Every visible cell is rendered as a point in mapzebrain coordinates, with the view oriented so that anterior is at the top of the screen.

## Controls

| Action | Result |
|---|---|
| **Drag** | Orbit the camera around the volume center. |
| **Mouse wheel** | Zoom in or out. |
| **Hover a cell** | Tooltip with cell id, anatomical region, and top expressed genes. |
| **Click a cell** | Focus the cell; the [Detail panel](/ui/detail) switches to display only it. |
| **Click empty space** | Clear the focus. |
| **Right-drag** *(when pan is enabled)* | Translate the camera. |

::: tip Pan / orbit trade-off
With pan **off** (default), the orbit pivot is locked to the volume's geometric center, so rotation is predictable. With pan **on**, right-drag translates the camera and rotation then pivots around the translated point — useful for focusing inspection on a specific region. See [Settings → Camera panning](/settings#camera-panning).
:::

## Contents

- **Anatomy:** the mapzebrain reference frame. The camera starts oriented toward the dorsal surface.
- **Cell count:** approximately 274,455 cells total. The number actually visible depends on the current filter combination; the [visible-cell readout](/filters/overview#visible-cell-readout) in the Filters tab reports it.
- **Specimen mix:** every cell originates from one of 3 specimens, pooled by default. Use **Anatomy → specimen** to restrict to one specimen, or **Colors → Specimen** to paint by source specimen. See [Specimens](/filters/anatomy#specimens).

## Color encoding

The active **Colors** scheme determines per-cell color. See [Colors](/filters/colors) for what each scheme paints, and the [Color legend](/ui/legend) overlay for the exact mapping.

## Rendering notes

- The point cloud is drawn in a single GPU pass, so render cost is largely independent of the filter combination.
- Filtered-out cells are drawn dim and transparent rather than skipped, preserving the silhouette of the full brain as context. The amount of dim is controlled by the ghost slider in [Settings → Point density](/settings#point-density).
- Point size adjusts automatically based on the visible cell count (smaller dots when more cells are visible, larger when filtered down). To pick a size by hand, turn auto off in [Settings → Point density](/settings#point-density).

## See also

- [t-SNE panel](/ui/tsne) — the paired transcriptomic projection.
- [Selections](/selections) — click-focus and lasso behavior.
- [Color legend](/ui/legend) — interpreting the legend overlay.
