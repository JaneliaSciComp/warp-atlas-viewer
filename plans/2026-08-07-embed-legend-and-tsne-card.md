# Embedded Legend Placement + Always-Present t-SNE Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) In embedded mode only, anchor the colour legend to the lower left of the 3D view instead of the top right, so it stops covering the orientation bar's screenshot / export / gear icons. (2) In all modes, always render the t-SNE selection card, reading `none` when nothing is selected. (3) In embedded mode only, add a `View t-SNE` button to that card which switches the sidebar to the t-SNE tab.

**Architecture:** All three are local. `ColorLegend` already routes its six colour-mode branches through one `positionStyle` object, so (1) is that object becoming a ternary on `settings.embeddedMode` — every branch follows for free. For (2) and (3) the render gate moves out of `FilterControls` and the empty state moves into `SelectionCard`, which gains one optional callback prop. `App.tsx` is not touched by any task; `FilterControls` already owns both the tab switcher and the embedded-layout flag the button needs.

**Tech Stack:** TypeScript, React 18, Tailwind 3, Vitest (node environment — no jsdom, no `@testing-library`), Playwright (`tests/smoke/`). No new dependencies.

**Spec:** `specs/2026-08-07-embed-legend-and-tsne-card-design.md` — read it before starting.

## Global Constraints

- **Task 1 is embedded-only. Task 3 is embedded-only. Task 2 applies to both modes.** Do not widen any of them. Standalone must keep its top-right legend and must NOT gain a `View t-SNE` button.
- **Vitest runs in the node environment.** There is no jsdom and no `@testing-library`, so do not write a test that renders a component. Everything in this plan is markup or geometry; Playwright is the only harness for it.
- **Do not touch `src/App.tsx`.** If a task seems to need it, stop and report — it means an assumption in the spec is wrong.
- **Do not change the orientation bar's collapse gate** (`MIN_VIEWER_WIDTH_FOR_BAR` in `BrainViewer.tsx:42`, `BAR_NATURAL_WIDTH_PX` in `ViewOrientationBar.tsx:53`). Moving the legend removes the overlap those were tuned around, but the gate exists to stop the row crushing its own icons, which is a separate concern.
- **No new npm dependencies.**
- **Run `npm run check`** (`tsc --noEmit && eslint . && vitest run && vite build`) before every commit. Per `MEMORY.md`, if the untracked `notes/` directory produces lint errors that are not yours, scope eslint to src instead: `npx eslint src`.
- **Run `npm run test:smoke`** before every commit. It boots its own dev server on port 4173.
- Commit after every task.

---

### Task 1: Anchor the legend to the lower left in embedded mode

**Files:**
- Modify: `src/components/ColorLegend.tsx`
- Modify: `tests/smoke/embedded.smoke.ts`

**Interfaces:** No prop or export changes. `ColorLegend` already receives `settings`.

- [ ] **Step 1: Rewrite the stacking assertion that encodes the old invariant**

In `tests/smoke/embedded.smoke.ts`, inside `test('the orientation bar renders at full size or collapses to a menu')`, replace this block (currently around lines 426–447):

```ts
  // ~397px viewer: the row's right end now runs under the colour legend, and
  // stays. This is the band the old `barWidth + 215` gate blanked out, so a
  // regression to it fails here rather than somewhere cosmetic.
  await page.setViewportSize({ width: 1240, height: 800 });
  await expect(bar).toBeVisible();
  await expect(menu).toHaveCount(0);
  const tucked = (await bar.boundingBox())!;
  expect(tucked.width).toBeGreaterThan(363);

  // Tucked BEHIND, not over: at a point inside the row's right end, the topmost
  // element is the legend, not one of the row's buttons. Both halves matter —
  // the overlap assertion keeps the stacking assertion from passing vacuously
  // on a row that never reached the legend at all.
  const legend = page.getByText('Brain region', { exact: true });
  const legendBox = (await legend.boundingBox())!;
  const probe = { x: tucked.x + tucked.width - 6, y: tucked.y + tucked.height / 2 };
  expect(probe.x).toBeGreaterThan(legendBox.x);
  const topmostIsBar = await page.evaluate(
    (p) => !!document.elementFromPoint(p.x, p.y)?.closest('[data-testid="view-orientation-bar"]'),
    probe,
  );
  expect(topmostIsBar).toBe(false);
```

with:

```ts
  // ~397px viewer: the band where the row's right end reaches into the top-right
  // corner the legend used to occupy. This is the band the old `barWidth + 215`
  // gate blanked out, so a regression to it fails here rather than somewhere
  // cosmetic.
  await page.setViewportSize({ width: 1240, height: 800 });
  await expect(bar).toBeVisible();
  await expect(menu).toHaveCount(0);
  const tucked = (await bar.boundingBox())!;
  expect(tucked.width).toBeGreaterThan(363);

  // Nothing covers the row: at a point inside its right end, the topmost element
  // IS one of the row's buttons. The legend used to sit here and win the paint,
  // which is what this test asserted before it moved to the lower left. The
  // overlap assertion below keeps the stacking assertion from passing vacuously
  // on a row that never reached that corner at all.
  const probe = { x: tucked.x + tucked.width - 6, y: tucked.y + tucked.height / 2 };
  const viewerBox = (await page.locator('canvas').first().boundingBox())!;
  expect(probe.x).toBeGreaterThan(viewerBox.x + viewerBox.width - 215);
  const topmostIsBar = await page.evaluate(
    (p) => !!document.elementFromPoint(p.x, p.y)?.closest('[data-testid="view-orientation-bar"]'),
    probe,
  );
  expect(topmostIsBar).toBe(true);
```

The `215` is the legend's old horizontal reach from the viewer's right edge (its `right: 8` anchor plus a region-legend box comfortably under 207px wide); it is the same number the retired gate used. It keeps the check anchored to "the row extends into that corner" rather than to the legend's live position, which is now elsewhere.

- [ ] **Step 2: Add the geometry test covering both modes**

Append a new test to `tests/smoke/embedded.smoke.ts`:

```ts
test('the colour legend sits lower-left embedded and top-right standalone', async ({ page }) => {
  // The legend's own box, not the title text's: `getByText` returns the title
  // div, whose bottom edge is near the TOP of the legend, so a bottom-edge
  // assertion against it would be measuring the wrong rectangle. The parent is
  // the legend root (see ColorLegend's region branch).
  const legendBox = async () =>
    (await page.getByText('Brain region', { exact: true }).locator('..').boundingBox())!;
  // BrainViewer fills the viewer column and the legend is anchored to that same
  // column, so the canvas box is the box the offsets are measured against.
  const viewerBox = async () => (await page.locator('canvas').first().boundingBox())!;

  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  let legend = await legendBox();
  let viewer = await viewerBox();
  // Anchored bottom-8px / left-8px. The tolerances absorb sub-pixel layout and
  // the canvas's own border, not a corner's worth of slack — 24 and 40 are far
  // tighter than the ~200px either offset would show if the anchor were wrong.
  expect(legend.x - viewer.x).toBeLessThan(24);
  expect(viewer.y + viewer.height - (legend.y + legend.height)).toBeLessThan(40);

  // Standalone is untouched: still the top-right corner.
  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  legend = await legendBox();
  viewer = await viewerBox();
  expect(legend.y - viewer.y).toBeLessThan(24);
  expect(viewer.x + viewer.width - (legend.x + legend.width)).toBeLessThan(24);
});
```

- [ ] **Step 3: Confirm both tests fail for the right reason**

Run `npm run test:smoke -- -g "colour legend"` and `npm run test:smoke -- -g "orientation bar"`. Expected: the new geometry test fails on its two *embedded* assertions (the legend is still top-right, so `legend.x - viewer.x` is hundreds of px) while its standalone half passes; the rewritten stacking assertion fails on `topmostIsBar` being `false`. If either fails for any other reason, fix the test before touching `ColorLegend`.

- [ ] **Step 4: Make the legend's anchor mode-aware**

In `src/components/ColorLegend.tsx`, in `ColorLegend` (line ~223), replace:

```ts
  const positionStyle = { top: 8, right: 8 } as const;
```

with:

```ts
  // Embedded mode anchors the legend to the lower left: mapZebrain's own
  // orientation bar sits top-centre and its right end (screenshot / export /
  // gear) ran under a top-right legend. The lower left is the only free corner
  // there — BrainViewer's projection pill and `reset view` own the top left, and
  // the Janelia logo the bottom right. Live `settings.embeddedMode`, not App's
  // module-load EMBEDDED: this is a pure overlay with no persisted geometry, so
  // it can reflow safely, and it matches how BrainViewer gates the bar itself.
  const positionStyle = settings.embeddedMode
    ? ({ bottom: 8, left: 8 } as const)
    : ({ top: 8, right: 8 } as const);
```

Every colour-mode branch already consumes `positionStyle`, so nothing else in the file changes. Do not add a second anchor for any individual branch.

- [ ] **Step 5: Verify and commit**

Both tests from Steps 1–2 pass. Run the full `npm run test:smoke` — the orientation-bar test's other bands (1500 / 1450 / 1150 widths, the hamburger menu, the camera-apply check) must still pass untouched. Then `npm run check`, then commit.

---

### Task 2: Render the t-SNE selection card unconditionally

**Files:**
- Modify: `src/components/filters/SelectionCard.tsx`
- Modify: `src/components/FilterControls.tsx`
- Modify: `tests/smoke/embedded.smoke.ts`

**Interfaces:**
- `SelectionCard`'s props are unchanged in this task (`selection`, `onClear`). Task 3 adds one.
- New test hook: `data-testid="tsne-selection-readout"` on the card's count / `none` text.

- [ ] **Step 1: Write the failing test**

Append to `tests/smoke/embedded.smoke.ts`:

```ts
test('the t-SNE selection card is present with nothing selected, in both modes', async ({
  page,
}) => {
  // The card used to render only while a lasso existed, which made the whole
  // selection feature invisible until you found the lasso by accident. `none` is
  // located by testid, not by text: it is far too generic a string to match on.
  const readout = page.getByTestId('tsne-selection-readout');

  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  await expect(readout).toHaveText('none');
  // Nothing to clear, so no button offering to: a live-looking no-op is worse
  // than an absent control.
  await expect(page.getByRole('button', { name: 'clear selection' })).toHaveCount(0);

  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  await expect(readout).toHaveText('none');
  await expect(page.getByRole('button', { name: 'clear selection' })).toHaveCount(0);
});
```

Run `npm run test:smoke -- -g "t-SNE selection card"`. It must fail on the first `toHaveText` because the card does not render at all.

- [ ] **Step 2: Move the empty state into `SelectionCard`**

Replace the body of `src/components/filters/SelectionCard.tsx` with:

```tsx
import type { SelectionState } from '../../data/types';
import { Card } from './shared';

interface Props {
  selection: SelectionState;
  onClear: () => void;
}

export function SelectionCard({ selection, onClear }: Props) {
  const count = selection.indices.length;
  return (
    <Card title="t-SNE selection">
      <span
        data-testid="tsne-selection-readout"
        className="text-xs font-mono text-neutral-300"
      >
        {count > 0 ? `${count.toLocaleString()} cells` : 'none'}
      </span>
      {count > 0 && (
        <button
          onClick={onClear}
          title="clear t-SNE lasso selection"
          className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-neutral-300 bg-neutral-900/60 border border-neutral-700 rounded hover:bg-neutral-700 hover:text-neutral-100"
        >
          <span aria-hidden className="text-base leading-none">×</span>
          clear selection
        </button>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Drop the render gate in `FilterControls`**

In `src/components/FilterControls.tsx` (around line 166), replace:

```tsx
                {selection.source === 'umap' && selection.indices.length > 0 && (
                  <>
                    {!sidebar && <CrossSep />}
                    <SelectionCard selection={selection} onClear={onClearSelection} />
                  </>
                )}
```

with:

```tsx
                {/* Always rendered, so the selection feature is discoverable
                    before a lasso exists; SelectionCard owns the empty state.
                    The × stays unconditional too, so standalone's card row does
                    not reflow as selections come and go. The dropped
                    `source === 'umap'` check was redundant: 'umap' is the only
                    source setIndices is ever called with. */}
                {!sidebar && <CrossSep />}
                <SelectionCard selection={selection} onClear={onClearSelection} />
```

Then update the `selection` prop's doc comment in the same file (lines ~42–44), which currently claims the card is conditional:

```tsx
  /** Active user selection (t-SNE lasso). A Selection card is always rendered
   *  alongside the filter cards; it reads `none` until a lasso exists, and
   *  grows a button to clear it once one does. */
```

- [ ] **Step 4: Verify and commit**

The new test passes. Then check that a *live* selection still reads correctly rather than only the empty path — with the dev server up, open `/?mock=1`, lasso a region of the t-SNE plot, and confirm the card switches to `N cells` with a working `clear selection` button. Then `npm run check` and the full `npm run test:smoke`, then commit.

---

### Task 3: `View t-SNE` button, embedded only

**Files:**
- Modify: `src/components/filters/SelectionCard.tsx`
- Modify: `src/components/FilterControls.tsx`
- Modify: `tests/smoke/embedded.smoke.ts`

**Interfaces:**
- `SelectionCard` props gain `onViewTsne?: () => void`.

- [ ] **Step 1: Write the failing test**

Append to `tests/smoke/embedded.smoke.ts`:

```ts
test('View t-SNE opens the t-SNE tab, and exists only in embedded mode', async ({ page }) => {
  const viewTsne = page.getByRole('button', { name: 'View t-SNE' });

  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  await expect(viewTsne).toBeVisible();
  // Embedded mounts the t-SNE panel only while its tab is active, so count 0
  // here is what makes the click below a real state change rather than a
  // no-op that would pass either way.
  await expect(page.getByTestId('tsne-canvas')).toHaveCount(0);
  await viewTsne.click();
  await expect(page.getByTestId('tsne-canvas')).toBeVisible();

  // Standalone has no t-SNE tab to navigate to — the plot is always on screen —
  // so the button must not appear there.
  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('tsne-canvas')).toBeVisible();
  await expect(viewTsne).toHaveCount(0);
});
```

Run `npm run test:smoke -- -g "View t-SNE"`. It must fail on the first `toBeVisible`.

- [ ] **Step 2: Add the optional callback to `SelectionCard`**

Add to `Props`:

```tsx
  /** When supplied, a "View t-SNE" button renders as the card's last child.
   *  Only the embedded layout has a t-SNE tab to navigate to; standalone keeps
   *  the plot on screen permanently, so it passes nothing. Independent of
   *  whether a selection exists — this is navigation, not an action on the
   *  selection. */
  onViewTsne?: () => void;
```

Destructure it, and render it after the clear button (inside `Card`, whose children stack in a column, so it lands underneath with no layout work):

```tsx
      {onViewTsne && (
        <button
          onClick={onViewTsne}
          title="show the t-SNE plot"
          className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-neutral-300 bg-neutral-900/60 border border-neutral-700 rounded hover:bg-neutral-700 hover:text-neutral-100"
        >
          View t-SNE
        </button>
      )}
```

- [ ] **Step 3: Wire it in `FilterControls`**

```tsx
                <SelectionCard
                  selection={selection}
                  onClear={onClearSelection}
                  // `sidebar` is `tsneTab != null` — i.e. exactly the layout
                  // that HAS a t-SNE tab, so it is the right flag rather than a
                  // second embedded-mode signal. Via switchTab, not
                  // onTabChange, so per-tab scroll memory is preserved.
                  onViewTsne={sidebar ? () => switchTab('tsne') : undefined}
                />
```

- [ ] **Step 4: Verify and commit**

The new test passes. Run `npm run check` and the full `npm run test:smoke`. Then commit.

---

### Task 4: Docs

Four sentences are made wrong by Tasks 1–3. They are listed exactly; do not restructure anything else, and do not add a new docs page.

**Files:**
- Modify: `docs/ui/legend.md` — the frontmatter `description` (line 3) and the opening sentence (line 8) both say "top-right of the 3D viewer". Note the embedded exception.
- Modify: `docs/selections.md` — line 72 opens "When a t-SNE lasso is active, a **t-SNE selection** card appears…". The card is now always there; it reads `none` until a lasso exists, and the clear button is what appears with one. Mention the embedded-only **View t-SNE** button.
- Modify: `docs/ui/tsne.md` — line 28's parenthetical, "(The filter row also shows a **t-SNE selection** card with its own clear button while a lasso is active.)", carries the same stale condition.

- [ ] **Step 1: Update those sentences**

Also `grep -rn "legend" docs/ui/viewer.md docs/ui/panels.md` and fix any other claim about the legend's corner. `docs/settings.md:138` and `docs/settings.md:320` mention the legend but not its position — leave both alone.

- [ ] **Step 2: Verify and commit**

`npm run docs:build`, then commit.
