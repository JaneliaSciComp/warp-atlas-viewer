---
title: 3D viewer
description: Controls and content of the anatomical view.
---

# 3D viewer

The largest panel on screen. Every visible cell is rendered as a point in [mapZebrain](https://mapzebrain.org) coordinates, with the view oriented so that the brain's long rostro-caudal axis lies across the wide panel — rostral at screen-right, dorsal toward the viewer. ([Embedded mode](#embedded-mode) instead opens portrait, rostral up, matching mapZebrain's own default.)

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

- **Anatomy:** the mapZebrain reference frame. The camera starts oriented toward the dorsal surface, with rostral at screen-right.
- **Brain models:** optional translucent mapZebrain reference meshes (outline, fibers, cell bodies) drawn as anatomical context around the cells. Off by default; see [Settings → Brain models](/settings#brain-models).
- **Cell count:** approximately 274,455 cells total. The number actually visible depends on the current filter combination; the [visible-cell readout](/filters/overview#visible-cell-readout) in the Filters tab reports it.
- **Specimen mix:** every cell originates from one of 3 specimens, pooled by default. Use **Anatomy → specimen** to restrict to one specimen, or **Colors → Specimen** to paint by source specimen. See [Specimens](/filters/anatomy#specimens).

## Embedded mode {#embedded-mode}

Enabled with `?embed=1` on the URL (or the checkbox in [Settings → Brain
models](/settings#brain-models)). It reworks the whole layout for running
the viewer inside an iframe on [mapzebrain.org](https://mapzebrain.org) —
see [Settings → Embedded mode](/settings#embedded-mode) for the sidebar,
rails, and palette changes. In the 3D view specifically, it adds:

- **A nine-icon bar** above the 3D view, using mapZebrain's own artwork:
  the seven view-orientation icons — dorsal, ventral, sagittal vertical
  left/right, sagittal horizontal left/right, and coronal — plus a
  **screenshot** icon and a **gear** icon. Clicking an orientation icon
  snaps the camera to that view and clears any pan. "Vertical" means
  rostral-up; "horizontal" means dorsal-up.

  Each icon keeps its own aspect ratio, as on mapZebrain — the two
  sagittal-vertical tiles are noticeably narrower than the rest.

  The bar needs about **560px of 3D view** to sit clear of the color legend,
  and it is hidden entirely below that rather than shrunk or overlapped. In a
  1280px-wide embed with both the sidebar and the detail panel open the view
  is only ~490px, so the bar — including the screenshot and gear icons — does
  not appear; collapsing either panel with its edge rail brings it back, as
  does a wider iframe. Everything the bar does is also reachable from the
  Settings tab and the **reset view** button.
- **mapZebrain's default orientation** on open: dorsal, brain vertical,
  rostral up — rather than warp's landscape framing. The dorsal icon and the
  **reset view** button both return to it.

### Screenshot icon

Downloads a PNG (`warp-atlas.png`) of the current 3D render. The image
contains **only the 3D render**: the color legend, the icon bar, the
projection pill, and tooltips are DOM overlays drawn on top of the canvas,
not part of the capture. This matches mapZebrain's own screenshot behavior
and is by design, not a bug. [Screenshot mode](/settings#screenshot-mode)
remains the way to set up a clean full-viewport capture — via your OS or
browser's own screenshot tool — that does include the legend and other
on-screen overlays.

The button only appears when the page was loaded with `?embed=1` — which is
the only way to enter embedded mode at all. The 3D canvas's
`preserveDrawingBuffer` option, required for the capture to see anything, is
fixed when the canvas is created, so it has to be decided before the first
frame rather than switched on later.

### Gear icon

Opens the sidebar (if it's collapsed) and switches it to the Settings tab.

The bar, including both icons above, is suppressed in [screenshot
mode](/settings#screenshot-mode).

::: tip Axis convention
In the rendered scene, +x is rostral, ±y are the lateral axes, and +z is
dorsal. That is a 90° rotation of the preprocessed coordinates the CSV
[export](/export) carries, and it is mirrored — so which lateral side is the
animal's left is not something you can read off the axes. The sagittal
presets are matched to mapZebrain's icon artwork instead.
:::

## Color encoding

The active **Colors** scheme determines per-cell color. See [Colors](/filters/colors) for what each scheme paints, and the [Color legend](/ui/legend) overlay for the exact mapping.

## Rendering notes

- The point cloud is drawn in a single GPU pass, so render cost is largely independent of the filter combination.
- Projection modes add off-screen reduction/compositing passes so deep scalar signal can be seen through the point cloud. They are available for Gene, Activity, Stim, and Swim color schemes. Brain models are drawn as context underneath a projection but are excluded from its reduction, so turning a mesh on never changes the projected values.
- Filtered-out cells are drawn dim and transparent rather than skipped, preserving the silhouette of the full brain as context. The amount of dim is controlled by the ghost visibility in [Settings → 3D point density](/settings#3d-point-density).
- Point size and ghost visibility self-tune to the live canvas height in auto mode — shorter views use smaller points with moderate ghost visibility, while taller views grow points and peak ghost visibility near typical full-height layouts. Optionally, **scale by filter** can also enlarge active cells (up to 2× their auto size) when the filter narrows to a small group. Both knobs live in [Settings → 3D point density](/settings#3d-point-density); turning auto off exposes the manual sliders.

## See also

- [t-SNE panel](/ui/tsne) — the paired transcriptomic projection.
- [Selections](/selections) — click-focus and lasso behavior.
- [Color legend](/ui/legend) — interpreting the legend overlay.
