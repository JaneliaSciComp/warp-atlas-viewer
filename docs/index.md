---
layout: home

hero:
  name: WARP Atlas Viewer
  text: Whole-brain co-mapping of gene expression and neuronal activity in larval zebrafish
  actions:
    - theme: brand
      text: Quick start
      link: /getting-started
    - theme: alt
      text: Read the paper
      link: https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1
    - theme: alt
      text: Source code
      link: https://github.com/JaneliaSciComp/warp-website

features:
  - title: 3D brain × t-SNE, linked
    details: ~274,000 neurons rendered as a single point cloud, with a t-SNE panel that lasso-selects the same cells in anatomy space.
  - title: Four orthogonal filter cards
    details: Combine transcriptomics × visual-stimulus responsiveness × anatomy with logical AND. A fourth card chooses how visible cells are colored.
  - title: Six color schemes
    details: Simple highlight, anatomical region, gene expression (single or multi-gene), stimulus correlation, scrubbable ΔF/F activity, and source-fish specimen.
  - title: Per-cell detail
    details: Click any cell for its gene bar chart, mean ΔF/F trace with stimulus on-windows shaded, and a per-stimulus correlation chart.
  - title: Shareable URLs
    details: The URL hash mirrors the full app state — filters, settings, camera, t-SNE viewport, lasso polygon, focused neuron. Copy the URL to share the view.
  - title: One-click paper presets
    details: The Help tab includes preset views that reproduce specific findings from Marquez-Legorreta, Fleishman, Hesselink et al. (bioRxiv 2026).
---

## What this documentation covers

This site is the end-user guide for the WARP Atlas Viewer. It explains:

- How to use [each part of the interface](/ui/panels) — the 3D viewer, the t-SNE, the detail panel, and the filter strip.
- What [each filter card](/filters/overview) does, and how the cards combine.
- What [every color scheme](/filters/colors) shows and how to read it.
- How [data flows](/data-flow) through the app — from the raw paper dataset to the dots on screen.
- How to interpret [each visualization](/ui/detail#charts) in the detail panel.
- How to reproduce [specific findings](/findings) from the paper with one click.

If you're brand new, start with **[Quick start](/getting-started)**. If something looks wrong, jump to **[Troubleshooting](/troubleshooting)**.

::: tip Looking for the viewer itself?
The interactive app lives separately from these docs. See the project README in the
[source repo](https://github.com/JaneliaSciComp/warp-website) for instructions on
running the viewer locally or hosting a static bundle.
:::
