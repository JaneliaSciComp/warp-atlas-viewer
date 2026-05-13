---
title: Selections
description: Click-focus, lasso, the precedence rules between them, and how selections survive filter changes.
---

# Selections

A **selection** is a set of cells the user has explicitly designated, independent of which cells the filters happen to leave visible. Two types are supported:

| Type | Mechanism | Detail-panel content |
|---|---|---|
| **Focused cell** | Click a cell in the 3D viewer or in the t-SNE. | That one cell. |
| **Lasso group** | Drag in the t-SNE to define a polygon. | The mean across the enclosed cells. |

There is also an implicit **filter intersection**: the cells currently visible after filtering. It populates the Detail panel as a fallback but cannot be selected directly.

## Selections are independent of filters

A selection persists through filter changes:

1. A cell is focused.
2. Filters are changed to a different population.
3. The focused cell's detail remains visible in the context of the new filter result.

This is intentional: it permits inspection of a specific cell while changing the surrounding population, without losing the cell itself.

## Click-focus

Click any cell:

- in the **3D viewer** to focus it,
- in the **t-SNE** to focus the same cell.

The Detail panel switches to single-cell mode, and the focused cell is rendered at 1.5× size with an outline color in both views.

To clear the focus:

- click empty space in the 3D viewer, or
- use the **clear-selection** button at the top of the t-SNE panel.

## Lasso in the t-SNE

Dragging in the t-SNE defines a polygon; all enclosed cells become the selection. The lasso is shown as a dashed outline in the t-SNE and the corresponding cells are highlighted in the 3D viewer.

Lasso behavior:

- A lasso drawn while a cell is focused replaces the focus.
- Clicking a cell after a lasso replaces the lasso with single-cell focus.
- The lasso polygon is included in the URL hash, so a shared link reproduces it.

::: warning Large lassos may exceed the URL hash limit
Browsers cap the URL hash at approximately 2 KB. If a lasso polygon contains many vertices, the application drops the lasso vertices from the hash, logs a warning, and re-encodes the URL without them. The lasso continues to function locally, but cannot be shared. Redraw the lasso with fewer vertices to share again.
:::

## Precedence

When multiple sources could drive the Detail panel, the following order applies:

1. **Focused cell** (click) — always takes precedence.
2. **Lasso polygon** — used in the absence of a click-focus.
3. **Filter intersection** — used when nothing is explicitly selected.
4. **Empty** — the Detail panel shows a prompt.

To "step back" one level, clear the current selection: clicking empty space drops the focus, and the clear-selection button drops the lasso.

## Clearing the selection

The clear-selection button at the top of the t-SNE panel removes both the focused cell and the lasso in one action. Filter cards are unaffected.

## See also

- [Detail panel](/ui/detail) — what populates with the current selection.
- [Sharing views](/sharing) — what the URL hash encodes.
