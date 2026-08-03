# Embedded Left Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In embedded mode (`?embed=1`) only, move the bottom panel to a resizable left sidebar, make the t-SNE plot a fourth tab right of Filters, fold the header into the sidebar, and adopt mapZebrain's edge collapse rails, screenshot/gear icons, and accent palette.

**Architecture:** `usePanelLayout` gains a fourth resizable panel and an embedded-aware grid template, both behind newly-extracted pure functions so the error-prone parts get unit tests. `App` grows a second JSX layout branch that composes the *same* element variables as the standalone branch — no component is duplicated. `FilterControls` takes the t-SNE panel as an opaque `ReactNode` prop, so App keeps owning `UmapPanel` and none of its ten props are drilled. The palette swap goes through two Tailwind color aliases backed by CSS variables, so 15 call sites change mechanically and nothing needs an `embedded` prop.

**Tech Stack:** TypeScript, React 18, Tailwind 3, Three.js via `@react-three/fiber`, Vitest (node environment — pure functions only, no DOM harness), Playwright (`tests/smoke/`). No new dependencies.

**Spec:** `specs/2026-08-03-embedded-left-sidebar-design.md` — read it before starting. Two decisions in it were superseded during planning; both are noted in the spec and in Tasks 7 and 8 below.

## Global Constraints

- **Every change is scoped to embedded mode.** With `?embed=1` absent, the rendered output must be identical to `main`. That includes the header, both panel toggle handles, the bottom row, the t-SNE column, and every accent colour. Task 8's palette work must resolve to today's exact `yellow-300` in standalone mode.
- **No new npm dependencies.**
- **`embeddedMode` is never written to the URL hash.** Existing behaviour (`useUrlSync.ts:151-153`); do not disturb it.
- **Vitest runs in the node environment** — there is no jsdom and no `@testing-library`. Do not write a test that renders a component or a hook. Extract a pure function and test that instead.
- **New URL hash keys:** `sidebarWidth` (number, clamp `280`–`700`) and `sidebarOpen` (boolean). Both default-dropped from the hash.
- **Rail width is `35px`** and sidebar default width is `360px`. mapZebrain's own values, for reference: side menu `440px`, rail `35px`, panel `#111`, active-tab ink bar `#ff1493`, canvas clear `#000000`.
- **Run `npm run check`** (`tsc --noEmit && eslint . && vitest run && vite build`) before every commit. Per `MEMORY.md`, if the untracked `notes/` directory produces lint errors that are not yours, scope eslint to `src`: `npx eslint src`.
- **Run `npm run test:smoke`** before every commit from Task 4 onward.
- Commit after every task.

---

### Task 1: Sidebar layout state in `usePanelLayout`

The sidebar needs an open flag, a persisted width, drag bounds, and a resize handler trio. Two parts of this are genuinely error-prone and get extracted as pure functions so they can be unit-tested in the node environment: the drag delta sign (the sidebar's strip is on its **right** edge, the opposite of the detail panel's) and the five-track grid template.

**Files:**
- Modify: `src/hooks/usePanelLayout.ts`
- Create: `src/hooks/usePanelLayout.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SIDEBAR_WIDTH_DEFAULT = 360`, `RAIL_WIDTH = 35` — exported consts.
  - `nextSidebarWidth(startWidth: number, dx: number): number`
  - `outerGridTemplate(o: { embedded: boolean; sidebarOpen: boolean; sidebarWidth: number; detailOpen: boolean; detailWidth: number }): string`
  - `PanelLayoutInitial` gains `sidebarOpen?: boolean`, `sidebarWidth?: number`.
  - `usePanelLayout(initial: PanelLayoutInitial, embedded: boolean): PanelLayout` — note the **new second parameter**.
  - `PanelLayout` gains `sidebarOpen: boolean`, `setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>`, `sidebarWidth: number`, `onSidebarResizeDown/Move/Up: (e: React.PointerEvent<HTMLDivElement>) => void`, `onSidebarResizeDoubleClick: () => void`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/usePanelLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  RAIL_WIDTH,
  SIDEBAR_WIDTH_DEFAULT,
  nextSidebarWidth,
  outerGridTemplate,
} from './usePanelLayout';

describe('nextSidebarWidth', () => {
  // The resize strip sits on the sidebar's RIGHT edge, so dragging right
  // grows it. The detail panel's strip is on its LEFT edge and negates the
  // delta; copying that sign here would make the sidebar shrink when dragged
  // outward. This is the assertion that catches it.
  it('grows when dragged right and shrinks when dragged left', () => {
    expect(nextSidebarWidth(400, 50)).toBe(450);
    expect(nextSidebarWidth(400, -50)).toBe(350);
  });

  it('clamps to the drag bounds', () => {
    expect(nextSidebarWidth(300, -1000)).toBe(280);
    expect(nextSidebarWidth(600, 1000)).toBe(700);
  });

  it('is a no-op for a zero delta', () => {
    expect(nextSidebarWidth(SIDEBAR_WIDTH_DEFAULT, 0)).toBe(SIDEBAR_WIDTH_DEFAULT);
  });
});

describe('outerGridTemplate', () => {
  // Standalone must be byte-identical to what App produced before this
  // change, or every non-embedded layout shifts.
  it('reproduces the standalone templates exactly', () => {
    expect(
      outerGridTemplate({
        embedded: false,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: true,
        detailWidth: 360,
      }),
    ).toBe('minmax(0, 1fr) 360px');
    expect(
      outerGridTemplate({
        embedded: false,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: false,
        detailWidth: 360,
      }),
    ).toBe('minmax(0, 1fr)');
  });

  it('builds five tracks in embedded mode with both panels open', () => {
    expect(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: true,
        detailWidth: 400,
      }),
    ).toBe('35px 360px minmax(0, 1fr) 400px 35px');
  });

  it('drops a collapsed panel track but keeps both rails', () => {
    expect(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: false,
        sidebarWidth: 360,
        detailOpen: true,
        detailWidth: 400,
      }),
    ).toBe('35px minmax(0, 1fr) 400px 35px');
    expect(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: false,
        detailWidth: 400,
      }),
    ).toBe('35px 360px minmax(0, 1fr) 35px');
    expect(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: false,
        sidebarWidth: 360,
        detailOpen: false,
        detailWidth: 400,
      }),
    ).toBe('35px minmax(0, 1fr) 35px');
  });

  it('uses mapZebrain’s 35px rail width', () => {
    expect(RAIL_WIDTH).toBe(35);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/usePanelLayout.test.ts`
Expected: FAIL — `No "RAIL_WIDTH" export is defined on the module` (or an equivalent missing-export error).

- [ ] **Step 3: Add the constants and the two pure functions**

In `src/hooks/usePanelLayout.ts`, after the existing `UMAP_WIDTH_MAX` declaration (line 20), add:

```ts
// Left sidebar (embedded mode only) — the bottom panel relocated to the side.
// 360 rather than mapZebrain's own 440 because embedded mode also shows the
// detail panel: at a 1280px iframe, 440 would leave only 410px for the 3D view.
// mapZebrain's width is one drag away for anyone who wants it.
export const SIDEBAR_WIDTH_DEFAULT = 360;
const SIDEBAR_WIDTH_MIN = 280;
const SIDEBAR_WIDTH_MAX = 700;
// Width of the edge collapse rails, matching mapZebrain's `.side-menu-btn`
// (assets/css/sideMenu.css:36).
export const RAIL_WIDTH = 35;

/**
 * Next sidebar width for a drag that began at `startWidth` and has moved `dx`
 * CSS pixels horizontally.
 *
 * The sign matters: the sidebar's resize strip is on its RIGHT edge, so
 * dragging right (positive dx) grows it. The detail panel's strip is on its
 * LEFT edge and therefore negates its delta — do not copy that here.
 */
export function nextSidebarWidth(startWidth: number, dx: number): number {
  return Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, startWidth + dx));
}

/**
 * Inline `grid-template-columns` for the outer app grid.
 *
 * Standalone is the original two-track layout, unchanged. Embedded is five
 * tracks — rail, sidebar, viewer, detail, rail — with a collapsed panel
 * dropping its track entirely (the element is not rendered either, so grid
 * auto-placement still lines up). The rails are always present so there is
 * always something to click.
 */
export function outerGridTemplate({
  embedded,
  sidebarOpen,
  sidebarWidth,
  detailOpen,
  detailWidth,
}: {
  embedded: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
  detailOpen: boolean;
  detailWidth: number;
}): string {
  if (!embedded) {
    return detailOpen ? `minmax(0, 1fr) ${detailWidth}px` : 'minmax(0, 1fr)';
  }
  const tracks = [`${RAIL_WIDTH}px`];
  if (sidebarOpen) tracks.push(`${sidebarWidth}px`);
  tracks.push('minmax(0, 1fr)');
  if (detailOpen) tracks.push(`${detailWidth}px`);
  tracks.push(`${RAIL_WIDTH}px`);
  return tracks.join(' ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/usePanelLayout.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Wire the state and handlers into the hook**

In `src/hooks/usePanelLayout.ts`:

Add to `PanelLayoutInitial`:

```ts
  sidebarOpen?: boolean;
  sidebarWidth?: number;
```

Add to the `PanelLayout` interface:

```ts
  /** Left-sidebar open state (embedded mode only). */
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Persisted left-sidebar width (embedded mode only). */
  sidebarWidth: number;
  onSidebarResizeDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSidebarResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSidebarResizeUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSidebarResizeDoubleClick: () => void;
```

Change the signature (line 71) to take `embedded`:

```ts
export function usePanelLayout(
  initial: PanelLayoutInitial = {},
  embedded = false,
): PanelLayout {
```

Add the state next to the existing `useState` calls:

```ts
  const [sidebarOpen, setSidebarOpen] = useState(initial.sidebarOpen ?? true);
  const [sidebarWidth, setSidebarWidth] = useState(
    initial.sidebarWidth ?? SIDEBAR_WIDTH_DEFAULT,
  );
```

Replace the `outerLayout` memo (lines 121-128) with a call to the pure function:

```ts
  const outerLayout = useMemo(
    () => ({
      gridTemplateColumns: outerGridTemplate({
        embedded,
        sidebarOpen,
        sidebarWidth,
        detailOpen,
        detailWidth,
      }),
    }),
    [embedded, sidebarOpen, sidebarWidth, detailOpen, detailWidth],
  );
```

Add the handler trio after the existing t-SNE handlers (after line 211):

```ts
  // Sidebar resize: a strip on the sidebar's RIGHT edge. Same
  // setPointerCapture pattern as the other two, but the delta is NOT
  // negated — dragging right grows the sidebar. See nextSidebarWidth.
  const sidebarDragRef = useRef<{ x: number; w: number } | null>(null);
  const onSidebarResizeDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    sidebarDragRef.current = { x: e.clientX, w: sidebarWidth };
    e.preventDefault();
  }, [sidebarWidth]);
  const onSidebarResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = sidebarDragRef.current;
    if (!d) return;
    setSidebarWidth(nextSidebarWidth(d.w, e.clientX - d.x));
  }, []);
  const onSidebarResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    sidebarDragRef.current = null;
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);
```

Add the double-click handler next to the existing three (after line 218):

```ts
  const onSidebarResizeDoubleClick = useCallback(
    () => setSidebarWidth(SIDEBAR_WIDTH_DEFAULT),
    [],
  );
```

Add all seven new names to the returned object.

- [ ] **Step 6: Verify the whole suite and the type-check pass**

Run: `npm run check`
Expected: PASS. `App.tsx` still compiles because `embedded` has a default of `false` and the new `PanelLayout` fields are additive — App does not have to destructure them yet.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/usePanelLayout.ts src/hooks/usePanelLayout.test.ts
git commit -m "Add sidebar layout state and the embedded grid template"
```

---

### Task 2: Persist the sidebar in the URL hash

Every other panel size rides in the hash (`bottomHeight`, `detailWidth`, `umapWidth`, all default-dropped). The sidebar must too, or a resized embedded view is unshareable — which reads as a bug given the surrounding behaviour.

While in `useUrlSync`, fix an adjacent pre-existing bug: `umapWidth` is **missing** from the schedule-on-change effect's dependency array (`useUrlSync.ts:238-248`), so dragging the t-SNE panel width never schedules a URL write. It only lands if some other state change or a `pagehide` flush happens to follow. Same file, same mechanism, one line — fixing it here is cheaper than filing it.

**Files:**
- Modify: `src/utils/urlState.ts:70-100` (the `PersistedState` interface) and `:420-434` (`validatePersisted`)
- Modify: `src/hooks/useUrlSync.ts` — `UrlSyncState`, `UrlSyncConfig`, the destructure, the snapshot refs, `writeUrlNow`'s `baseFields`, and the effect deps
- Modify: `src/App.tsx` — pass the new values through to `usePanelLayout` and `useUrlSync`
- Test: `src/utils/urlState.test.ts`

**Interfaces:**
- Consumes: `SIDEBAR_WIDTH_DEFAULT` from Task 1.
- Produces:
  - `PersistedState` gains `sidebarOpen?: boolean`, `sidebarWidth?: number`.
  - `UrlSyncState` gains `sidebarOpen: boolean`, `sidebarWidth: number`.
  - `UrlSyncConfig` gains `sidebarWidthDefault: number`.
  - `UrlSyncHandlers` gains `umapViewportRef: React.MutableRefObject<UmapViewport | null>` — Task 6 reads it to reseed the t-SNE viewport after a tab switch.

- [ ] **Step 1: Write the failing tests**

Add to `src/utils/urlState.test.ts`. Match the existing file's import style; `encodeHash` / `decodeHash` are already imported there.

```ts
describe('sidebar layout persistence', () => {
  it('round-trips sidebarWidth and sidebarOpen', () => {
    const out = decodeHash(encodeHash({ sidebarWidth: 480, sidebarOpen: false }));
    expect(out?.sidebarWidth).toBe(480);
    expect(out?.sidebarOpen).toBe(false);
  });

  it('clamps a hostile sidebarWidth to the drag bounds', () => {
    expect(decodeHash(encodeHash({ sidebarWidth: 5 }))?.sidebarWidth).toBe(280);
    expect(decodeHash(encodeHash({ sidebarWidth: 99999 }))?.sidebarWidth).toBe(700);
  });

  it('drops a non-numeric sidebarWidth', () => {
    // Hand-edited hash: the field is present but unusable, so it must be
    // absent from the decoded state rather than poisoning the layout.
    const hash = '#!' + encodeURIComponent(JSON.stringify({ sidebarWidth: 'wide' }));
    expect(decodeHash(hash)?.sidebarWidth).toBeUndefined();
  });

  it('drops a non-boolean sidebarOpen', () => {
    const hash = '#!' + encodeURIComponent(JSON.stringify({ sidebarOpen: 'yes' }));
    expect(decodeHash(hash)?.sidebarOpen).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/urlState.test.ts`
Expected: FAIL — `expected undefined to be 480` on the round-trip test.

- [ ] **Step 3: Add the two keys to `urlState.ts`**

In the `PersistedState` interface, after `umapWidth` (line 86):

```ts
  /** Left-sidebar open state (embedded mode only). Same persistence
   *  reasoning as `bottom`. */
  sidebarOpen?: boolean;
  /** Width of the embedded-mode left sidebar in pixels. Same persistence
   *  reasoning as detailWidth. */
  sidebarWidth?: number;
```

In `validatePersisted`, after the `umapWidth` block (line 433):

```ts
  if (typeof raw.sidebarOpen === 'boolean') out.sidebarOpen = raw.sidebarOpen;
  // Matches the SIDEBAR_WIDTH_MIN/MAX drag bounds in usePanelLayout. The
  // bounds are duplicated as literals here exactly as the three above are:
  // urlState must stay a pure, DOM-free module, so it does not import from
  // the layout hook.
  if (isFiniteNum(raw.sidebarWidth)) {
    out.sidebarWidth = clamp(raw.sidebarWidth, 280, 700);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/urlState.test.ts`
Expected: PASS — all 4 new tests plus the existing suite.

- [ ] **Step 5: Thread the values through `useUrlSync`**

In `src/hooks/useUrlSync.ts`:

Add to `UrlSyncState` (after `umapWidth`):

```ts
  sidebarOpen: boolean;
  sidebarWidth: number;
```

Add to `UrlSyncConfig` (after `umapWidthDefault`):

```ts
  sidebarWidthDefault: number;
```

Add to `UrlSyncHandlers`:

```ts
  /** Live t-SNE viewport. Exposed so a caller that unmounts and remounts
   *  UmapPanel (the embedded-mode t-SNE tab) can reseed it from the current
   *  viewport rather than the module-load URL value. */
  umapViewportRef: React.MutableRefObject<UmapViewport | null>;
```

Add both names to the destructure of `state`, then add snapshot refs beside the existing ones:

```ts
  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
```

In `writeUrlNow`, extend the config destructure and `baseFields`:

```ts
    const {
      defaultFilter,
      bottomHeightDefault,
      detailWidthDefault,
      umapWidthDefault,
      sidebarWidthDefault,
    } = configRef.current;
```

```ts
      sidebarOpen: sidebarOpenRef.current ? undefined : false,
      sidebarWidth:
        sidebarWidthRef.current !== sidebarWidthDefault
          ? Math.round(sidebarWidthRef.current)
          : undefined,
```

Add the new values to the schedule-on-change effect's deps, **and add the missing `umapWidth`**:

```ts
  }, [
    filter,
    settings,
    focusedNeuron,
    detailOpen,
    bottomOpen,
    bottomHeight,
    detailWidth,
    // umapWidth was missing here: dragging the t-SNE width changed state but
    // never scheduled a write, so it only reached the URL if some later
    // change or a pagehide flush happened to follow.
    umapWidth,
    sidebarOpen,
    sidebarWidth,
    lassoPoly,
    activitySpeed,
    scheduleUrlWrite,
  ]);
```

Return `umapViewportRef: umapRef` from the hook alongside the two handlers.

- [ ] **Step 6: Wire App up**

In `src/App.tsx`, import `SIDEBAR_WIDTH_DEFAULT` from `./hooks/usePanelLayout`, destructure `sidebarOpen` and `sidebarWidth` from `usePanelLayout`, and pass the restored values in:

```tsx
  } = usePanelLayout(
    {
      detailOpen: INITIAL_URL_STATE?.detail,
      bottomOpen: INITIAL_URL_STATE?.bottom,
      bottomHeight: INITIAL_URL_STATE?.bottomHeight,
      detailWidth: INITIAL_URL_STATE?.detailWidth,
      umapWidth: INITIAL_URL_STATE?.umapWidth,
      sidebarOpen: INITIAL_URL_STATE?.sidebarOpen,
      sidebarWidth: INITIAL_URL_STATE?.sidebarWidth,
    });
```

**Do not pass `usePanelLayout` a second argument yet, and do not add an `EMBEDDED` const.** Both belong to Task 4. Passing the real flag here would flip `outerGridTemplate` to five tracks while App's outer grid still has only two auto-placed children — CSS would seat the 3D viewer in the 35px rail track and the detail panel in the sidebar track, so `?embed=1` would render visibly broken until Task 4 landed. Leaving `embedded` at its `false` default keeps two tracks and two children, which is correct. Persistence still works and stays fully testable: `useUrlSync` reads the width from the hook's return regardless of the flag.

For the same reason, destructure only `sidebarOpen` and `sidebarWidth` — the setter and the resize handlers have no consumer until Task 4 and an unused binding would trip eslint's `no-unused-vars`. Do **not** destructure `umapViewportRef` either; Task 6 adds it when it has a consumer.

In the `useUrlSync` call, add `sidebarOpen` and `sidebarWidth` to the state object and `sidebarWidthDefault: SIDEBAR_WIDTH_DEFAULT` to the config object.

- [ ] **Step 7: Verify**

Run: `npm run check`
Expected: PASS.

Then verify the standalone hash is unchanged in the browser: `npm run dev`, open `/?mock=1`, drag the detail panel, and confirm the hash carries `detailWidth` and **no** `sidebarWidth` / `sidebarOpen` (both are at their defaults, so they must be dropped).

- [ ] **Step 8: Commit**

```bash
git add src/utils/urlState.ts src/utils/urlState.test.ts src/hooks/useUrlSync.ts src/App.tsx
git commit -m "Persist the sidebar width and open state in the URL hash

Also adds the missing umapWidth dependency to the schedule-on-change
effect, which meant a t-SNE width drag never scheduled a URL write."
```

---

### Task 3: `FilterControls` takes a t-SNE tab and a controlled tab

Two changes: the active tab becomes a controlled prop (App needs it so the gear icon in the 3D view can select Settings), and an optional `tsneTab` node adds a fourth tab. The filter cards also stack in a single column in sidebar layout — the current `flex-wrap` row is tuned for a wide, short panel.

**Files:**
- Modify: `src/components/FilterControls.tsx`
- Modify: `src/App.tsx` (own the tab state, pass it down)
- Test: `src/components/FilterControls.test.ts` (new — pure helper only)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type Tab = 'filters' | 'tsne' | 'settings' | 'about'`
  - `export function tabsFor(hasTsne: boolean): Array<{ id: Tab; label: string }>`
  - `FilterControls` props gain `tab: Tab`, `onTabChange: (t: Tab) => void`, `tsneTab?: ReactNode`.

- [ ] **Step 1: Write the failing test**

Create `src/components/FilterControls.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tabsFor } from './FilterControls';

describe('tabsFor', () => {
  it('is the original three tabs when there is no t-SNE node', () => {
    expect(tabsFor(false).map((t) => t.id)).toEqual(['filters', 'settings', 'about']);
  });

  it('inserts t-SNE immediately right of Filters', () => {
    expect(tabsFor(true).map((t) => t.id)).toEqual([
      'filters',
      'tsne',
      'settings',
      'about',
    ]);
  });

  it('labels the t-SNE tab the same way the panel header does', () => {
    expect(tabsFor(true)[1].label).toBe('t-SNE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/FilterControls.test.ts`
Expected: FAIL — `No "tabsFor" export is defined on the module`.

- [ ] **Step 3: Replace the tab table with the helper**

In `src/components/FilterControls.tsx`, replace lines 45-50:

```ts
export type Tab = 'filters' | 'tsne' | 'settings' | 'about';

/** Tab table for the panel. The t-SNE tab exists only when the caller
 *  supplies a node for it (embedded mode), and sits immediately right of
 *  Filters — the two are used together, so they belong adjacent. */
export function tabsFor(hasTsne: boolean): Array<{ id: Tab; label: string }> {
  return [
    { id: 'filters' as Tab, label: 'Filters' },
    ...(hasTsne ? [{ id: 'tsne' as Tab, label: 't-SNE' }] : []),
    { id: 'settings' as Tab, label: 'Settings' },
    { id: 'about' as Tab, label: 'About' },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/FilterControls.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Make the tab controlled and render the t-SNE body**

Add to the `Props` interface in `src/components/FilterControls.tsx`:

```ts
  /** Active tab. Lifted to App so the 3D view's gear icon can select the
   *  Settings tab. */
  tab: Tab;
  onTabChange: (t: Tab) => void;
  /** When provided, a t-SNE tab is rendered second (right of Filters) with
   *  this node as its body, and the filter cards stack in a single column
   *  for a narrow sidebar.
   *
   *  ponytail: the presence of this prop *is* the sidebar-layout flag. A
   *  separate `layout` prop would be a second source of truth for the same
   *  fact. Split them if a narrow layout ever needs to exist without the
   *  t-SNE tab. */
  tsneTab?: ReactNode;
```

Replace the React import. `useState` held the tab and nothing else in this file, so it goes:

```ts
import { useLayoutEffect, useRef, type ReactNode } from 'react';
```

Replace the component's state and tab-switch logic:

```tsx
export function FilterControls({ data, filter, setFilter, settings, setSettings, uniqueFishIds, onReset, visibleCount, applyView, activityPlaying, setActivityPlaying, activitySpeed, setActivitySpeed, selection, onClearSelection, tab, onTabChange, tsneTab }: Props) {
  const update = (patch: Partial<FilterState>) => setFilter({ ...filter, ...patch });
  const sidebar = tsneTab != null;
  const tabs = tabsFor(sidebar);

  // Per-tab scroll memory — see the original comment; unchanged except that
  // the map is now keyed by every Tab, including 'tsne' (which never
  // scrolls, but a partial Record would not type-check).
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollByTab = useRef<Record<Tab, number>>({
    filters: 0,
    tsne: 0,
    settings: 0,
    about: 0,
  });
  const switchTab = (next: Tab) => {
    if (next === tab) return;
    if (scrollRef.current) {
      scrollByTab.current[tab] = scrollRef.current.scrollTop;
    }
    onTabChange(next);
  };
```

Change the `TABS.map(...)` to `tabs.map(...)`.

The t-SNE body must **not** live inside the padded scroll container: `UmapPanel` is `w-full h-full` and sizes its canvas from `getBoundingClientRect` (`UmapPanel.tsx:78-79`, `341-344`), so padding and `overflow-y-auto` would make it measure wrong. Render it as a sibling. Replace the single body div with:

```tsx
      {tab === 'tsne' ? (
        <div className="flex-1 min-h-0 min-w-0">{tsneTab}</div>
      ) : (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3">
          {tab === 'filters' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <ResetButton onReset={onReset} />
                <span className="text-xs font-mono text-neutral-400">
                  {visibleCount.toLocaleString()} cells visible
                </span>
              </div>
              <div
                className={
                  sidebar
                    ? 'flex flex-col gap-2'
                    : 'flex flex-wrap items-stretch gap-x-2 gap-y-2'
                }
              >
                <ColorsCard
                  data={data}
                  filter={filter}
                  update={update}
                  activityPlaying={activityPlaying}
                  setActivityPlaying={setActivityPlaying}
                  activitySpeed={activitySpeed}
                  setActivitySpeed={setActivitySpeed}
                />
                {!sidebar && <CrossSep />}
                <TranscriptomicsCard data={data} filter={filter} update={update} />
                {!sidebar && <CrossSep />}
                <ActivityCard data={data} filter={filter} update={update} />
                {!sidebar && <CrossSep />}
                <SwimCard filter={filter} update={update} />
                {!sidebar && <CrossSep />}
                <AnatomyCard
                  data={data}
                  filter={filter}
                  update={update}
                  uniqueFishIds={uniqueFishIds}
                />
                {selection.source === 'umap' && selection.indices.length > 0 && (
                  <>
                    {!sidebar && <CrossSep />}
                    <SelectionCard selection={selection} onClear={onClearSelection} />
                  </>
                )}
              </div>
            </div>
          )}
          {tab === 'settings' && (
            <SettingsTab filter={filter} settings={settings} setSettings={setSettings} />
          )}
          {tab === 'about' && <AboutTab data={data} applyView={applyView} />}
        </div>
      )}
```

`CrossSep` is dropped in sidebar layout because it uses `self-stretch flex items-center` — in a column that stretches horizontally and parks the `×` at the left edge, reading as a stray glyph. The card titles already carry the "these compose" meaning (`shared.tsx:18-19`).

- [ ] **Step 6: Own the tab state in App**

In `src/App.tsx`, add the import and the state:

```tsx
import { FilterControls, type Tab } from './components/FilterControls';
```

```tsx
  // Sidebar/bottom-panel active tab. Lifted out of FilterControls so the
  // 3D view's gear icon (embedded mode) can select the Settings tab.
  const [panelTab, setPanelTab] = useState<Tab>('filters');
```

Pass `tab={panelTab}` and `onTabChange={setPanelTab}` to the existing `<FilterControls>`. Do **not** pass `tsneTab` yet — standalone keeps its three tabs and its wrapped card row.

- [ ] **Step 7: Verify nothing changed for standalone**

Run: `npm run check`
Expected: PASS.

Run: `npm run test:smoke`
Expected: PASS — the existing `app.smoke.ts` clicks the **Settings** and **Filters** tabs and asserts their contents, which exercises the controlled-tab path.

- [ ] **Step 8: Commit**

```bash
git add src/components/FilterControls.tsx src/components/FilterControls.test.ts src/App.tsx
git commit -m "Make the panel tab controlled and accept an optional t-SNE tab"
```

---

### Task 4: The embedded grid, sidebar, and collapse rails

The layout change proper. To avoid duplicating `BrainViewer` / `ColorLegend` / `DetailPanel` / `FilterControls` across two JSX branches, hoist each into a local element variable and let the two branches compose them.

**Files:**
- Modify: `src/App.tsx:369-582` (the whole render block)
- Test: `tests/smoke/embedded.smoke.ts` (new)

**Interfaces:**
- Consumes: `outerGridTemplate` / `RAIL_WIDTH` via `usePanelLayout`'s `outerLayout` (Task 1), the sidebar handlers (Task 1), `Tab` state (Task 3).
- Produces: nothing consumed by later tasks except the `data-testid` hooks the smoke tests use: `embedded-sidebar`, `rail-sidebar`, `rail-detail`.

- [ ] **Step 1: Write the failing smoke test**

Create `tests/smoke/embedded.smoke.ts`:

```ts
import { expect, test } from '@playwright/test';

/** The embedded viewer is what mapzebrain.org loads in an iframe. These
 *  tests assert the layout it gets, and that the standalone layout is
 *  untouched. */
test('embedded mode renders the left sidebar and both rails', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?mock=1&embed=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });

  await expect(page.getByTestId('embedded-sidebar')).toBeVisible();
  await expect(page.getByTestId('rail-sidebar')).toBeVisible();
  await expect(page.getByTestId('rail-detail')).toBeVisible();

  // The sidebar sits left of the 3D canvas, which is the whole point.
  const sidebar = await page.getByTestId('embedded-sidebar').boundingBox();
  const canvas = await page.locator('canvas').first().boundingBox();
  expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(canvas!.x + 1);

  // The rails bracket everything.
  const leftRail = await page.getByTestId('rail-sidebar').boundingBox();
  expect(leftRail!.x).toBeLessThan(sidebar!.x);
  expect(Math.round(leftRail!.width)).toBe(35);

  await page.waitForTimeout(250);
  expect(pageErrors).toEqual([]);
});

test('the sidebar rail collapses and restores the sidebar', async ({ page }) => {
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('rail-sidebar').click();
  await expect(page.getByTestId('embedded-sidebar')).toHaveCount(0);
  // The rail itself must survive, or there is no way back.
  await expect(page.getByTestId('rail-sidebar')).toBeVisible();

  await page.getByTestId('rail-sidebar').click();
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible();
});

test('standalone mode keeps the bottom panel and no rails', async ({ page }) => {
  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('embedded-sidebar')).toHaveCount(0);
  await expect(page.getByTestId('rail-sidebar')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'WARP Atlas Viewer' })).toBeVisible();
});
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `npx playwright test tests/smoke/embedded.smoke.ts`
Expected: FAIL — the first two tests time out looking for `embedded-sidebar`. The third (standalone) should already PASS.

- [ ] **Step 3: Turn the embedded flag on**

Task 2 deliberately left `usePanelLayout`'s `embedded` argument unset, because five grid tracks with two auto-placed children renders broken. This task adds the flag and the three missing children in one commit, so the two never disagree.

In `src/App.tsx`, add a module-scope constant just below `INITIAL_SETTINGS_STATE` (line 92). Every later task reads this one name rather than re-deriving it:

```tsx
// Layout mode, fixed at module load. Read from INITIAL_SETTINGS_STATE rather
// than live `settings` on purpose: toggling the Settings checkbox mid-session
// must not re-shuffle the grid out from under a live camera — the same
// reasoning the camera default already uses.
const EMBEDDED = INITIAL_SETTINGS_STATE.embeddedMode;
```

Pass it as `usePanelLayout`'s second argument, and extend the destructure with the four names Task 2 left out because they had no consumer yet: `setSidebarOpen`, `onSidebarResizeDown`, `onSidebarResizeMove`, `onSidebarResizeUp`, `onSidebarResizeDoubleClick`.

```tsx
  } = usePanelLayout(
    {
      /* …the existing initial object from Task 2, unchanged… */
    },
    EMBEDDED,
  );
```

- [ ] **Step 4: Hoist the shared pieces into element variables**

In `src/App.tsx`, immediately before the `return (` at line 369, add:

```tsx
  // Hoisted so the standalone and embedded branches below compose the same
  // elements instead of duplicating them. Only one branch renders, so each
  // is created once.
  const viewer = (
    <>
      <Suspense fallback={<LoadingPane label="Loading 3D viewer…" />}>
        <BrainViewer
          data={data}
          filter={effectiveFilter}
          settings={settings}
          coloring={coloring}
          selection={selection}
          focusedNeuron={effectiveFocusedNeuron}
          onFocus={setFocusedNeuron}
          onCanvasSizeChange={setBrainCanvasSize}
          initialCamera={INITIAL_URL_STATE?.camera ?? null}
          onCameraChange={handleCameraChange}
          onProjectionModeChange={(mode) =>
            setSettings((s) => ({ ...s, projectionMode: mode }))
          }
        />
      </Suspense>
      <ColorLegend
        data={data}
        filter={effectiveFilter}
        settings={settings}
        uniqueFishIds={uniqueFishIds}
      />
    </>
  );

  const filterPanel = (
    <FilterControls
      data={data}
      filter={effectiveFilter}
      setFilter={setFilter}
      settings={settings}
      setSettings={setSettings}
      uniqueFishIds={uniqueFishIds}
      onReset={handleResetFilters}
      visibleCount={visibleCount}
      applyView={handleApplyView}
      activityPlaying={activityPlaying}
      setActivityPlaying={setActivityPlaying}
      activitySpeed={activitySpeed}
      setActivitySpeed={setActivitySpeed}
      selection={selection}
      onClearSelection={handleClearSelection}
      tab={panelTab}
      onTabChange={setPanelTab}
    />
  );

  // Declare tsnePanel BEFORE filterPanel: filterPanel's `tsneTab` prop
  // references it in its initializer, so the reverse order is a
  // temporal-dead-zone ReferenceError the moment App renders.
  const tsnePanel = (
    <Suspense fallback={<LoadingPane label="Loading t-SNE panel…" />}>
      <UmapPanel
        data={data}
        filter={effectiveFilter}
        settings={settings}
        selection={selection}
        coloring={coloring}
        pauseForActivityPlayback={
          activityPlaying && effectiveFilter.colorMode === 'activity'
        }
        focusedNeuron={effectiveFocusedNeuron}
        onFocus={setFocusedNeuron}
        onSelect={handleUmapSelect}
        initialViewport={INITIAL_URL_STATE?.umap ?? null}
        onViewportChange={handleUmapViewportChange}
      />
    </Suspense>
  );

  const detailAside = detailOpen && (
    <aside className="relative min-h-0 min-w-0 border-l border-neutral-800 bg-neutral-900">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize detail panel"
        onPointerDown={onDetailResizeDown}
        onPointerMove={onDetailResizeMove}
        onPointerUp={onDetailResizeUp}
        onPointerCancel={onDetailResizeUp}
        onDoubleClick={onDetailResizeDoubleClick}
        title="Drag to resize · double-click to reset"
        className="absolute top-0 bottom-0 left-0 w-1.5 z-20 cursor-col-resize bg-transparent hover:bg-yellow-300/30 transition-colors"
      />
      <Suspense fallback={<LoadingPane label="Loading details…" />}>
        <DetailPanel
          data={data}
          filter={effectiveFilter}
          settings={settings}
          selection={effectiveSelection}
          focusedNeuron={effectiveFocusedNeuron}
        />
      </Suspense>
    </aside>
  );
```

Then replace the corresponding inline JSX in the existing standalone tree with `{viewer}`, `{filterPanel}`, `{tsnePanel}`, and `{detailAside}`.

- [ ] **Step 5: Add the rail component**

Still in `src/App.tsx`, above `export default function App()`:

```tsx
/** mapZebrain's own collapse affordance: a full-height 35px arrow button
 *  pinned to a viewport edge (assets/css/sideMenu.css:29-58). Used in
 *  embedded mode in place of the small tab handles that stick into the 3D
 *  view. */
function CollapseRail({
  side,
  open,
  onToggle,
  label,
  testId,
}: {
  side: 'left' | 'right';
  open: boolean;
  onToggle: () => void;
  label: string;
  testId: string;
}) {
  // The glyph points the way the click will move the panel edge.
  const glyph = side === 'left' ? (open ? '‹' : '›') : open ? '›' : '‹';
  return (
    <button
      onClick={onToggle}
      title={`${open ? 'hide' : 'show'} ${label}`}
      aria-label={`${open ? 'hide' : 'show'} ${label}`}
      aria-expanded={open}
      data-testid={testId}
      className={
        'h-full w-full flex items-center justify-center text-lg font-mono ' +
        'bg-[#111] border border-black text-neutral-200 hover:bg-[#444] ' +
        (side === 'left' ? 'rounded-r-[3px]' : 'rounded-l-[3px]')
      }
    >
      <span aria-hidden>{glyph}</span>
    </button>
  );
}
```

- [ ] **Step 6: Add the embedded branch**

Wrap the existing `<div ref={mainAreaRef} …>` grid (lines 402-562) in `{EMBEDDED ? (…embedded…) : (…existing…)}`. The `else` branch is that existing tree unchanged apart from the Step 3 substitutions — do not retype or restructure it. The `then` branch is new:

```tsx
      {EMBEDDED ? (
        <div ref={mainAreaRef} className="flex-1 grid min-h-0" style={outerLayout}>
          {/* The rails are grid items occupying the first and last tracks,
              which outerGridTemplate always emits. So screenshot mode
              substitutes an empty div rather than rendering nothing —
              otherwise the tracks would be empty and the whole layout would
              shift 35px left. */}
          {settings.screenshotMode ? (
            <div />
          ) : (
            <CollapseRail
              side="left"
              open={sidebarOpen}
              onToggle={() => setSidebarOpen((o) => !o)}
              label="filters sidebar"
              testId="rail-sidebar"
            />
          )}
          {sidebarOpen && (
            <div
              data-testid="embedded-sidebar"
              // overflow-hidden matches the standalone filter column's wrapper:
              // it clips a card wider than the track instead of letting it
              // paint over the 3D canvas. FilterControls' own body still owns
              // the vertical overflow-y-auto.
              className="relative flex flex-col min-h-0 min-w-0 overflow-hidden bg-neutral-800"
            >
              <div className="flex-1 min-h-0">{filterPanel}</div>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize filters sidebar"
                onPointerDown={onSidebarResizeDown}
                onPointerMove={onSidebarResizeMove}
                onPointerUp={onSidebarResizeUp}
                onPointerCancel={onSidebarResizeUp}
                onDoubleClick={onSidebarResizeDoubleClick}
                title="Drag to resize · double-click to reset"
                className="absolute top-0 bottom-0 right-0 w-1.5 z-20 cursor-col-resize bg-transparent hover:bg-yellow-300/30 transition-colors"
              />
            </div>
          )}
          <div className="relative min-h-0 min-w-0">{viewer}</div>
          {detailAside}
          {settings.screenshotMode ? (
            <div />
          ) : (
            <CollapseRail
              side="right"
              open={detailOpen}
              onToggle={() => setDetailOpen((o) => !o)}
              label="details panel"
              testId="rail-detail"
            />
          )}
        </div>
      ) : (
        <div ref={mainAreaRef} className="flex-1 grid min-h-0" style={outerLayout}>
          {/* …existing standalone tree from lines 404-561, with {viewer},
              {filterPanel}, {tsnePanel}, and {detailAside} substituted… */}
        </div>
      )}
```

One more thing to change outside the grid: **the detail-panel tab handle at the bottom of the file (lines 571-581) must not render in embedded mode** — the right rail replaces it. Change its guard from `{!settings.screenshotMode && (` to:

```tsx
      {!EMBEDDED && !settings.screenshotMode && (
```

- [ ] **Step 7: Run the smoke test to verify it passes**

Run: `npx playwright test tests/smoke/embedded.smoke.ts`
Expected: PASS — 3 tests.

- [ ] **Step 8: Verify the full gate**

Run: `npm run check && npm run test:smoke`
Expected: PASS.

- [ ] **Step 9: Look at it**

Run `npm run dev`, open `/?mock=1&embed=1`, and check by hand:

- Drag the sidebar's right edge: it **grows when dragged right**. Double-click snaps to 360.
- Drag to both bounds: stops at 280 and 700, and the 3D canvas re-fits at every width.
- Collapse the sidebar via the left rail, re-expand: the width is preserved.
- Collapse both panels: the 3D view spans everything between the rails.
- Compare `/?mock=1` against `main` — identical.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx tests/smoke/embedded.smoke.ts
git commit -m "Render the embedded layout as a left sidebar with edge rails"
```

---

### Task 5: Fold the header into the sidebar

Inside the iframe, mapZebrain already renders its own top nav, so warp's header is a competing second title bar. Removing it in embedded mode also buys ~56px of canvas height.

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/smoke/embedded.smoke.ts`

**Interfaces:**
- Consumes: `embedded` and the element variables from Task 4.
- Produces: `data-testid="sidebar-header"`.

- [ ] **Step 1: Write the failing test**

Add to `tests/smoke/embedded.smoke.ts`:

```ts
test('embedded mode folds the header into the sidebar', async ({ page }) => {
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  // No page-level header row: the host page supplies one.
  await expect(page.locator('header')).toHaveCount(0);

  // Title, cell count, Export, and Links all live in the sidebar instead.
  const header = page.getByTestId('sidebar-header');
  await expect(header.getByRole('heading', { name: 'WARP Atlas Viewer' })).toBeVisible();
  await expect(header.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible();
  await expect(header.getByRole('button', { name: /export/i })).toBeVisible();

  // The Janelia logo moves onto the 3D view rather than disappearing.
  await expect(
    page.getByRole('link', { name: 'Janelia Research Campus' }),
  ).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/smoke/embedded.smoke.ts -g "folds the header"`
Expected: FAIL — `expect(locator).toHaveCount(0)` receives 1, because the header still renders.

- [ ] **Step 3: Hoist the header pieces**

In `src/App.tsx`, next to the other element variables, add:

```tsx
  const janeliaLogo = (
    <a
      href="https://www.janelia.org"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Janelia Research Campus"
    >
      <img src={janeliaLogoUrl} alt="Janelia Research Campus" className="h-10 block" />
    </a>
  );

  const cellCountLine = (
    <p
      className="font-mono text-[11px] text-neutral-500"
      title="Cells from each fish are registered into shared mapZebrain atlas coordinates."
    >
      {data.count.toLocaleString()} cells pooled from {uniqueFishIds.length} fish{data.source === 'mock' ? ' (mock)' : ''}
    </p>
  );

  // Embedded mode has no page header — mapZebrain's own nav sits above the
  // iframe. The header's contents move to a compact strip at the top of the
  // sidebar, mirroring mapZebrain's own "All items" heading, and the Janelia
  // logo becomes a corner overlay on the 3D view.
  const sidebarHeader = (
    <div data-testid="sidebar-header" className="flex-shrink-0 px-3 pt-2 pb-1.5">
      <h1 className="text-sm font-semibold text-neutral-100 leading-tight">
        WARP Atlas Viewer
      </h1>
      {cellCountLine}
      {!settings.screenshotMode && (
        <div className="flex items-center gap-3 mt-1.5">
          <ExportButton
            data={data}
            effectiveSelection={effectiveSelection}
            focusedNeuron={effectiveFocusedNeuron}
          />
          <LinksMenu />
        </div>
      )}
    </div>
  );
```

Use `{cellCountLine}` and `{janeliaLogo}` in the existing `<header>` so the standalone markup is unchanged but not duplicated.

- [ ] **Step 4: Branch the header and place the overlay**

Wrap the existing `<header>` in `{!EMBEDDED && (…)}`.

Insert `{sidebarHeader}` as the first child of the sidebar div, above `<div className="flex-1 min-h-0">{filterPanel}</div>`. `FilterControls`' root already carries `border-t border-neutral-700`, which draws the divider under the strip — no extra border needed.

Add the logo overlay to the embedded viewer cell:

```tsx
          <div className="relative min-h-0 min-w-0">
            {viewer}
            {!settings.screenshotMode && (
              <div className="absolute bottom-2 right-2 z-10">{janeliaLogo}</div>
            )}
          </div>
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx playwright test tests/smoke/embedded.smoke.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Verify the full gate and eyeball it**

Run: `npm run check && npm run test:smoke`
Expected: PASS — including `app.smoke.ts`, which asserts the standalone heading and cell-count text.

In the browser at `/?mock=1&embed=1`: the strip reads cleanly at a 280px sidebar (the Export and Links buttons must not wrap awkwardly), the logo does not cover the orientation icon bar, and the logo link still opens janelia.org.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx tests/smoke/embedded.smoke.ts
git commit -m "Fold the embedded header into the sidebar and move the logo onto the canvas"
```

---

### Task 6: Wire the t-SNE panel into its tab

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/smoke/embedded.smoke.ts`

**Interfaces:**
- Consumes: `tsneTab` prop (Task 3), `umapViewportRef` (Task 2), `tsnePanel` variable (Task 4).
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Add to `tests/smoke/embedded.smoke.ts`:

```ts
test('the t-SNE tab holds the plot and survives a tab round-trip', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  const sidebar = page.getByTestId('embedded-sidebar');
  // Four tabs, t-SNE second.
  await expect(sidebar.getByRole('button', { name: 't-SNE' })).toBeVisible();

  // On the Filters tab there is exactly one canvas — the 3D view. The t-SNE
  // canvas is unmounted, which is the behaviour the viewport-reseed below
  // exists to make safe.
  await expect(page.locator('canvas')).toHaveCount(1);

  await sidebar.getByRole('button', { name: 't-SNE' }).click();
  await expect(page.locator('canvas')).toHaveCount(2);

  // The t-SNE canvas must fill the tab body, not sit in a padded scroller.
  // Scope the locator to the sidebar rather than indexing the page's
  // canvases: in embedded mode the sidebar precedes the viewer in DOM
  // order, so the t-SNE canvas is nth(0) and the 3D canvas is nth(1) —
  // an index-based selector here silently asserts a lower bound on the
  // wrong canvas and would pass through a real t-SNE sizing regression.
  // The 10px margin is deliberately tight: at 40 the assertion still
  // passed with a `p-3` scroller injected into the tab body, i.e. it did
  // not actually test the thing it names. Verified to fail at 10.
  const body = await sidebar.boundingBox();
  const tsne = await sidebar.locator('canvas').boundingBox();
  expect(tsne!.width).toBeGreaterThan(body!.width - 10);

  await sidebar.getByRole('button', { name: 'Filters' }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await sidebar.getByRole('button', { name: 't-SNE' }).click();
  await expect(page.locator('canvas')).toHaveCount(2);

  await page.waitForTimeout(250);
  expect(pageErrors).toEqual([]);
});

test('standalone keeps the t-SNE panel docked, with no t-SNE tab', async ({ page }) => {
  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  // Both canvases visible at once, and no tab button for t-SNE.
  await expect(page.locator('canvas')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 't-SNE' })).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/smoke/embedded.smoke.ts -g "t-SNE tab holds"`
Expected: FAIL — no `t-SNE` tab button exists.

- [ ] **Step 3: Reseed the viewport and pass the node**

`initialViewport` currently comes from `INITIAL_URL_STATE?.umap`, read **once at module load** (`App.tsx:75-76`). Unmounting on a tab switch and remounting would restore that page-load value and throw away the user's pan and zoom. `useUrlSync` already tracks the live viewport; read it.

In `src/App.tsx`, destructure it (from Task 2):

```tsx
  const { handleCameraChange, handleUmapViewportChange, umapViewportRef } = useUrlSync(
```

Change `tsnePanel`'s `initialViewport`:

```tsx
        // Reseed from the live viewport, not the module-load URL value: the
        // embedded t-SNE tab unmounts this panel on every tab switch, and
        // INITIAL_URL_STATE is frozen at page load.
        initialViewport={umapViewportRef.current ?? INITIAL_URL_STATE?.umap ?? null}
```

Pass the node to the sidebar's `FilterControls` only. Because `filterPanel` is shared between branches, give it the prop conditionally:

```tsx
  const filterPanel = (
    <FilterControls
      /* …existing props… */
      tab={panelTab}
      onTabChange={setPanelTab}
      tsneTab={EMBEDDED ? tsnePanel : undefined}
    />
  );
```

In embedded mode the standalone bottom row is not rendered, so `tsnePanel` has exactly one mount site in each mode.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx playwright test tests/smoke/embedded.smoke.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Verify the full gate and check the selection path by hand**

Run: `npm run check && npm run test:smoke`
Expected: PASS.

In the browser at `/?mock=1&embed=1`:

- Lasso a group on the t-SNE tab, switch to Filters, come back: the pan/zoom is where you left it and the lasso is still drawn.
- While on the Filters tab with a lasso active, the **Selection** card shows the count and its clear button works. This card is now the only indication a lasso exists while the t-SNE tab is hidden.
- The t-SNE canvas fills its tab body with no scrollbar and no padding gap, at both sidebar bounds.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx tests/smoke/embedded.smoke.ts
git commit -m "Render the t-SNE panel as the embedded sidebar's second tab"
```

---

### Task 7: Screenshot and gear icons in the orientation bar

mapZebrain's 3D bar is seven orientation icons plus a screenshot icon and a gear (`three-dview.component.html:34-43`). Adding both makes warp's bar a functional match.

**The spec's capture mechanism is superseded.** It proposed an in-`Canvas` `useThree` component calling `gl.render(scene, camera)` then `toDataURL()`. That is wrong in the five projection modes: `ProjectionRenderPass` builds its image across up to four passes per frame in `useFrame`, so a bare `gl.render` of the raw scene would produce a *different* picture than the one on screen — silently. Instead, create the canvas with `preserveDrawingBuffer: true` **in embedded mode only**, and read the composited back buffer directly. Correct in every mode, less code, and the per-frame copy cost is confined to the embedded viewer.

The trade-off: `gl` options are read once at `Canvas` creation, so toggling the Settings checkbox mid-session cannot enable capture. The screenshot button is therefore gated on the mount-time value, so it is never present in a state where it would emit a blank PNG. This mirrors the existing documented caveat that toggling `embeddedMode` mid-session does not move the camera.

**Files:**
- Copy: `../mapzebrain-master/client/src/assets/imgs/3d_view_icons/screenshot.webp` → `images/view_screenshot.webp`
- Copy: `../mapzebrain-master/client/src/assets/imgs/3d_view_icons/settings.webp` → `images/view_settings.webp`
- Modify: `src/components/brain/ViewOrientationBar.tsx`
- Modify: `src/components/BrainViewer.tsx`
- Modify: `src/App.tsx` (pass `onOpenSettings`)
- Test: `tests/smoke/embedded.smoke.ts`

**Interfaces:**
- Consumes: `setPanelTab` / `setSidebarOpen` from App.
- Produces:
  - `ViewOrientationBar` props gain `onCapture: (() => void) | null` (null hides the button) and `onOpenSettings: () => void`.
  - `BrainViewer` props gain `onOpenSettings?: () => void`.

- [ ] **Step 1: Write the failing test**

Add to `tests/smoke/embedded.smoke.ts`:

```ts
test('the gear icon opens the Settings tab', async ({ page }) => {
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: '3D view settings' }).click();
  await expect(page.getByText('3D point density', { exact: true })).toBeVisible();
});

test('the gear icon reopens a collapsed sidebar', async ({ page }) => {
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('rail-sidebar').click();
  await expect(page.getByTestId('embedded-sidebar')).toHaveCount(0);

  await page.getByRole('button', { name: '3D view settings' }).click();
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible();
  await expect(page.getByText('3D point density', { exact: true })).toBeVisible();
});

test('the screenshot icon downloads a non-blank PNG', async ({ page }) => {
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  // Let the point cloud actually draw before capturing.
  await page.waitForTimeout(1500);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '3D view screenshot' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('warp-atlas.png');

  // The preserveDrawingBuffer trap: without it toDataURL yields a tiny
  // all-transparent PNG. A real capture of a 274k-point scene is far larger.
  const path = await download.path();
  const { statSync } = await import('node:fs');
  expect(statSync(path!).size).toBeGreaterThan(20_000);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/smoke/embedded.smoke.ts -g "gear icon opens"`
Expected: FAIL — no button named `3D view settings`.

- [ ] **Step 3: Copy mapZebrain's two icons**

```bash
cp ../mapzebrain-master/client/src/assets/imgs/3d_view_icons/screenshot.webp images/view_screenshot.webp
cp ../mapzebrain-master/client/src/assets/imgs/3d_view_icons/settings.webp images/view_settings.webp
```

- [ ] **Step 4: Add the two buttons to the bar**

Replace `src/components/brain/ViewOrientationBar.tsx`'s component with:

```tsx
import { VIEW_PRESETS, presetPosition, type ViewPresetKey } from './viewPresets';
import dorsalIcon from '../../../images/view_dorsal.webp';
import ventralIcon from '../../../images/view_ventral.webp';
import sagittalVerticalLeftIcon from '../../../images/view_sagittal_vertical_left.webp';
import sagittalVerticalRightIcon from '../../../images/view_sagittal_vertical_right.webp';
import sagittalHorizontalLeftIcon from '../../../images/view_sagittal_horizontal_left.webp';
import sagittalHorizontalRightIcon from '../../../images/view_sagittal_horizontal_right.webp';
import coronalIcon from '../../../images/view_coronal.webp';
import screenshotIcon from '../../../images/view_screenshot.webp';
import settingsIcon from '../../../images/view_settings.webp';

/** mapZebrain's own icon artwork, so the bar reads as continuous with the
 *  host page when the viewer is embedded there. Kept out of viewPresets.ts
 *  so that module stays a pure, trivially testable table. */
const PRESET_ICONS: Record<ViewPresetKey, string> = {
  dorsal: dorsalIcon,
  ventral: ventralIcon,
  sagittalVerticalLeft: sagittalVerticalLeftIcon,
  sagittalVerticalRight: sagittalVerticalRightIcon,
  sagittalHorizontalLeft: sagittalHorizontalLeftIcon,
  sagittalHorizontalRight: sagittalHorizontalRightIcon,
  coronal: coronalIcon,
};

const BUTTON_CLASS =
  'p-0.5 rounded border border-neutral-700 bg-neutral-900/85 hover:bg-neutral-800 hover:border-neutral-500';

/** The view-orientation icon row above the 3D view, mirroring mapZebrain's.
 *  Only rendered in embedded mode. The trailing screenshot + gear pair
 *  matches mapZebrain's own bar, at their smaller 25px size. */
export function ViewOrientationBar({
  distance,
  applyView,
  onCapture,
  onOpenSettings,
}: {
  distance: number;
  applyView: (position: [number, number, number], up: [number, number, number]) => void;
  /** null when the canvas was not created with preserveDrawingBuffer, in
   *  which case a capture would silently produce a blank PNG. */
  onCapture: (() => void) | null;
  onOpenSettings: () => void;
}) {
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
      {VIEW_PRESETS.map((preset) => (
        <button
          key={preset.key}
          title={preset.label}
          onClick={(e) => {
            // The viewer's container div treats a bare click as "focus the
            // cell under the cursor" / "clear focus", so stop here.
            e.stopPropagation();
            applyView(presetPosition(preset, distance), preset.up);
          }}
          className={BUTTON_CLASS}
        >
          <img src={PRESET_ICONS[preset.key]} alt={preset.label} className="h-8 w-8" />
        </button>
      ))}
      <span className="w-1" aria-hidden />
      {onCapture && (
        <button
          title="Download a PNG of the 3D view"
          aria-label="3D view screenshot"
          onClick={(e) => {
            e.stopPropagation();
            onCapture();
          }}
          className={BUTTON_CLASS}
        >
          <img src={screenshotIcon} alt="" className="h-[25px] w-[25px]" />
        </button>
      )}
      <button
        title="3D view settings"
        aria-label="3D view settings"
        onClick={(e) => {
          e.stopPropagation();
          onOpenSettings();
        }}
        className={BUTTON_CLASS}
      >
        <img src={settingsIcon} alt="" className="h-[25px] w-[25px]" />
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Capture and the black background in `BrainViewer`**

In `src/components/BrainViewer.tsx`:

Add `onOpenSettings?: () => void;` to `Props` and to the destructured parameters.

Capture the mount-time mode, next to the existing `mountCameraRef` (line 171):

```tsx
  // Embedded mode at MOUNT. The Canvas reads its `gl` options once at
  // creation, so preserveDrawingBuffer — and therefore whether a screenshot
  // can be taken at all — is fixed here. Toggling the Settings checkbox
  // later must not offer a button that would emit a blank PNG.
  const embeddedAtMountRef = useRef(settings.embeddedMode);
```

Add the capture callback near the other `useCallback`s:

```tsx
  // Reads the composited back buffer, so the PNG matches what is on screen
  // in every mode — including the projection modes, where the image is built
  // across several passes per frame and re-rendering the raw scene here
  // would produce a different picture.
  const onCapture = useCallback(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'warp-atlas.png';
    a.click();
  }, []);
```

Change the `Canvas` `gl` prop and the background:

```tsx
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          // Needed for toDataURL to see anything. Embedded-only: it costs a
          // full-canvas copy per frame.
          preserveDrawingBuffer: embeddedAtMountRef.current,
        }}
```

```tsx
        <color
          attach="background"
          args={[settings.embeddedMode ? EMBEDDED_BACKGROUND : VIEWER_BACKGROUND]}
        />
```

Add next to `VIEWER_BACKGROUND` (line 31):

```tsx
// mapZebrain's own clear colour (web-gl.service.ts:47), so the embedded
// canvas and the host page's canvas match exactly.
const EMBEDDED_BACKGROUND = '#000000';
```

Pass the two new props at the `ViewOrientationBar` call site (line 358):

```tsx
        <ViewOrientationBar
          distance={presetDistance}
          applyView={(position, up) => applyViewRef.current?.(position, up)}
          onCapture={embeddedAtMountRef.current ? onCapture : null}
          onOpenSettings={() => onOpenSettings?.()}
        />
```

- [ ] **Step 6: Wire App's handler**

In `src/App.tsx`, add to the `viewer` variable's `<BrainViewer>`:

```tsx
          onOpenSettings={() => {
            setSidebarOpen(true);
            setPanelTab('settings');
          }}
```

Opening the sidebar first matters: with it collapsed, selecting a hidden tab looks like the gear does nothing.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/smoke/embedded.smoke.ts`
Expected: PASS — 9 tests.

If the screenshot size assertion fails, check `preserveDrawingBuffer` actually reached the `Canvas` before blaming the threshold. A blank PNG at 1280×720 is on the order of a few hundred bytes.

- [ ] **Step 8: Verify the full gate and eyeball it**

Run: `npm run check && npm run test:smoke`
Expected: PASS.

In the browser at `/?mock=1&embed=1`:

- The bar shows nine icons; the last two are visibly smaller.
- The screenshot PNG contains the brain. Confirm the legend and the icon bar are **absent** — they are DOM overlays, by design and matching mapZebrain.
- Take a screenshot in a projection mode (Settings → projection → `mean`) and confirm the PNG shows the projected image, not the raw point cloud.
- `screenshotMode` on: the whole bar disappears (existing behaviour at `BrainViewer.tsx:358`).
- Without `?embed=1`: no bar, and the background is still `#0a0a0a`.

- [ ] **Step 9: Commit**

```bash
git add images/view_screenshot.webp images/view_settings.webp \
  src/components/brain/ViewOrientationBar.tsx src/components/BrainViewer.tsx \
  src/App.tsx tests/smoke/embedded.smoke.ts
git commit -m "Add mapZebrain's screenshot and settings icons to the orientation bar"
```

---

### Task 8: mapZebrain's accent palette, via Tailwind colour aliases

`yellow-300` appears at 19 sites across 9 files. Threading an `embedded` boolean to all nine would be a large diff and a permanent tax on every future component.

**The spec's mechanism is refined here.** It proposed raw `border-[var(--accent)]` arbitrary values. That breaks on the four sites that use an opacity modifier (`ring-yellow-300/60`, `bg-yellow-300/30`): Tailwind cannot inject an alpha channel into an opaque `var()`. Registering the colour in `tailwind.config.ts` with the `<alpha-value>` placeholder — backed by a space-separated RGB-channel variable — makes the opacity modifiers work and gives the call sites natural names (`border-accent`, `ring-accent/60`).

Four of the 19 sites are deliberately **not** changed:
- `App.tsx:446`, `App.tsx:510`, `App.tsx:549` — `hover:bg-yellow-300/30` on the resize strips. A transient drag affordance, not brand accent; pink-on-hover reads as an error state.
- `ExportButton.tsx:191` — `bg-yellow-400 … hover:bg-yellow-300`, a filled primary button in a modal dialog. Its base colour is `yellow-400`, so it would need a second variable for no real gain.

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/styles/globals.css`
- Modify: `src/App.tsx` (the root `embedded` class)
- Modify (one line each): `src/components/FilterControls.tsx:94`, `src/components/LinksMenu.tsx:92`, `src/components/ExportButton.tsx:93`, `src/components/filters/AboutTab.tsx:160,191,211,262,282`, `src/components/filters/ActivityCard.tsx:86`, `src/components/filters/ColorsCard.tsx:165`, `src/components/filters/SwimCard.tsx:65`, `src/components/filters/SettingsTab.tsx:779,819,851,920`

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind colours `accent` and `panel`; the `.embedded` root class.

- [ ] **Step 1: Register the two colours**

In `tailwind.config.ts`:

```ts
    extend: {
      colors: {
        // Backed by CSS variables so embedded mode can re-point them without
        // any component knowing it exists. The <alpha-value> placeholder is
        // what makes opacity modifiers (ring-accent/60) work — a raw
        // var(--accent) cannot take an alpha channel.
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        panel: 'rgb(var(--panel-rgb) / <alpha-value>)',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
    },
```

- [ ] **Step 2: Define the variables**

In `src/styles/globals.css`, after the `@tailwind` directives:

```css
/* Accent + panel colours. The defaults are warp's own (yellow-300 /
   neutral-800); `.embedded` re-points them at mapZebrain's, so the viewer
   running in their iframe matches the host page. Channel triples rather than
   hex so Tailwind's opacity modifiers work. */
:root {
  --accent-rgb: 253 224 71; /* yellow-300 #fde047 */
  --panel-rgb: 38 38 38; /* neutral-800 #262626 */
}

.embedded {
  --accent-rgb: 255 20 147; /* mapZebrain .mat-ink-bar #ff1493 */
  --panel-rgb: 17 17 17; /* mapZebrain .side-menu #111 */
}
```

- [ ] **Step 3: Put the class on the root and check standalone is unchanged**

In `src/App.tsx`, on the outermost div (line 370):

```tsx
    <div
      className={
        'relative h-full w-full overflow-hidden flex flex-col' +
        (EMBEDDED ? ' embedded' : '')
      }
    >
```

Run: `npm run check`
Expected: PASS.

Then confirm the alias resolves to the identical colour before changing any call site — a Tailwind class that fails to compile produces no style and no error, so this is the step that catches a typo:

```bash
npm run build && grep -o 'rgb(var(--accent-rgb)[^)]*)' dist/assets/*.css | head
```

Expected: at least one match, proving the alias generated CSS rather than being dropped.

- [ ] **Step 4: Swap the 15 call sites**

Mechanical, one line each. `text-yellow-300` → `text-accent`, `border-yellow-300` → `border-accent`, `ring-yellow-300/60` → `ring-accent/60`, `accent-yellow-300` → `accent-accent`.

| File | Line | From | To |
|---|---|---|---|
| `FilterControls.tsx` | 94 | `border-yellow-300` | `border-accent` |
| `LinksMenu.tsx` | 92 | `hover:text-yellow-300` | `hover:text-accent` |
| `ExportButton.tsx` | 93 | `hover:text-yellow-300` | `hover:text-accent` |
| `AboutTab.tsx` | 160, 191, 211, 262, 282 | `text-yellow-300` | `text-accent` |
| `ActivityCard.tsx` | 86 | `border-yellow-300 ring-1 ring-yellow-300/60` | `border-accent ring-1 ring-accent/60` |
| `ColorsCard.tsx` | 165 | `accent-yellow-300` | `accent-accent` |
| `SwimCard.tsx` | 65 | `border-yellow-300 ring-1 ring-yellow-300/60` | `border-accent ring-1 ring-accent/60` |
| `SettingsTab.tsx` | 779 | `text-yellow-300` | `text-accent` |
| `SettingsTab.tsx` | 819, 851, 920 | `accent-yellow-300` | `accent-accent` |

Then darken the two panel containers so the sidebar matches mapZebrain's `#111`:

- `src/components/FilterControls.tsx:83` — `bg-neutral-800` → `bg-panel`
- `src/App.tsx` — the sidebar div and the standalone bottom row's `bg-neutral-800` → `bg-panel`

Leave the `Card` component's `bg-neutral-900/60` alone; it reads correctly against both panel values.

- [ ] **Step 5: Assert only the four intended `yellow-300` sites remain**

```bash
grep -rn "yellow-300" src/
```

Expected: exactly 4 lines — `App.tsx` ×3 (the resize strips) and `ExportButton.tsx:191`. Any other hit is a missed site.

- [ ] **Step 6: Verify**

Run: `npm run check && npm run test:smoke`
Expected: PASS.

In the browser:
- `/?mock=1` — every accent is the **same yellow as before**. Compare the active tab underline, an About-tab link, and a Colors-card slider against `main` side by side. This is the regression that matters.
- `/?mock=1&embed=1` — the active tab underline is pink, links are pink, the sidebar is `#111`. Tab *labels* stay neutral, and the resize strips still highlight yellow on hover.

- [ ] **Step 7: Commit**

```bash
git add tailwind.config.ts src/styles/globals.css src/App.tsx \
  src/components/FilterControls.tsx src/components/LinksMenu.tsx \
  src/components/ExportButton.tsx src/components/filters/
git commit -m "Re-point the accent and panel colours through CSS variables

Embedded mode gets mapZebrain's #ff1493 accent and #111 panels; standalone
resolves to the same yellow-300 and neutral-800 as before."
```

---

### Task 9: Documentation

`docs/settings.md` currently promises embedded mode "changes nothing else: no panel, layout, or chrome is hidden" — which this change makes false. That is the one doc edit that is a correctness fix rather than an addition.

**Files:**
- Modify: `docs/settings.md:258-275` (the Embedded mode section)
- Modify: `docs/ui/panels.md`, `docs/ui/tsne.md`, `docs/ui/viewer.md`, `docs/sharing.md`
- Modify: `README.md:26`

- [ ] **Step 1: Rewrite the Embedded mode section**

In `docs/settings.md`, replace the paragraph beginning "Adds a row of seven view-orientation icons" and the claim that it "changes nothing else". Cover:

- The left sidebar: Filters / t-SNE / Settings / About, resizable by dragging its right edge (280–700px, double-click for 360), collapsible via the left rail.
- The t-SNE plot as the second tab. Note that its pan/zoom and any lasso survive tab switches, and that the **Selection** card on the Filters tab is how you see and clear a lasso while the t-SNE tab is hidden.
- No page header: the title, cell count, Export, and Links move into the sidebar; the Janelia logo sits on the 3D view.
- The two collapse rails, replacing the `⌄`/`⌃` and `›`/`‹` handles.
- The nine-icon bar: seven orientations plus screenshot and settings.
- mapZebrain's accent colour and panel background.
- Keep the existing note that the mode is set by `?embed=1`, is not written to the hash, and that toggling the checkbox mid-session does not jump the camera. **Add** that the checkbox cannot enable the screenshot button — that needs a reload with `?embed=1`, because the canvas's `preserveDrawingBuffer` is fixed at creation.

- [ ] **Step 2: Update the other pages**

- `docs/ui/panels.md` — the embedded layout, the sidebar resizer and its bounds, the rails.
- `docs/ui/tsne.md` — t-SNE as a tab in embedded mode; viewport and selection persistence across tab switches.
- `docs/ui/viewer.md` — the screenshot and gear icons. State plainly that the PNG contains **only** the 3D render: no colour legend, no icon bar, no tooltips, matching mapZebrain's own screenshot. Note that `screenshotMode` is the way to capture the full viewport instead.
- `docs/sharing.md` — `sidebarWidth` and `sidebarOpen` ride in the hash; `embeddedMode` still does not.

- [ ] **Step 3: Correct the README**

`README.md:26` ends with "purely additive, no layout change", which this change makes false — the same stale claim as in `docs/settings.md`. Replace that bullet with:

```markdown
- **Embedded mode** (`?embed=1`): for running the viewer in an iframe on [mapzebrain.org](https://mapzebrain.org). Moves the filter panel to a resizable left sidebar with the t-SNE plot as a tab, drops the page header into that sidebar, adds mapZebrain's nine-icon 3D toolbar (seven orientations plus screenshot and settings), its edge collapse rails, and its accent palette, and opens on mapZebrain's own default orientation (dorsal, brain vertical, rostral up). The standalone layout is unaffected.
```

- [ ] **Step 4: Verify the docs build**

Run: `npm run docs:build`
Expected: PASS, no dead-link warnings.

- [ ] **Step 5: Commit**

```bash
git add docs/ README.md
git commit -m "Document the embedded sidebar, t-SNE tab, and the new icons"
```

---

## Final verification

Run the full gate plus the manual checklist from the spec
(`specs/2026-08-03-embedded-left-sidebar-design.md` → "Manual verification
checklist"). Three items on it are not covered by any automated test and are the
most likely to be wrong:

1. **Filters tab at a 280px sidebar** — every card reachable, no horizontal
   scrollbar, no stray `×`, and the 112-region dropdown truncating rather than
   overflowing.
2. **A real iframe at 1280×720 and 1024×640** — no double scrollbars, no clipped
   sidebar, the 3D view still usable at ~490px and ~234px respectively. The
   narrow case is the one that may argue for reversing the "detail panel starts
   open" decision; see the spec's Layout arithmetic section for the one-line
   change.
3. **Standalone visual diff against `main`** — the constraint the whole plan
   rests on.

```bash
npm run check && npm run test:smoke && npm run docs:build
```
