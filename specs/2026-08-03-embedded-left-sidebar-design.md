# Embedded mode: left sidebar, t-SNE tab, and mapZebrain visual fit

**Date:** 2026-08-03
**Status:** approved, ready for implementation planning

## Goal

Rework the embedded viewer (`?embed=1`) so it reads as part of mapZebrain's own
atlas page rather than a bolted-on iframe:

1. Move the bottom panel (Filters / Settings / About) to a resizable **left
   sidebar**, matching mapZebrain's left side menu.
2. Make the t-SNE plot a **fourth tab**, immediately right of Filters.
3. Fold the WARP header into the sidebar so the iframe does not stack a second
   title bar under mapZebrain's own nav.
4. Adopt mapZebrain's **edge collapse rails**, its **screenshot + gear icons**
   in the orientation bar, and its **palette**.

This picks up three items the previous spec
([`2026-07-31-mapzebrain-brain-models-design.md`](./2026-07-31-mapzebrain-brain-models-design.md))
deferred to "Future work": the screenshot icon, hiding/moving warp's panels in
embedded mode, and deciding layout after seeing the viewer in a real iframe.

**Every change is scoped to `embeddedMode`.** The standalone viewer's layout,
camera, and chrome are byte-identical to today. This was an explicit decision
over the alternative of retiring the bottom panel everywhere: that would have
produced a smaller final codebase but changed the standalone viewer for existing
users and invalidated the `bh` / `bo` keys in already-shared URLs.

Explicitly **not** in this scope:

- Any `postMessage` bridge between mapZebrain and the viewer. Still its own spec.
- The Detail panel starting collapsed in embedded mode. Considered and declined;
  see [Layout arithmetic](#layout-arithmetic) for the consequence and the
  one-line reversal.
- Restructuring the Filters cards themselves. They must merely *survive* a
  ~360px column; redesigning them for narrow layout is separate work.
- Changing the standalone viewer in any way, including its palette.

## The two layouts

```
EMBEDDED (?embed=1)                          STANDALONE (unchanged)
┌──┬─────────────┬──────────────┬───────┬──┐  ┌──────────────────────┐
│← │  sidebar    │              │Detail │→ │  │ header               │
│  │┌───────────┐│  ⬜⬜⬜ 📷 ⚙   │       │  │  ├───────────┬──────────┤
│  ││WARP Atlas ││              │       │  │  │    3D     │  Detail  │
│35││274k·12fish││              │       │35│  ├───────────┤          │
│px││ [⤓] [🔗]  ││              │       │px│  │Filters│tSNE│         │
│  │├───────────┤│   3D view    │ 360px │  │  └───────────┴──────────┘
│  ││Filt tSNE  ││              │       │  │
│  ││ ⚙    ⓘ    ││              │       │  │  bottom panel + t-SNE
│  │├───────────┤│              │       │  │  column, exactly as today
│  ││□ colors   ││              │       │  │
│  ││□ genes    ││   [janelia]  │       │  │
│  │└───────────┘│              │       │  │
│  │   360px     ┃← drag        │       │  │
└──┴─────────────┴──────────────┴───────┴──┘
```

In embedded mode the outer grid is five columns:
`35px | sidebarWidth | minmax(0, 1fr) | detailWidth | 35px`. The bottom row does
not exist, so `bottomOpen` / `bottomHeight` / `umapWidth` and their resize
strips are inert (they stay in the code and the hash for the standalone layout).

### What mapZebrain actually does

Measured from `../mapzebrain-master`, so the fit is against real values rather
than an impression of the screenshot:

| element | source | value |
|---|---|---|
| side menu width | `assets/css/sideMenu.css:4` | `440px`, `position: fixed` |
| side menu background | `assets/css/sideMenu.css:8` | `#111` |
| collapse rail | `assets/css/sideMenu.css:29-45` | `35px` wide, full height, `#111`, `border-radius: 3px 0 0 3px`, hover `#444` |
| rail placement | `sideMenu.css:52-58` | `left: 0` / `right: 0`, outside the menus (which sit at `left/right: 35px`) |
| section header | `assets/css/style.css:189-197` | `#222` background, `2px dashed #444` |
| active tab indicator | `right-menu.component.css:23-25` | `.mat-ink-bar` `#ff1493` |
| tab labels | `right-menu.component.css:2-20` | `#ffffff`, active and inactive alike |
| hint text | `left-menu.component.html:90` | `lightskyblue` |
| canvas clear colour | `web-gl.service.ts:47` | `#000000` |
| orientation icons | `three-dview.component.html:12-32` | 7 icons, `height="32"`, **above** the canvas, centred |
| screenshot + gear | `three-dview.component.html:34-43` | `height="25"`, immediately right of the orientation icons |

Two structural notes. First, mapZebrain's page is
`header / left-menu / right-menu / main-content` — a left "All items" menu and a
right "Selected items" menu flanking the 3D canvas. Warp's Filters sidebar and
Detail panel land on the same two sides, so the embedded layout is a structural
match, not just a stylistic one. Second, mapZebrain's icon bar sits *above* the
canvas; warp's overlays it at top-centre. Keep warp's overlay — it uses the
vertical space better and the bar is already built.

### Layout arithmetic

At a 1280px iframe with both panels open:
`1280 − 35 − 35 − 360 − 360 = 490px` for the 3D view.

That is tight. mapZebrain's own 440px sidebar would leave 410px, which is why
the default is **360px**, not 440 — mapZebrain's width is one drag away for
anyone who wants it. Collapsing either panel via its rail returns 360px to the
canvas immediately.

The cheap fix for this was "Detail panel starts closed in embedded mode",
considered and declined. If the squeeze turns out to be objectionable in a real
iframe, the reversal is one line: `detailOpen` initialises to
`initial.detailOpen ?? !embedded` instead of `?? true`. Recorded here so the
option is not re-derived later.

### The arithmetic this section got wrong

**Amended after the final review.** Sampling two viewport sizes (1280×720 and
1024×640) hid the actual invariant. The fixed tracks sum to
`70 + sidebarWidth + detailWidth` with no cap, so the `minmax(0, 1fr)` viewer
absorbs any shortfall and then the grid overflows the root `overflow-hidden`. At
**500×720 with default widths — nothing hostile** the viewer track measured 0px
and the detail rail sat at `x=755` inside a 500px viewport, clipped away. Since
that rail is the detail panel's only toggle in embedded mode, recovery required
the left rail. The same state was reachable at 1024px from the share URL
`#!{"sidebarWidth":700,"detailWidth":800}`.

Shipped fix: each panel track is `min(${w}px, calc(40% - 28px))` —
`28 = 0.4 × 70`, so each panel gets `0.4·(W − 70)` and the viewer keeps
`0.2·(W − 70)`. Verified in Chromium across 15 container widths × 3 width pairs:
the right rail's right edge equals the container for every `W ≥ 71`, and the
viewer track is always above zero. 70px is two rails, so that floor is exact and
no expression can do better. The reviewer's initial suggestion of `min(Wpx, 40vw)`
was rejected during implementation because `0.2W − 70 ≤ 0` for `W ≤ 350`;
percentages also beat `vw` here because the grid container is the quantity the
invariant is written in.

Note the cap is **not** inert whenever the panels already fit: it engages below
roughly 970px at the default 360, and at 1280px with hostile 700/800 widths it
clamps both to 484px.

`bottomHeight` already had precisely this live cap (`liveBottomHeightMax`); the
sidebar simply never got one. **Lesson for future plans: state the arithmetic
invariant, not two sample viewport sizes.**

## Architecture

### Unit 1 — `src/hooks/usePanelLayout.ts`: sidebar state

**What it does.** Gains a fourth resizable panel: open flag, persisted width,
bounds, and a pointer-capture drag handler trio plus double-click-to-default.

**How you use it.** Same as the existing three panels — destructure
`sidebarOpen`, `setSidebarOpen`, `sidebarWidth`, `onSidebarResizeDown/Move/Up`,
`onSidebarResizeDoubleClick` from `usePanelLayout(...)`.

**What it depends on.** Nothing new.

```ts
export const SIDEBAR_WIDTH_DEFAULT = 360;
const SIDEBAR_WIDTH_MIN = 280;   // narrowest the Filters cards stay usable
const SIDEBAR_WIDTH_MAX = 700;   // clears mapZebrain's own 440
```

The one thing not to copy-paste wrong: the detail resizer negates its delta
(`d.w - (e.clientX - d.x)`, because the strip is on the panel's *left* edge and
dragging left grows it). The sidebar strip is on its *right* edge, so the delta
is **not** negated: `d.w + (e.clientX - d.x)`.

`outerLayout` becomes mode-dependent, so `usePanelLayout` takes a new
`embedded: boolean` argument:

| mode | `gridTemplateColumns` |
|---|---|
| standalone | `minmax(0, 1fr)` or `minmax(0, 1fr) {detailWidth}px` (unchanged) |
| embedded | `{rail}px {sidebar?}px minmax(0, 1fr) {detail?}px {rail}px` |

A collapsed panel drops its track entirely (as `detailOpen` already does) rather
than animating to zero width; the rails are always present so there is always
something to click.

`mainLayout` keeps its existing two-row form for standalone. In embedded mode the
main column is a single row, so `mainLayout` returns
`gridTemplateRows: 'minmax(0, 1fr)'` — the same value it already produces when
`bottomOpen` is false, which means no new branch is strictly needed there.

### Unit 2 — persistence: `urlState.ts` + `useUrlSync.ts`

The sidebar is "still adjustable in size", and every other panel size in this
codebase rides in the hash (`bh`, `dw`, `uw`, all default-dropped). Doing
anything else would read as a bug the first time someone shares a resized
embedded view.

`urlState.ts` gains two keys alongside the existing layout block
(`urlState.ts:425-433`):

```ts
if (isFiniteNum(raw.sidebarWidth)) {
  out.sidebarWidth = clamp(raw.sidebarWidth, 280, 700);
}
// sidebarOpen: boolean, same treatment as bottomOpen / detailOpen
```

The clamp bounds are duplicated as literals here exactly as the existing three
are — `urlState.ts` deliberately does not import from `usePanelLayout` (it must
stay a pure, DOM-free module). Keeping the duplication consistent with the
precedent beats introducing a shared constants module for two numbers.

`useUrlSync.ts` threads `sidebarWidth` / `sidebarOpen` into the writer with
`sidebarWidthDefault: SIDEBAR_WIDTH_DEFAULT` so a default-sized sidebar
contributes nothing to the hash. Note `embeddedMode` itself is still **not**
persisted (`useUrlSync.ts:151-153`), so a hash carrying a sidebar width simply
has no effect in standalone mode — inert, not broken.

### Unit 3 — `src/App.tsx`: the embedded branch

**What it does.** Chooses between two JSX layouts, hides the header in embedded
mode, renders the two rails, and owns the sidebar's active tab.

Three sub-changes:

**3a. Header → sidebar strip.** In embedded mode the `<header>` is not rendered.
Its four pieces move into a compact strip at the top of the sidebar, above the
tab row, mirroring mapZebrain's `label_dashed_border` "All items" heading:

- Title `WARP Atlas Viewer` (one line, smaller).
- The cell-count line, unchanged text and `title` tooltip.
- `<ExportButton>` and `<LinksMenu>`, unchanged components, as a compact row.
- The Janelia logo moves out to an `absolute bottom-2 right-2` overlay on the 3D
  view (`pointer-events-auto` so the link still works), keeping the attribution
  visible without spending header height on it. It is chrome, so it is hidden
  under `screenshotMode` like the rest.

This buys back the ~56px the header occupies.

**3b. Collapse rails.** Two 35px full-height buttons at the outer edges of the
grid, styled from the table in [What mapZebrain actually does](#what-mapzebrain-actually-does)
(`#111`, `1px solid #000`, hover `#444`, `border-radius: 3px 0 0 3px` mirrored
for the right rail). Left rail toggles `sidebarOpen`, right rail toggles
`detailOpen`; the arrow glyph flips with the state. They replace the `⌄`/`⌃`
bottom-panel handle and the `›`/`‹` detail handle in embedded mode only — those
two buttons keep rendering in standalone mode, so this is a branch, not a
deletion. Both rails render under the existing `!settings.screenshotMode` guard.

**3c. Lifted tab state.** `tab` moves from `FilterControls` local state to App,
because the gear icon (in `BrainViewer`) has to be able to select the Settings
tab. If the sidebar is collapsed when the gear is clicked, it opens first —
otherwise the click looks broken.

The Detail panel, `BrainViewer`, `ColorLegend`, `UmapPanel`, and every hook are
passed exactly the props they get today. This is a layout branch, not a data-flow
change.

### Unit 4 — `src/components/FilterControls.tsx`: the t-SNE tab

**What it does.** Renders a fourth tab whose body is supplied by the caller.

**How you use it.** One new optional prop:

```tsx
/** When provided, a t-SNE tab is rendered second (right of Filters) with this
 *  node as its body, and the filter cards stack in a single column.
 *  ponytail: presence of this prop *is* the sidebar-layout flag — a separate
 *  `layout` prop would be a second source of truth for the same fact. Split
 *  them if a narrow layout ever needs to exist without the t-SNE tab. */
tsneTab?: ReactNode;
```

App keeps owning `UmapPanel` and passes it in as this node, so none of its ten
props are drilled through `FilterControls`. This is the whole reason the prop is
a `ReactNode` and not a `boolean` + ten forwarded props.

Details that matter:

- **Tab list.** `TABS` becomes a function of `tsneTab != null`, inserting
  `{ id: 'tsne', label: 't-SNE' }` at index 1. The `Tab` union gains `'tsne'`,
  and `scrollByTab` gains the matching key — it is a `Record<Tab, number>`, so
  TypeScript will point at it.
- **The t-SNE body must not live inside the scroller.** The existing body is
  `<div className="flex-1 min-h-0 overflow-y-auto p-3">`. `UmapPanel` is
  `w-full h-full` and sizes its canvas from the container's `getBoundingClientRect`
  (`UmapPanel.tsx:78-79`, `341-344`), so inside a scrolling padded box it would
  measure wrong. The t-SNE tab renders in a sibling `flex-1 min-h-0` container
  with no padding and no `overflow-y-auto`.
- **Stacked cards.** The Filters body is currently
  `flex flex-wrap items-stretch gap-x-2 gap-y-2` — tuned for a wide, short
  panel. In sidebar layout it becomes `flex flex-col`, and the `CrossSep` `×`
  dividers are dropped: `CrossSep` uses `self-stretch flex items-center`, which
  in a column stretches horizontally and parks the `×` at the left edge, reading
  as a stray glyph rather than a "these compose" separator. The card titles
  already carry that meaning (per `shared.tsx:18-19`'s own reasoning).
- **`SelectionCard` matters more now.** With t-SNE on another tab, it is the only
  indication on the Filters tab that a lasso is active. It already renders there
  with a clear button when `selection.source === 'umap'`; no change needed, but
  it is now load-bearing.

### Unit 5 — t-SNE viewport survives a tab switch

Switching away from the t-SNE tab unmounts `UmapPanel`. Its `initialViewport`
comes from `INITIAL_URL_STATE?.umap`, which is read **once at module load**
(`App.tsx:75-76`), so a remount would restore the page-load viewport and silently
throw away the user's pan and zoom.

`useUrlSync` already tracks the live viewport in `umapRef`
(`useUrlSync.ts:95`, written by `handleUmapViewportChange` at `299-305`). Return
it, and have App seed:

```tsx
initialViewport={umapRef.current ?? INITIAL_URL_STATE?.umap ?? null}
```

Four lines, no new state, no render cost while the tab is hidden.

The alternative — keeping `UmapPanel` mounted under `display: none` — was
rejected: its draw effect would keep re-rasterising 274k cells on every
filter/coloring change while invisible, and a `display: none` container measures
0×0, so it needs visibility plumbing anyway.

Selection itself is unaffected: `selection` and `lassoPoly` live in App, so a
lasso survives tab switches, reloads, and share links exactly as today.

### Unit 6 — screenshot + gear in the orientation bar

**`ViewOrientationBar.tsx`** gains two buttons after the seven orientation
icons, separated by a small gap. Warp's orientation icons are already `h-8`
(32px), matching mapZebrain's `height="32"`, so the two new icons render at 25px
to preserve mapZebrain's own size relationship
(`three-dview.component.html:34-43`). mapZebrain's own
`screenshot.webp` and `settings.webp` are copied into `images/` alongside the
seven already there, same URL-import pattern.

Two new props: `onCapture: () => void` and `onOpenSettings: () => void`. Both
`e.stopPropagation()` like the existing buttons, since the container div treats a
bare click as focus/unfocus.

**The screenshot needs care.** The canvas is created without
`preserveDrawingBuffer` (`BrainViewer.tsx:279`), so the drawing buffer is cleared
after compositing and a bare `canvas.toDataURL()` returns a blank image.

> **Superseded during planning.** This section originally specified an
> on-demand capture: a component inside `<Canvas>` using `useThree` to register
> a `captureRef` that calls `gl.render(scene, camera)` then `toDataURL()` in one
> tick. That is **wrong in the five projection modes** — `ProjectionRenderPass`
> builds its image across up to four passes per frame in `useFrame`, so
> re-rendering the raw scene would silently produce a different picture than the
> one on screen. The mechanism below replaces it.

Set `preserveDrawingBuffer: true` on the `Canvas`'s `gl` options **in embedded
mode only**, and read the composited back buffer directly:
`containerRef.current.querySelector('canvas').toDataURL('image/png')`, downloaded
as `warp-atlas.png` via a synthetic `<a download>` click. Correct in every mode,
less code than the `captureRef` plumbing, and the per-frame copy cost is confined
to the embedded viewer rather than taxing every user.

The trade-off: `gl` options are read once at `Canvas` creation, so toggling the
Settings checkbox mid-session cannot enable capture. The screenshot button is
therefore gated on the mount-time value of `embeddedMode` (held in a ref beside
the existing `mountCameraRef`), so it never appears in a state where it would
emit a blank PNG. This mirrors the existing documented caveat that toggling
`embeddedMode` mid-session does not move the camera.

Expect — and document — that the PNG contains **only the 3D render**: the colour
legend, the icon bar, the projection pill, and tooltips are DOM overlays and are
absent. mapZebrain's own screenshot has the same property, and warp's existing
`screenshotMode` remains the way to get a clean full-viewport OS-level capture.
mapZebrain supersamples 4× (`take3DScreenshot(4)`); this captures at the current
canvas size. `ponytail:` comment naming supersampling as the upgrade path.

The gear calls App's tab setter with `'settings'`, opening the sidebar first if
collapsed.

**Also in `BrainViewer`:** the scene background becomes `#000000` in embedded
mode to match mapZebrain's clear colour, against warp's `#0a0a0a`
(`BrainViewer.tsx:31`). A 4% luminance difference — cosmetically free, and it
means the iframe's canvas and the host page's canvas match exactly if they are
ever seen side by side.

### Unit 7 — palette, via two CSS variables

`yellow-300` appears at **19 sites across 9 files** (`App.tsx`, `LinksMenu`,
`ExportButton`, `FilterControls`, `AboutTab`, `ColorsCard`, `ActivityCard`,
`SwimCard`, `SettingsTab`). Threading an `embedded` boolean to all nine to pick
an accent would be a large, ugly diff and a permanent tax on every future
component.

Instead, two CSS variables re-pointed by an `embedded` class on App's root div.

> **Refined during planning.** This section originally specified raw
> `border-[var(--accent)]` arbitrary values. That breaks on the four sites using
> an opacity modifier (`ring-yellow-300/60`, `bg-yellow-300/30`): Tailwind cannot
> inject an alpha channel into an opaque `var()`. Register the colour in
> `tailwind.config.ts` with the `<alpha-value>` placeholder instead, backed by a
> space-separated RGB triple.

```ts
// tailwind.config.ts
colors: {
  accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
  panel: 'rgb(var(--panel-rgb) / <alpha-value>)',
}
```

```css
/* globals.css */
:root     { --accent-rgb: 253 224 71; --panel-rgb: 38 38 38; }  /* yellow-300, neutral-800 */
.embedded { --accent-rgb: 255 20 147; --panel-rgb: 17 17 17; }  /* #ff1493, #111 */
```

The call sites become `border-accent`, `text-accent`, `ring-accent/60`,
`accent-accent`, `bg-panel` — a mechanical substitution with no behaviour change
in standalone mode, where the variables resolve to the same colours as today.
15 of the 19 `yellow-300` sites change; see the exclusions below.

Scope limits, deliberate:

- **Pink stays on the 2px tab underline only.** `#ff1493` as *text* on `#111`
  is poor contrast; mapZebrain itself keeps tab labels white
  (`right-menu.component.css:2-20`) and puts the colour in the ink bar. Warp's
  tab labels stay `neutral-100` / `neutral-500`.
- **The resize-handle hover highlight stays yellow** (`bg-yellow-300/30`, three
  sites in `App.tsx`). It is a transient affordance, not brand accent, and
  pink-on-hover reads as an error state.
- **The Export dialog's confirm button stays yellow** (`ExportButton.tsx:191`).
  Its base is `yellow-400`, not `yellow-300`, so re-pointing it would need a
  second variable for no real gain.
- **Colour maps, the legend, and every data colour are untouched.** They are
  tuned against a near-black background and are the scientific content; the host
  site's palette does not get a vote.
- mapZebrain's `#222` + `2px dashed #444` section headers and its
  Barlow-Semi-Condensed font are **not** adopted. The dashed-box heading is
  distinctive enough that copying it into a differently-structured panel would
  look like mimicry rather than continuity, and a webfont is a payload cost for
  a viewer whose whole UI is already monospace.

## Interaction with existing features

**Standalone mode is untouched.** No shared component changes shape: the palette
variables resolve to today's values, `FilterControls` without `tsneTab` renders
exactly three tabs and the wrapped card row, `usePanelLayout` without `embedded`
returns today's `outerLayout`, and the header, both panel handles, and the bottom
row all render as before. The layout branch is the only place the two modes
diverge.

**`screenshotMode` composes.** In embedded mode it hides the icon bar (existing
behaviour), and now also the rails and the Janelia overlay, while the sidebar
resize strip keeps working — matching the documented promise in
`docs/settings.md` that you can set the exact layout while the mode is on.

**Camera, meshes, projection, picking: no change.** Embedded mode's portrait
default camera, the seven presets, and the brain meshes all behave as specified
in the previous spec. The canvas gets a different *size* in embedded mode, which
matters only in that `brainCanvasSize` feeds the auto point-size formulas — an
existing, already-dynamic path (`App.tsx:104-106`, `useColoring`).

**Old share links.** A pre-change hash has no `sidebarWidth` / `sidebarOpen`, so
both fall back to their defaults. A post-change hash opened in standalone mode
ignores them. No migration.

## Testing

1. **`src/utils/urlState.test.ts`** — round-trip `sidebarWidth` / `sidebarOpen`;
   assert out-of-range widths clamp to 280 / 700; assert a default-valued
   sidebar contributes no hash keys. This is the file that already owns the
   equivalent assertions for `bh` / `dw` / `uw`, plus the
   `embeddedMode`-never-restored test at line 476.
2. **`src/hooks/usePanelLayout` — deliberately not unit-tested.** The existing
   suite has no `usePanelLayout` test, and a resizable panel does not justify
   introducing a DOM-hook harness. Note that (1) covers the *restore* clamp in
   `urlState`, which is a different clamp from the *drag* clamp here even though
   they share bounds; neither the drag clamp nor the delta sign gets automated
   coverage. Both fail loudly and visibly — a sidebar that shrinks when dragged
   right, or one that slides past its bound, is impossible to miss — so they are
   covered by the manual checklist instead. Flagged rather than glossed, because
   "the clamp is tested" would be the wrong thing to believe here.
3. **Playwright smoke test** (`tests/`, alongside the existing `test:smoke`) at
   `?embed=1`: the sidebar renders, the header does not, the t-SNE tab exists at
   index 1, clicking it shows a canvas, clicking Filters and returning preserves
   the tab, and the left rail collapses the sidebar.
4. **`npm run check`** must pass. Per `MEMORY.md`, scope eslint to `src` if the
   untracked `notes/` directory trips it.
5. **Manual, headless WebGL harness** — the layout is the deliverable, so it has
   to be looked at. Drive it by URL hash per the existing verification note.

## Manual verification checklist

- Without `?embed=1`: header, bottom panel, t-SNE column, both panel handles,
  and the yellow accents are all exactly as before. Diff a screenshot if unsure.
- `?embed=1`: sidebar on the left, four tabs, no header, rails at both edges.
- Drag the sidebar's right edge: it grows when dragged **right**. Double-click
  snaps to 360.
- Drag it to both bounds: stops at 280 and 700, and the 3D canvas re-fits at
  every width with no clipped brain.
- Collapse the sidebar via the left rail, re-expand: width is preserved.
- Collapse both panels: the 3D view spans the full width between the rails.
- t-SNE tab: lasso a group, switch to Filters, come back — the pan/zoom is where
  you left it and the lasso is still there. The `SelectionCard` on the Filters
  tab shows the count while the t-SNE tab is hidden, and its clear button works.
- t-SNE canvas fills its tab body with no scrollbar and no padding gap, at both
  sidebar bounds.
- Filters tab at 280px: every card is reachable, no horizontal scrollbar, no
  stray `×` glyphs, the long region dropdown still truncates rather than
  overflowing.
- Gear icon selects the Settings tab. With the sidebar collapsed, it opens the
  sidebar *and* selects Settings.
- Screenshot icon downloads a non-blank PNG of the current view. Confirm the
  brain is actually in it (this is the `preserveDrawingBuffer` trap) and that
  the legend/icon-bar are absent as designed.
- Reload a resized embedded view from its share URL: the sidebar width and open
  state restore.
- Open that same URL without `?embed=1`: standalone layout, sidebar keys ignored,
  nothing visibly odd.
- `screenshotMode` on, in embedded mode: rails, icon bar, and Janelia overlay
  hidden; the sidebar resize strip still works.
- In an actual iframe at 1280×720 and at 1024×640: no double scrollbars, no
  clipped sidebar, the 3D view still usable at the narrower width.

## Documentation

- `docs/settings.md` — rewrite the [Embedded mode](../docs/settings.md#embedded-mode)
  section. It currently promises "changes nothing else: no panel, layout, or
  chrome is hidden", which this change makes false. Cover the sidebar, the
  t-SNE tab, the folded header, the rails, the two new icons, and the palette.
- `docs/ui/panels.md` — the embedded layout and the sidebar resizer.
- `docs/ui/tsne.md` — t-SNE as a tab in embedded mode, and the viewport/selection
  persistence across tab switches.
- `docs/ui/viewer.md` — the screenshot and gear icons, and what the PNG does and
  does not contain.
- `docs/sharing.md` — `sidebarWidth` / `sidebarOpen` in the hash;
  `embeddedMode` still not.
- `README.md` — one line in the feature list if embedded mode is mentioned there.

## Parked at merge (found by the final review, deliberately not fixed)

Both are pre-existing weaknesses that the new width cap makes reachable by
window size rather than only by dragging. Both were rated Minor and neither
blocks the feature; recorded here because the run ledger they were found in is
scratch.

- **The sidebar tab bar clips below ~780px.** `FilterControls.tsx`'s tab row has
  `overflow-x: visible` inside the sidebar's `overflow-hidden`, and a fixed
  284px min-content width. Measured at a 500px viewport (sidebar 172px), the
  **Settings** and **About** tabs are clipped and unclickable; at 640px **About**
  is. Note 284px already exceeds the documented 280px drag minimum, so a user
  could clip **About** by dragging even before this change — the plan picked 280
  without measuring what the tab row needs. Fix is one class
  (`overflow-x-auto`), but it touches standalone DOM, which is why it was not
  folded into a feature whose central constraint is that standalone does not
  move.
- **The resize strip goes silently inert below ~770px.** Rendered width is
  `min(state, cap)`, and the whole `[280, 700]` state range sits above the cap
  there, so dragging and double-click-to-reset have no visible effect. The
  dragged value is preserved and reappears when there is room. Documented in
  `docs/settings.md` and `docs/ui/panels.md`; worth a comment beside
  `panelTrack` naming the ceiling.

## Future work (not this change)

- `postMessage` bridge: mapZebrain's selected region driving warp's Anatomy
  filter, warp's focused cell reported back. Still the natural seam, still wants
  its own spec.
- Detail panel collapsed by default in embedded mode, if 490px for the 3D view
  proves too tight in practice. One line, see
  [Layout arithmetic](#layout-arithmetic).
- 4× supersampled screenshot, matching mapZebrain's `take3DScreenshot(4)`.
- Redesigning the Filters cards for a narrow column rather than merely making
  them survive it — e.g. collapsible sections in mapZebrain's accordion idiom,
  which would suit 280px far better than a stack of full-width cards.
- Retiring the bottom panel and using the sidebar everywhere, if the embedded
  layout proves better in use. That is the option declined at the top of this
  spec, and it becomes cheap once the sidebar has been in front of users.
