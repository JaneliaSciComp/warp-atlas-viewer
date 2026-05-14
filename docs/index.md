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

features:
  - title: Linked anatomical and transcriptomic views
    details: Approximately 274,000 neurons are rendered as a single point cloud in mapzebrain coordinates, with a paired t-SNE projection in which selections propagate across views.
  - title: Compositional filtering
    details: Transcriptomic, stimulus-response, swim-behavior, and anatomical criteria can be combined with logical AND. A fifth card controls how the resulting cells are colored.
  - title: Seven color encodings
    details: Uniform highlight, anatomical region, gene expression (single- and multi-gene), stimulus correlation, swim correlation (signed, divergent ramp), time-resolved ΔF/F, and source specimen.
  - title: Per-cell inspection
    details: Selecting a cell exposes its gene spot-count profile, mean ΔF/F trace with stimulus on-windows shaded, and per-stimulus correlation.
  - title: Stateful URLs
    details: The URL hash encodes filters, settings, camera, t-SNE viewport, panel visibility, lasso polygon, and focused neuron, allowing views to be reproduced from a link.
  - title: Paper figure presets
    details: The Help tab provides preset views for exploring specific findings from Marquez-Legorreta, Fleishman, Hesselink et al. (bioRxiv 2026).
---

## Scope of this documentation

This site is the end-user guide for the WARP Atlas Viewer. It covers:

- The function of [each panel in the interface](/ui/panels) — the 3D viewer, the t-SNE projection, the detail panel, and the filter strip.
- The behavior of [each filter card](/filters/overview) and how filters compose.
- The semantics of [each color scheme](/filters/colors).
- The [data flow](/data-flow) from the published dataset to the rendered point cloud.
- How to interpret [each visualization](/ui/detail#charts) in the detail panel.
- How to explore [specific findings](/findings) from the paper.

Readers new to the viewer should begin with the [Quick start](/getting-started). For unexpected behavior, see [Troubleshooting](/troubleshooting).
