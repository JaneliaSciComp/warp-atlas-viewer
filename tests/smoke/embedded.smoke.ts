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

  // 26px arrow to match mapZebrain's own rails, inside the 35px track.
  const arrow = await page.getByTestId('rail-sidebar').locator('svg').boundingBox();
  expect(Math.round(arrow!.width)).toBe(26);
  expect(arrow!.width).toBeLessThan(leftRail!.width);

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

  // The other three collapse combinations, for the same reason: grid children
  // are auto-placed with no explicit col-start, so the child count has to
  // match the track count outerGridTemplate emits. Get that wrong and every
  // child lands one column left — the visible symptom is a rail leaving its
  // viewport edge, which is what these measure.
  const width = page.viewportSize()!.width;
  const railsAtEdges = async (why: string) => {
    const left = (await page.getByTestId('rail-sidebar').boundingBox())!;
    const right = (await page.getByTestId('rail-detail').boundingBox())!;
    expect(Math.round(left.width), `left rail width, ${why}`).toBe(35);
    expect(Math.round(right.width), `right rail width, ${why}`).toBe(35);
    expect(Math.round(left.x), `left rail at the left edge, ${why}`).toBe(0);
    expect(Math.round(right.x + right.width), `right rail at the right edge, ${why}`).toBe(width);
  };
  await railsAtEdges('both panels open');
  await page.getByTestId('rail-detail').click();
  await expect(page.locator('aside')).toHaveCount(0);
  await railsAtEdges('detail collapsed');
  await page.getByTestId('rail-sidebar').click();
  await expect(page.getByTestId('embedded-sidebar')).toHaveCount(0);
  await railsAtEdges('both collapsed');
});

test('screenshot mode drops the rails and their tracks, leaving no gutters', async ({
  page,
}) => {
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('screenshot mode').check();

  // No rails, and — the point of this case — no placeholder children holding
  // empty 35px tracks either: those had no background and painted two
  // neutral-900 gutters into the mode meant for a clean capture.
  await expect(page.getByTestId('rail-sidebar')).toHaveCount(0);
  await expect(page.getByTestId('rail-detail')).toHaveCount(0);
  const tracks = await page
    .locator('div.flex-1.grid')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  expect(tracks.split(' ')).toHaveLength(3);

  // Three tracks, three children, flush to both edges.
  const width = page.viewportSize()!.width;
  const sidebar = (await page.getByTestId('embedded-sidebar').boundingBox())!;
  const detail = (await page.locator('aside').boundingBox())!;
  expect(Math.round(sidebar.x)).toBe(0);
  expect(Math.round(detail.x + detail.width)).toBe(width);
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

test('embedded mode folds the header into the sidebar', async ({ page }) => {
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  // No page-level header row: the host page supplies one.
  await expect(page.locator('header')).toHaveCount(0);

  // Title, cell count, and Links all live in the sidebar instead. (Export is
  // the exception — it moved onto the orientation bar; see the export test.)
  const header = page.getByTestId('sidebar-header');
  await expect(header.getByRole('heading', { name: 'WARP Atlas Viewer' })).toBeVisible();
  await expect(header.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible();
  const links = header.getByRole('button', { name: /^Links/ });
  await expect(links).toBeVisible();
  // Links is a hamburger left of the title block, the way a site nav carries
  // one — not a labelled button in a row of its own beneath it. Its accessible
  // name comes from aria-label, so it has no text of its own.
  await expect(links).toHaveText('');
  const linksBox = (await links.boundingBox())!;
  const titleBox = (await header.getByRole('heading').boundingBox())!;
  expect(linksBox.x + linksBox.width).toBeLessThanOrEqual(titleBox.x + 1);
  expect(linksBox.y).toBeGreaterThan(titleBox.y - linksBox.height);

  // The Janelia logo moves onto the 3D view rather than disappearing.
  await expect(
    page.getByRole('link', { name: 'Janelia Research Campus' }),
  ).toBeVisible();
});

test('the t-SNE tab holds the plot and survives a tab round-trip', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  const sidebar = page.getByTestId('embedded-sidebar');
  // Four tabs, t-SNE second. `exact` because getByRole matches the accessible
  // name as a SUBSTRING: the Filters tab's selection card carries a "View t-SNE"
  // button, so the loose form is ambiguous here.
  await expect(sidebar.getByRole('button', { name: 't-SNE', exact: true })).toBeVisible();

  // On the Filters tab there is exactly one canvas — the 3D view. The t-SNE
  // canvas is unmounted, which is the behaviour the viewport-reseed below
  // exists to make safe.
  await expect(page.locator('canvas')).toHaveCount(1);

  await sidebar.getByRole('button', { name: 't-SNE', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(2);

  // The t-SNE canvas must fill the tab body, not sit in a padded scroller.
  // Scope the locator to the sidebar rather than indexing the page's
  // canvases: in embedded mode the sidebar precedes the viewer in DOM
  // order, so the t-SNE canvas is nth(0) and the 3D canvas is nth(1) —
  // an index-based selector here silently asserts a lower bound on the
  // wrong canvas and would pass through a real t-SNE sizing regression.
  const body = await sidebar.boundingBox();
  const tsne = await sidebar.locator('canvas').boundingBox();
  // Measured real-world gap at both sidebar bounds is ~1px (border only —
  // see task-6-report.md); 10px leaves headroom without hiding a real
  // padded-scroller regression the way the original 40px margin did.
  expect(tsne!.width).toBeGreaterThan(body!.width - 10);

  // The viewport must survive the round trip too — this is the entire
  // reason this task exists (see the initialViewport reseed in App.tsx).
  // Change it away from its default first: comparing two default
  // viewports would pass even if the reseed were deleted outright.
  //
  // The observable is UmapPanel's own "reset view" button, not the URL
  // hash: onViewportChange deliberately skips firing on a component's
  // first effect tick (so a URL-restored viewport doesn't immediately
  // overwrite itself), which means a wrongly-reseeded remount never
  // reports its (wrong) viewport back up — the hash would keep showing
  // the last real value from before the switch either way, so it can't
  // tell a correct reseed from a broken one. "reset view" only renders
  // while `viewport` (the exact state `initialViewport` seeds) is
  // non-default, so it directly reflects what the remounted panel
  // actually has, not what App last heard about.
  await page.mouse.move(tsne!.x + tsne!.width / 2, tsne!.y + tsne!.height / 2);
  await page.mouse.wheel(0, -400); // zoom in
  await page.keyboard.down('Shift'); // shift+drag = pan (plain drag = lasso)
  await page.mouse.down();
  await page.mouse.move(tsne!.x + tsne!.width / 2 + 60, tsne!.y + tsne!.height / 2 + 30, {
    steps: 5,
  });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(sidebar.getByRole('button', { name: 'reset view' })).toBeVisible();

  await sidebar.getByRole('button', { name: 'Filters' }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await sidebar.getByRole('button', { name: 't-SNE', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(2);
  // The panel just remounted. If it reseeded from the frozen page-load
  // URL value instead of the live viewport ref, `viewport` would be back
  // to default and this button would be gone.
  await expect(sidebar.getByRole('button', { name: 'reset view' })).toBeVisible();

  await page.waitForTimeout(250);
  expect(pageErrors).toEqual([]);
});

test('standalone keeps the t-SNE panel docked, with no t-SNE tab', async ({ page }) => {
  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  // Both canvases visible at once, and no tab button for t-SNE. Deliberately
  // NOT `exact` here, unlike the embedded lookups above: as a substring match
  // this asserts standalone has no t-SNE *button of any kind*, which covers the
  // embedded-only "View t-SNE" leaking in as well as the tab itself.
  await expect(page.locator('canvas')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 't-SNE' })).toHaveCount(0);

  // The t-SNE viewport also survives a bottom-panel collapse here. Standalone
  // unmounts UmapPanel on collapse just as the embedded tab switch does, and
  // the initialViewport reseed (App.tsx) is shared by both layout branches —
  // so this is standalone behaviour that differs from before the sidebar work
  // and needs pinning, deliberate improvement or not.
  //
  // Scope by the panel's own resize strip rather than a canvas index, and use
  // the "reset view" button as the observable rather than the URL hash:
  // UmapPanel skips onViewportChange on its first effect tick, so a
  // wrongly-reseeded remount never reports its (default) viewport back up and
  // the hash keeps showing the pre-collapse value either way. See the
  // embedded round-trip test above.
  const tsneColumn = page.locator('div:has(> [aria-label="Resize t-SNE panel"])');
  const tsne = (await tsneColumn.locator('canvas').boundingBox())!;
  await page.mouse.move(tsne.x + tsne.width / 2, tsne.y + tsne.height / 2);
  await page.mouse.wheel(0, -400); // zoom in
  await page.keyboard.down('Shift'); // shift+drag = pan (plain drag = lasso)
  await page.mouse.down();
  await page.mouse.move(tsne.x + tsne.width / 2 + 60, tsne.y + tsne.height / 2 + 30, {
    steps: 5,
  });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(tsneColumn.getByRole('button', { name: 'reset view' })).toBeVisible();

  await page.getByRole('button', { name: 'hide bottom panel' }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'show bottom panel' }).click();
  await expect(page.locator('canvas')).toHaveCount(2);
  await expect(tsneColumn.getByRole('button', { name: 'reset view' })).toBeVisible();
});

test('the gear icon opens the Settings tab', async ({ page }) => {
  // Wider than the 1280 default: with both panels open at 1280 the viewer is
  // ~490px, below MIN_VIEWER_WIDTH_FOR_BAR, so the whole icon bar — gear
  // included — is deliberately hidden. See the orientation-bar test above.
  await page.setViewportSize({ width: 1500, height: 860 });
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
  // Wider than the 1280 default so the icon bar is above its width gate — at
  // 1280 with both panels open the bar, and so the screenshot button, is
  // hidden. See the orientation-bar test above.
  await page.setViewportSize({ width: 1500, height: 860 });
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

test('standalone and embedded resolve the tab-underline accent to their own palettes', async ({
  page,
}) => {
  // The class on the active tab button is `border-accent` in both modes —
  // only the CSS variable it resolves through differs. Asserting on the
  // class name would pass even if the Tailwind alias failed to compile or
  // a channel triple were mistyped (both leave the class attribute intact
  // and silently fall back to the browser default border colour), so this
  // reads the resolved colour instead.
  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  const standaloneAccent = await page
    .getByRole('button', { name: 'Filters', exact: true })
    .evaluate((el) => getComputedStyle(el).borderBottomColor);
  // yellow-300 — must be unchanged from what standalone users see today.
  expect(standaloneAccent).toBe('rgb(253, 224, 71)');

  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  const embeddedAccent = await page
    .getByRole('button', { name: 'Filters', exact: true })
    .evaluate((el) => getComputedStyle(el).borderBottomColor);
  // mapZebrain's .mat-ink-bar pink.
  expect(embeddedAccent).toBe('rgb(255, 20, 147)');
});

test('links resolve to their own colour, separate from the accent', async ({ page }) => {
  // --link-rgb is deliberately NOT --accent-rgb in embedded mode: pink works
  // on a tab underline but reads badly as body-text link colour on #111, so
  // links use mapZebrain's brand orange instead. Two variables, one class
  // each — a regression that collapsed them back into one would leave both
  // class attributes intact, so this reads resolved colour.
  const linkColour = (p: typeof page) =>
    p.locator('a.text-link').first().evaluate((el) => getComputedStyle(el).color);

  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'About', exact: true }).click();
  // Standalone links must be unchanged from what users see today: yellow-300,
  // the same value as the accent there.
  expect(await linkColour(page)).toBe('rgb(253, 224, 71)');

  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'About', exact: true }).click();
  expect(await linkColour(page)).toBe('rgb(252, 172, 69)'); // mapZebrain #fcac45
});

test('embedded mode enables the brain outline by default, and the hash can still turn it off', async ({
  page,
}) => {
  // The outline is anatomical context mapZebrain's own 3D view always shows.
  // It is applied as a *default* rather than an override, so it has to be
  // spread BEFORE the URL hash in INITIAL_SETTINGS_STATE — this setting is
  // persisted, unlike embeddedMode. Swapping the two spread orders would make
  // a shared link's explicit "off" silently revert to on, which is what the
  // second half of this test pins.
  const outline = (p: typeof page) => p.getByLabel(/outline/i).first();

  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(outline(page)).toBeChecked();

  // Standalone is untouched — the mesh is opt-in there, as before.
  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(outline(page)).not.toBeChecked();

  const off = '#!' + encodeURIComponent(JSON.stringify({ settings: { brainOutline: false } }));
  await page.goto(`/?mock=1&embed=1${off}`);
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(outline(page)).not.toBeChecked();
});

test('the orientation bar renders at full size or collapses to a menu', async ({ page }) => {
  // The bar is a centred overlay in a column the sidebar and detail panel
  // squeeze. The failure mode it must avoid is flex-shrinking its own icons to
  // half width (what `w-max` prevents), so: full width, or the collapsed
  // hamburger. Running under the colour legend is now allowed — see the
  // stacking check below — which is what lets the row survive down to 384px.
  const bar = page.getByTestId('view-orientation-bar');
  const menu = page.getByTestId('view-orientation-menu');

  // 1500 wide → ~710px viewer, above the gate.
  await page.setViewportSize({ width: 1500, height: 860 });
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  await expect(bar).toBeVisible();
  const shown = (await bar.boundingBox())!;
  // Natural width is 367.5px (BAR_NATURAL_WIDTH_PX rounds it to 368); anything
  // materially under it means the flex items shrank and every icon is distorted.
  expect(shown.width).toBeGreaterThan(363);
  // Icons keep their own aspect ratio, so the row is NOT ten equal widths —
  // the two vertical-sagittal tiles are ~17px against the camera's 32px.
  const iconWidths = await bar.locator('img').evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().width)),
  );
  expect(iconWidths).toHaveLength(10);
  expect(Math.min(...iconWidths)).toBeLessThan(20);
  expect(Math.max(...iconWidths)).toBe(32);

  // Everything below resizes the SAME page rather than reloading. That matters:
  // BrainViewer is behind React.lazy, so after a fresh goto a `toHaveCount(0)`
  // assertion passes instantly against a viewer that has not mounted yet — it
  // races rather than testing the gate. Resizing live means each assertion runs
  // from a state where the opposite was just true, so a transition has to
  // actually happen.

  // ~600px viewer: above the gate, but HALF of it (300px) is under the bar's
  // 368px natural width. That band is the only place the shrink bug is
  // reachable, so it is what makes `w-max` load-bearing — at 1500 there is
  // already enough room and the width assertion above passes either way.
  // Viewer width is `vw - 70 - sidebarWidth - detailWidth` = `vw - 843` at the
  // embedded defaults (35px rails ×2, sidebar 360, detail 413), so 1450 gives
  // ~607. Recompute if either panel default moves: widening the detail panel
  // from 360 to 413 is exactly what pushed the previous 1390 below the gate.
  await page.setViewportSize({ width: 1450, height: 860 });
  await expect(bar).toBeVisible();
  expect((await bar.boundingBox())!.width).toBeGreaterThan(363);

  // ~397px viewer: the band where the row's right end reaches into the
  // top-right corner the colour legend used to occupy. This is the band the old
  // `barWidth + 215` gate blanked out, so a regression to it fails here rather
  // than somewhere cosmetic.
  await page.setViewportSize({ width: 1240, height: 800 });
  await expect(bar).toBeVisible();
  await expect(menu).toHaveCount(0);
  const tucked = (await bar.boundingBox())!;
  expect(tucked.width).toBeGreaterThan(363);

  // Nothing covers the row: at a point inside its right end, the topmost element
  // IS one of the row's buttons. This test used to assert the opposite — the
  // legend sat here and won the paint, which is what let the row survive down to
  // this width instead of being hidden. Embedded mode now anchors the legend
  // lower-left, so the screenshot / export / gear trio is clickable again. The
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

  // ~307px viewer: too narrow for the row, so it becomes one hamburger. The row
  // was visible a moment ago, so this is a real transition.
  await page.setViewportSize({ width: 1150, height: 800 });
  await expect(bar).toHaveCount(0);
  await expect(menu).toBeVisible();

  // Hover reveals the same ten icons as a vertical list, and a pick closes it.
  const popup = page.getByTestId('view-orientation-popup');
  await expect(popup).toHaveCount(0);
  await menu.hover();
  await expect(popup).toBeVisible();
  const popupBox = (await popup.boundingBox())!;
  expect(await popup.locator('img').count()).toBe(10);
  // Vertical, not a wrapped row: ten 32px-tall icons cannot stack in anything
  // like the row's 368px width.
  expect(popupBox.height).toBeGreaterThan(popupBox.width * 3);

  // A pick has to APPLY, not just dismiss. Asserting only that the menu closed
  // is what let a version ship where every icon in it did nothing: the close
  // came from an ancestor's capture handler, which ran and looked right while
  // unmounting the button before its own onClick could fire. So this reads the
  // camera the click is supposed to move — the default view sits on +Z and
  // coronal on +X, so which axis dominates is the whole assertion.
  const camDominantAxis = () =>
    page.evaluate(() => {
      const raw = decodeURIComponent(location.hash).replace(/^#!?/, '');
      try {
        const pos = JSON.parse(raw).camera?.pos as number[] | undefined;
        if (!pos) return null;
        return Math.abs(pos[0]) > Math.abs(pos[2]) ? 'x' : 'z';
      } catch {
        return null;
      }
    });
  expect(await camDominantAxis()).toBe('z');
  await popup.getByTitle('Coronal').click();
  await expect(popup).toHaveCount(0);
  // Polled, not read once: the hash write is debounced behind the camera settle.
  await expect
    .poll(camDominantAxis, { timeout: 5_000 })
    .toBe('x');

  // Collapsing a panel widens the viewer past the gate, so the row comes back —
  // the gate tracks the viewer, not the window.
  await page.getByTestId('rail-detail').click();
  await expect(bar).toBeVisible();
  await expect(menu).toHaveCount(0);
  expect((await bar.boundingBox())!.width).toBeGreaterThan(363);
});

test('the region select fits its card at the narrowest sidebar', async ({ page }) => {
  // The trigger sizes itself to the longest option, not the selected one, so
  // before this was capped it reserved 15rem and pushed the row out of the
  // Anatomy card. Checked at the sidebar's 280px minimum, which is the worst
  // case, and with a region actually selected rather than the default "all".
  const sidebarWidth = 280;
  const hash = '#!' + encodeURIComponent(JSON.stringify({ sidebarWidth }));
  await page.goto(`/?mock=1&embed=1${hash}`);
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  const row = page.locator('label:has(button[aria-label="next region"])').first();
  const card = page.locator('div.rounded:has(button[aria-label="next region"])').first();
  const trigger = row.locator('button[aria-haspopup="listbox"]');
  await row.locator('button[aria-label="next region"]').click();

  const rowBox = (await row.boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  // Card padding is px-2.5, so content has to stop 10px inside its right edge.
  // This is guarded by the max-w-full / min-w-0 chain in SearchSelect, which
  // lets the trigger give way — NOT by truncateClass, which only decides how
  // wide it tries to be when there is room.
  expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width - 10 + 1);

  // And it has to be compact, not merely non-overflowing: the trigger used to
  // reserve 15rem for the longest option even when a short one was selected.
  // This half is what truncateClass guards.
  const triggerBox = (await trigger.boundingBox())!;
  expect(triggerBox.width).toBeLessThan(160);

  // The trigger shows the bare abbreviation; the full "Abbr — Full name" stays
  // in the tooltip and the dropdown. Asserting on the em-dash separator rather
  // than a specific region keeps this independent of the mock's region list.
  const visible = (await trigger.locator('span.truncate').innerText()).trim();
  expect(visible).not.toContain('—');
  expect(await trigger.getAttribute('title')).toContain('—');
  expect(visible.length).toBeGreaterThan(0);
  // …and that abbreviation is the prefix of the full name, so the two agree.
  expect(await trigger.getAttribute('title')).toContain(visible);

  // The 112-region mapZebrain atlas is the case that actually stresses width:
  // its names have no abbreviated form, so there is no shortLabel to fall back
  // on and the trigger has to cap and truncate. Everything above passes on the
  // manuscript atlas whether or not the cap works, because the abbreviations
  // are short — so this half is where the cap and the shrink chain are
  // load-bearing. The mock's atlas region 0 is deliberately as long as the
  // longest real name.
  await page.locator('button').filter({ hasText: /^mapZebrain$/ }).first().click();
  await expect(row.locator('button[aria-label="next region"]')).toBeVisible();
  await row.locator('button[aria-label="next region"]').click();

  const atlasRow = (await row.boundingBox())!;
  const atlasCard = (await card.boundingBox())!;
  expect(atlasRow.x + atlasRow.width).toBeLessThanOrEqual(
    atlasCard.x + atlasCard.width - 10 + 1,
  );
  // Long name present in full in the tooltip, ellipsised in the trigger.
  const atlasVisible = trigger.locator('span.truncate');
  expect(await atlasVisible.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(true);
  expect((await trigger.getAttribute('title'))!.length).toBeGreaterThan(20);

  // Compactness has to be checked where nothing is squeezing the control,
  // otherwise the shrink chain masks the cap: in the narrow sidebar each of the
  // two mechanisms alone keeps the row inside the card, so neither shows up as
  // load-bearing. The wide standalone bottom panel has room to spare, so the
  // width here is the cap's doing and nothing else's.
  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  await page.locator('button').filter({ hasText: /^mapZebrain$/ }).first().click();
  const wideTrigger = page
    .locator('label:has(button[aria-label="next region"])')
    .first()
    .locator('button[aria-haspopup="listbox"]');
  await expect(wideTrigger).toBeVisible();
  expect((await wideTrigger.boundingBox())!.width).toBeLessThan(160);
});

test('the links dropdown opens inside the sidebar, not under the collapse rail', async ({
  page,
}) => {
  // The header places this button near the viewport's right edge, so its menu
  // is right-anchored there. The embedded sidebar places it near the LEFT edge
  // of a ~360px column, where right-anchoring ran the menu out of the sidebar
  // and underneath the collapse rail. Hence the per-call-site `align` prop.
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  // Hover, not click: mouseEnter opens the menu, so a click would toggle it
  // straight back shut.
  const button = page.getByRole('button', { name: /^Links/ });
  await button.hover();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  const b = (await button.boundingBox())!;
  const m = (await menu.boundingBox())!;
  const sidebar = (await page.getByTestId('embedded-sidebar').boundingBox())!;
  expect(Math.abs(m.x - b.x)).toBeLessThanOrEqual(1);
  expect(m.x).toBeGreaterThanOrEqual(sidebar.x);
  expect(m.x + m.width).toBeLessThanOrEqual(sidebar.x + sidebar.width + 1);
  // Hit-test the menu so a clipped-but-laid-out menu cannot pass.
  await expect(menu.locator('a').first()).toBeVisible();

  // Standalone keeps right-anchoring: left-anchoring there would run the menu
  // off the right edge of the viewport.
  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  const sBtn = page.getByRole('button', { name: /^Links/ });
  await sBtn.hover();
  await expect(page.getByRole('menu')).toBeVisible();
  const sb = (await sBtn.boundingBox())!;
  const sm = (await page.getByRole('menu').boundingBox())!;
  expect(Math.abs(sm.x + sm.width - (sb.x + sb.width))).toBeLessThanOrEqual(1);
});

test('the embedded links menu leads back to the full viewer, carrying the view', async ({
  page,
}) => {
  // A distinctive width so the hash cannot be mistaken for a default one.
  await page.goto('/?mock=1&embed=1#!' + encodeURIComponent(JSON.stringify({ sidebarWidth: 420 })));
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /^Links/ }).hover();
  const first = page.getByRole('menu').locator('a').first();
  await expect(first).toHaveText(/Open full viewer/);
  const href = new URL((await first.getAttribute('href'))!);

  expect(href.searchParams.has('embed')).toBe(false);
  expect(href.searchParams.get('mock')).toBe('1');
  // The view travels in the hash, so dropping it would land the new tab on a
  // default view instead of this one.
  expect(decodeURIComponent(href.hash)).toContain('"sidebarWidth":420');
  expect(href.hash).toBe(new URL(page.url()).hash);
  await expect(first).toHaveAttribute('target', '_blank');

  // Standalone has no such entry — it IS the full viewer.
  await page.goto('/?mock=1');
  await page.getByRole('button', { name: /^Links/ }).hover();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menu').getByText(/Open full viewer/)).toHaveCount(0);
});

test('embedded mode opens the detail panel wider, and agrees with the URL writer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const width = async () => Math.round((await page.locator('aside').boundingBox())!.width);

  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  expect(await width()).toBe(413);

  // The hook's default, the double-click reset, and the URL writer's
  // default-drop all have to be the same number. If the writer still thought
  // 360 was the default, every embedded URL would carry detailWidth=413 as
  // though the user had dragged it, and dragging to 360 would not persist.
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await page.waitForTimeout(600);
  const hash = decodeURIComponent(await page.evaluate(() => location.hash));
  expect(hash).not.toContain('detailWidth');

  // Double-click resets to the embedded default, not the standalone one. This
  // navigates the same document to a different hash, which App handles by
  // reloading so the new hash is read at module load — safe now that a write in
  // flight can no longer land on top of it (see the pasted-hash test below).
  await page.goto(
    '/?mock=1&embed=1#!' + encodeURIComponent(JSON.stringify({ detailWidth: 600 })),
  );
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  await expect(async () => expect(await width()).toBe(600)).toPass({ timeout: 10_000 });
  await page.locator('[aria-label="Resize detail panel"]').dblclick();
  await expect(async () => expect(await width()).toBe(413)).toPass({ timeout: 5_000 });

  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  expect(await width()).toBe(360);
});

test('a pasted hash is not overwritten by a write already in flight', async ({ page }) => {
  // Assigning location.hash does NOT dispatch hashchange synchronously. So a
  // debounced URL write in flight runs first and replaceStates the app's own
  // state over the hash the user just pasted; the hashchange handler then
  // reloads and restores the wrong state. The handler cannot prevent this —
  // by the time it runs, location.hash is the app's value again. writeUrlNow
  // refusing to overwrite a hash it did not write is what closes the window.
  //
  // Holding a drag across the paste is what makes this deterministic: it keeps
  // writes being scheduled, and past the 250ms burst cap scheduleUrlWrite calls
  // the writer synchronously, which no clearTimeout in the handler would catch.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1800);

  const strip = (await page.locator('[aria-label="Resize detail panel"]').boundingBox())!;
  await page.mouse.move(strip.x + 3, strip.y + 200);
  await page.mouse.down();
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(strip.x - i * 12, strip.y + 200);
    await page.waitForTimeout(70);
  }
  // Paste mid-drag.
  await page.evaluate(() => {
    window.location.hash = '!' + encodeURIComponent(JSON.stringify({ detailWidth: 600 }));
  });
  for (let i = 5; i < 12; i++) {
    await page.mouse.move(strip.x - i * 12, strip.y + 200);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();

  // The reload the handler triggers must land on the pasted width, not on the
  // width the drag was producing.
  await expect(async () =>
    expect(Math.round((await page.locator('aside').boundingBox())!.width)).toBe(600),
  ).toPass({ timeout: 10_000 });
});

test('embedded mode hides 3D ghosts by default, and the hash can put them back', async ({
  page,
}) => {
  // `showGhosts` is the auto-sizing-compatible way to get ghostIntensity 0.
  // Pixels are the only honest assertion here: the checkbox state says nothing
  // about whether the out-of-filter cells actually stopped being drawn, and the
  // hide happens in the 3D buffer upload (usePointCloudBufferUploads), not in
  // the shared coloring the checkbox feeds.
  //
  // Isolating fish 0 ghosts two thirds of the mock population, and the brain
  // outline is turned off in both runs so the only thing that can move the
  // pixel count is the ghosts.
  const view = (settings: Record<string, unknown>) =>
    '/?mock=1&embed=1#!' +
    encodeURIComponent(
      JSON.stringify({
        filter: { isolatedFish: 0 },
        settings: { brainOutline: false, ...settings },
      }),
    );
  // Embedded canvases are created with preserveDrawingBuffer, so the drawn
  // frame survives long enough to copy into a 2D canvas and read back. The
  // t-SNE canvas is 2D and always readable.
  //
  // The threshold is relative to the corner pixel: the t-SNE canvas paints a
  // panel background (channel sum 30), so an absolute floor counts every pixel
  // in it and the ghost assertion below becomes vacuous. +2 over background is
  // what makes the faintest ghost tier countable.
  const litPixels = async (selector = 'canvas') =>
    page.evaluate((sel) => {
      const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>(sel));
      const src = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
      const off = document.createElement('canvas');
      off.width = src.width;
      off.height = src.height;
      const ctx = off.getContext('2d')!;
      ctx.drawImage(src, 0, 0);
      const px = ctx.getImageData(0, 0, off.width, off.height).data;
      const background = px[0] + px[1] + px[2];
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] + px[i + 1] + px[i + 2] > background + 2) lit++;
      }
      return lit;
    }, selector);
  // Reads the 3D view, then the t-SNE tab's scatter for the same state.
  const bothViews = async () => {
    await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    const brain = await litPixels();
    await page.getByRole('button', { name: 't-SNE', exact: true }).click();
    await expect(page.getByTestId('tsne-canvas')).toBeVisible();
    await page.waitForTimeout(500);
    return { brain, tsne: await litPixels('[data-testid="tsne-canvas"]') };
  };

  await page.goto(view({ showGhosts: true }));
  const withGhosts = await bothViews();

  await page.goto(view({}));
  const embeddedDefault = await bothViews();

  // Sanity: the in-filter third of the brain is still drawn either way.
  expect(embeddedDefault.brain).toBeGreaterThan(1000);
  // The ghost haze is the bulk of the lit area (measured ~14.0k lit with ghosts
  // against ~5.8k without), so losing it has to show up as a large drop — not
  // the few-percent wobble a no-op change would produce.
  expect(embeddedDefault.brain).toBeLessThan(withGhosts.brain * 0.6);
  // The t-SNE panel keeps its own umapGhostIntensity (docs/settings.md: the two
  // ghost controls do not interact). That independence is exactly why the hide
  // lives in the 3D buffer upload instead of applyColoring: zeroing the ghost
  // alphas in the shared coloring instead measures 28.6k → 19.3k lit here,
  // because the t-SNE panel derives its ghost alpha by scaling the 3D one.
  expect(embeddedDefault.tsne).toBeGreaterThan(withGhosts.tsne * 0.98);

  // Standalone keeps ghosts: same hash, no ?embed=1.
  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('show ghosts')).toBeChecked();
});

test('embedded mode exports from the orientation bar, not the sidebar', async ({ page }) => {
  // Wide enough for the bar to clear its width gate — at the default 1280 the
  // viewer column is ~437px and the bar is hidden entirely.
  await page.setViewportSize({ width: 1500, height: 860 });
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });

  // The sidebar strip keeps Links only; Export is an icon on the bar now, so
  // an export path that still lived here would be a second entry point.
  const header = page.getByTestId('sidebar-header');
  await expect(header.getByRole('button', { name: /export/i })).toHaveCount(0);
  await expect(header.getByRole('button', { name: /links/i })).toBeVisible();

  const bar = page.getByTestId('view-orientation-bar');
  await expect(bar).toBeVisible();
  // Between the screenshot icon and the gear, per mapZebrain's ordering of the
  // trailing tool icons.
  const labels = await bar
    .locator('button')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(labels.slice(-3)).toEqual(['3D view screenshot', 'Export cells', '3D view settings']);

  // Every tile is opaque black artwork, so the buttons carry no resting
  // background: a grey one shows as a thin ring in the 2px of padding around
  // each icon, which is what it looked like before. Measured with the pointer
  // parked off the bar, since hover deliberately does paint a background.
  await page.mouse.move(0, 0);
  const backgrounds = await bar
    .locator('button')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect([...new Set(backgrounds)]).toEqual(['rgba(0, 0, 0, 0)']);

  await bar.getByRole('button', { name: 'Export cells' }).click();
  await expect(page.getByRole('heading', { name: 'Export cells to CSV' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible();
  // Escape still closes it. The dialog no longer owns the state that opens it,
  // so its close path runs through the caller's callback.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

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

test('the t-SNE selection card is always present, empty or populated', async ({ page }) => {
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

  // And the populated branch still works — asserting only the empty state would
  // pass just as well against a card hard-wired to say `none`. Standalone,
  // because its t-SNE panel is on screen without a tab switch. Plain drag =
  // lasso (the pan gesture is shift+drag), swept wide enough to enclose cells
  // wherever the mock scatter happens to sit.
  const tsne = (await page.getByTestId('tsne-canvas').boundingBox())!;
  const at = (fx: number, fy: number) =>
    [tsne.x + tsne.width * fx, tsne.y + tsne.height * fy] as const;
  await page.mouse.move(...at(0.1, 0.1));
  await page.mouse.down();
  await page.mouse.move(...at(0.9, 0.1), { steps: 5 });
  await page.mouse.move(...at(0.9, 0.9), { steps: 5 });
  await page.mouse.move(...at(0.1, 0.9), { steps: 5 });
  await page.mouse.up();
  await expect(readout).toHaveText(/^[\d,]+ cells$/);
  // Two clear affordances, and this is the card's own — the t-SNE panel header
  // carries a second one with the same accessible name.
  const cardClear = page
    .locator('div.rounded')
    .filter({ has: page.getByText('t-SNE selection', { exact: true }) })
    .getByRole('button', { name: 'clear selection' });
  await expect(cardClear).toBeVisible();
  await cardClear.click();
  await expect(readout).toHaveText('none');
  await expect(cardClear).toHaveCount(0);
});

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
