---
title: 3D viewer
description: Mouse / touch controls and what's rendered in the anatomical view.
---

# 3D viewer

The largest panel on screen. Every visible cell is rendered as a point in mapzebrain coordinates. The view is rotated so anterior (front of the fish) is at the top of the screen.

## Controls

| Action | Result |
|---|---|
| **Drag** | Orbit the camera around the volume center. |
| **Mouse wheel** | Zoom in / out. |
| **Hover a cell** | Tooltip with cell ID, anatomical region, and the top expressed genes. |
| **Click a cell** | Focus that cell — the [Detail panel](/ui/detail) switches to show only it. |
| **Click empty space** | Drop the focused cell. |
| **Right-drag** *(if pan enabled in Settings)* | Translate the camera. |

::: tip Pan / orbit trade-off
With pan **off** (default), the orbit pivot is locked to the volume's geometric center, so rotation always behaves predictably. With pan **on**, right-drag moves the camera and rotation then pivots around the panned point — useful if you want to focus the rotation on a specific brain region. See [Settings → Camera panning](/settings#camera-panning).
:::

## What you're looking at

- **Anatomy:** the standard zebrafish mapzebrain coordinate frame. Anterior is up, dorsal is into the screen by default (the camera starts looking at the dorsal surface).
- **Cell count:** ~274,455 neurons total. The number actually visible depends on the filter combination — see the cell-count readout in the bottom strip.
- **Specimen mix:** every cell comes from one of 3 source fish. By default all three are pooled. Set **Anatomy → specimen** to isolate one fish, or **Colors → Specimen** to paint by source fish. ([Specimens](/filters/anatomy#specimens))

## What the colors mean

The active **Colors** scheme drives the per-cell color. See the [Colors page](/filters/colors) for what each scheme paints, and the [Color legend](/ui/legend) overlay (top-right corner of the viewer) for the exact mapping.

## Performance notes

- The point cloud is a single Three.js draw call with a custom shader, so the cost is roughly constant regardless of which filter combination you pick.
- Filtered-out cells are drawn dim and transparent rather than skipped, so the brain's silhouette stays visible as context.
- Increase **Settings → point size** if cells look undersized on a high-DPI display.

## See also

- [t-SNE panel](/ui/tsne) — the linked transcriptomic view.
- [Selections](/selections) — how click-to-focus and lasso interact.
- [Color legend](/ui/legend) — interpreting the overlay.
