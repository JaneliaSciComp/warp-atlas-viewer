# Embedded legend placement, and an always-present t-SNE selection card

**Date:** 2026-08-07
**Status:** approved, ready for implementation planning

## Goal

Three small, independent UI changes:

1. **Embedded mode only:** move the colour legend from the top-right of the 3D
   view to the **lower left**, so it stops covering the right end of the
   orientation bar (the screenshot / export / gear trio).
2. **All modes:** the **t-SNE selection card** in the Filters tab is always
   rendered. Today it appears only while a lasso selection exists, so the
   feature is invisible until you happen to discover it. With nothing selected
   the card body reads `none`.
3. **Embedded mode only:** a **`View t-SNE`** button inside that card, which
   switches the sidebar to the t-SNE tab.

Explicitly **not** in scope:

- Any change to what the legend *contains*, or to any of its six colour-mode
  branches beyond where the box is anchored.
- Any change to the standalone layout. Standalone keeps the top-right legend and
  gets no `View t-SNE` button (its t-SNE plot is always on screen, so there is
  nothing to navigate to).
- Reworking the orientation bar's collapse gate. Moving the legend clears the
  overlap the gate was tuned around, but the gate itself (`canvasSize.w <
  BAR_NATURAL_WIDTH_PX + 16`) is about the row crushing its own icons, which is
  unrelated. It stays.

## 1. Legend position

`ColorLegend` already funnels all six colour-mode branches (region, fish, gene,
activity, swim, stim) through a single `positionStyle` object, so the whole
change is that object becoming mode-aware:

```
STANDALONE                          EMBEDDED (?embed=1)
┌──────────────────────────┐        ┌──────────────────────────┐
│ proj      ⬜⬜⬜ 📷 ⤓ ⚙  ┌──────┐ │ proj      ⬜⬜⬜ 📷 ⤓ ⚙   │
│ reset                    │legend│ │ reset                    │
│                          └──────┘ │                          │
│                                   │                          │
│        3D view                    │        3D view           │
│                                   │ ┌──────┐                 │
│                                   │ │legend│      [janelia]  │
└──────────────────────────┘        │ └──────┘                 │
                                    └──────────────────────────┘
```

The lower left is the only free corner in embedded mode: the top-left already
carries BrainViewer's own overlay stack (projection pill, `reset view`, debug
readout), the top-centre is the orientation bar, and the bottom-right is the
Janelia logo. Nothing occupies the bottom-left in either mode.

**Which flag.** `settings.embeddedMode` (the live value), not `App`'s
module-load `EMBEDDED`. `ColorLegend` already receives `settings`, and this
matches how `BrainViewer` gates the orientation bar itself. The legend is a pure
overlay with no persisted geometry, so unlike the panel grid it can reflow
safely if the mode ever becomes mutable.

**The tall-legend case.** The region legend is 17 rows (~260px). Anchored at the
bottom it grows upward, so in a short viewer it can reach the top edge. It
cannot collide with the orientation bar there: the legend is ~110px wide against
the left edge, while the bar is centred, and at the widths where those would
meet the bar has already collapsed to its top-centre hamburger — which carries
`z-20` specifically to stay above the legend. No new clamp is needed.

### Consequence for the existing smoke test

`tests/smoke/embedded.smoke.ts` currently asserts the *opposite* invariant. At a
~397px viewer it probes the bar's right end and requires the topmost element to
be the legend, not the bar — deliberately, because letting the row tuck under
the legend is what allowed it to survive down to 384px instead of blanking out.

Moving the legend retires that trade-off. The assertion inverts: at that width
the bar's right end must now be the topmost element, i.e. clickable. This is a
test rewrite, not a test deletion — the new form fails against today's code.

## 2. The t-SNE selection card, always present

Two changes, split by which file owns which decision:

- `FilterControls` drops the render gate (`selection.source === 'umap' &&
  selection.indices.length > 0`) and always renders `SelectionCard`. Its `×`
  separator (standalone's horizontal card row) stays unconditional, so the row's
  visual rhythm doesn't change as selections come and go.
- `SelectionCard` owns the empty state: when `selection.indices.length === 0`
  the body reads `none` and the clear button is not rendered — there is nothing
  to clear, and a live-looking no-op button is worse than an absent one.

The card title is unchanged (`t-SNE selection`), so the empty card reads
`T-SNE SELECTION / none`.

**On the dropped `source` check.** `'umap'` is the only value ever passed to
`setIndices` (`App.tsx:386` on lasso restore, `App.tsx:479` on live lasso), so
`source === 'umap'` was already equivalent to `indices.length > 0`. Length alone
decides now; the `source` field itself stays, since it is what `UmapPanel` and
`useEffectiveSelection` read.

## 3. `View t-SNE`

`SelectionCard` takes a new optional `onViewTsne?: () => void`. When supplied it
renders a button as the card's last child — `Card` stacks its children in a
column, so the button lands under the count / clear row without any layout work.
It renders whether or not a selection exists: it is navigation, not an action on
the selection.

`FilterControls` supplies `sidebar ? () => switchTab('tsne') : undefined`, where
`sidebar` is the existing `tsneTab != null` — i.e. exactly embedded mode, from
the flag that already means "this layout has a t-SNE tab". Going through
`switchTab` rather than `onTabChange` directly keeps the per-tab scroll memory
intact.

`App.tsx` is untouched by all three changes.

## Testing

Vitest here runs in the node environment with no jsdom and no
`@testing-library`, so none of this is unit-testable — it is all component
markup and geometry. Playwright carries it:

1. **Legend geometry, both modes, one test.** Embedded: the legend box's left
   edge is within ~24px of the viewer's left edge and its bottom within ~40px of
   the viewer's bottom. Standalone: still top-right. Asserting both halves is
   what keeps this from passing on a blanket move that also changed standalone.
2. **The bar is clear of the legend.** The rewritten probe described above.
   Retains the existing companion assertion that the row genuinely extends into
   the region the legend used to occupy, so the stacking check cannot pass
   vacuously.
3. **The card and the button.** On load, with nothing selected: the empty state
   is visible in both modes; `View t-SNE` exists in embedded and not in
   standalone; clicking it mounts the t-SNE panel (`tsne-canvas`, which in
   embedded mode has count 0 until that tab is active).

For (3) the card's selection readout gets a `data-testid`, since `none` is too
generic a string to locate by text.
