---
title: 3D viewer
description: Controls and content of the anatomical view.
---

# 3D viewer

The largest panel on screen. Every visible cell is rendered as a point in [mapZebrain](https://mapzebrain.org) coordinates, with the view oriented so that anterior is at the top of the screen.

## Controls

| Action | Result |
|---|---|
| **Drag** | Orbit the camera around the current orbit target. With default object-centric rotation, that target is the volume center. |
| **Mouse wheel** | Zoom in or out. |
| **Hover a cell** | Tooltip with cell id, anatomical region, and top expressed genes. |
| **Click a cell** | Focus the cell; the [Detail panel](/ui/detail) switches to display only it. |
| **Click empty space** | Clear the focus. |
| **Right-drag** | Pan. By default this shifts the volume in screen space while keeping the orbit target centered; with object-centric rotation off, it uses native trackball pan and moves the orbit target. |
| **projection:** pill | Appears for scalar color schemes; changes the 3D [projection mode](/settings#projection) without opening the Settings tab. |

::: tip Pan / orbit trade-off
The default [Settings → 3D camera controls](/settings#3d-camera-controls) keep rotation object-centric: right-drag moves the volume within the viewport, but rotation still pivots around the volume center. Turn object-centric rotation off when you want trackball-style pan, where right-drag moves the orbit target and later rotations pivot around that new target.

Refresh/share preserves the full camera state (position, orientation, orbit target, and screen-space pan). Use the **reset view** button in the 3D viewer to return to the default pose.
:::

## Contents

- **Anatomy:** the mapZebrain reference frame. The camera starts oriented toward the dorsal surface.
- **Cell count:** approximately 274,455 cells total. The number actually visible depends on the current filter combination; the [visible-cell readout](/filters/overview#visible-cell-readout) in the Filters tab reports it.
- **Specimen mix:** every cell originates from one of 3 specimens, pooled by default. Use **Anatomy → specimen** to restrict to one specimen, or **Colors → Specimen** to paint by source specimen. See [Specimens](/filters/anatomy#specimens).

## Color encoding

The active **Colors** scheme determines per-cell color. See [Colors](/filters/colors) for what each scheme paints, and the [Color legend](/ui/legend) overlay for the exact mapping.

## Rendering notes

- The point cloud is drawn in a single GPU pass, so render cost is largely independent of the filter combination.
- Projection modes add off-screen reduction/compositing passes so deep scalar signal can be seen through the point cloud. They are available for Gene, Activity, Stim, and Swim color schemes.
- Filtered-out cells are drawn dim and transparent rather than skipped, preserving the silhouette of the full brain as context. The amount of dim is controlled by the ghost visibility in [Settings → 3D point density](/settings#3d-point-density).
- Point size and ghost visibility self-tune to the live canvas height in auto mode — shorter views use smaller dots with moderate ghost visibility, while taller views grow dots and peak ghost visibility near typical full-height layouts. Optionally, **scale by filter** can also enlarge active cells (up to 2× their auto size) when the filter narrows to a small group. Both knobs live in [Settings → 3D point density](/settings#3d-point-density); turning auto off exposes the manual sliders.

## See also

- [t-SNE panel](/ui/tsne) — the paired transcriptomic projection.
- [Selections](/selections) — click-focus and lasso behavior.
- [Color legend](/ui/legend) — interpreting the legend overlay.
