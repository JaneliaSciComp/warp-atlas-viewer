---
title: Selections
description: Click-focus, lasso, the precedence rules between them, and how selections survive filter changes.
---

# Selections

A **selection** is whatever cells you've explicitly picked out — independent of which cells the filters happen to leave visible. There are two kinds:

| Kind | How you make it | What it shows in the Detail panel |
|---|---|---|
| **Focused cell** | Click a cell in the 3D viewer or in the t-SNE. | That one cell. |
| **Lasso group** | Drag in the t-SNE to draw a polygon. | The mean over the lassoed cells. |

There is also an implicit **filter intersection**: the cells currently visible after filters. It feeds the Detail panel as a fallback, but you can't manually "select" the filter intersection — it just is what it is.

## Why selections are separate from filters

Selections **survive filter changes**. You can:

1. Click a cell to focus it.
2. Change filters to a totally different population.
3. Look at the focused cell's Detail (still showing) in the context of the new filter result.

The selection persists until you clear it explicitly. This is intentional — it makes it possible to drill into a specific cell, then swing the filters around to compare its neighborhood without losing the cell itself.

## Click-focus

Click any cell:

- In the **3D viewer** → that cell.
- In the **t-SNE** → same cell.

The Detail panel switches to single-cell mode. The cell renders at a ×1.5 size boost and a bright outline color in both views.

To drop the focus:

- Click empty space in the 3D viewer.
- Or use the **clear-selection** button at the top of the t-SNE panel.

## Lasso from the t-SNE

Drag in the t-SNE to draw a polygon; all cells inside become the selection. The lasso shows up as a dashed outline in t-SNE and lights the same cells up in the 3D viewer.

Lasso behaviors:

- **Lasso while a cell is focused** — the lasso wins; the focused cell is unfocused.
- **Lasso, then click a cell** — the click wins; the lasso is cleared and replaced by single-cell focus.
- **Lasso polygon is part of the URL hash.** A copied link reproduces the polygon.

::: warning Big lassos can overflow the URL
Browsers cap the URL hash at ~2 KB. If your lasso polygon is enormous (e.g. tens of vertices around a complex outline), the app drops the lasso vertices from the hash, logs a warning, and re-encodes the URL without it. The lasso still works locally — you just can't share it. Re-lasso and re-share if the recipient's view comes up empty.
:::

## Precedence

When multiple things could drive the Detail panel, this is the order:

1. **Focused neuron** (click) — always wins.
2. **Lasso polygon** — used if no click-focus.
3. **Filter intersection** — used if nothing is explicitly selected.
4. **Empty** — Detail panel shows a prompt.

To "go up" one level, clear the current selection: click empty space (drops focus), then the clear-selection button (drops lasso).

## Clear selection

Use the small button at the top of the t-SNE panel. It drops the focused cell and the lasso in one click. The filter cards are untouched.

## See also

- [Detail panel](/ui/detail) — what populates with the current selection.
- [Sharing views](/sharing) — what the URL hash stores.
