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
  await sidebar.getByRole('button', { name: 't-SNE' }).click();
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
  // Both canvases visible at once, and no tab button for t-SNE.
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

test('the orientation bar renders at full size or not at all', async ({ page }) => {
  // The bar is a centred overlay in a column the sidebar and detail panel
  // squeeze. Two failure modes it must avoid: flex-shrinking its own icons to
  // half width (what `w-max` prevents), and running under the colour legend at
  // top-right (what the width gate prevents). So: full width, or absent.
  const bar = page.getByTestId('view-orientation-bar');

  // 1500 wide → ~710px viewer, above the gate.
  await page.setViewportSize({ width: 1500, height: 860 });
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  await expect(bar).toBeVisible();
  const shown = (await bar.boundingBox())!;
  // Natural width is 345px; anything materially under it means the flex items
  // shrank and every icon is distorted.
  expect(shown.width).toBeGreaterThan(340);
  // Icons keep their own aspect ratio, so the row is NOT nine equal widths —
  // the two vertical-sagittal tiles are ~17px against the camera's 32px.
  const iconWidths = await bar.locator('img').evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().width)),
  );
  expect(iconWidths).toHaveLength(9);
  expect(Math.min(...iconWidths)).toBeLessThan(20);
  expect(Math.max(...iconWidths)).toBe(32);

  // Everything below resizes the SAME page rather than reloading. That matters:
  // BrainViewer is behind React.lazy, so after a fresh goto a `toHaveCount(0)`
  // assertion passes instantly against a viewer that has not mounted yet — it
  // races rather than testing the gate. Resizing live means each assertion runs
  // from a state where the opposite was just true, so a transition has to
  // actually happen.

  // ~600px viewer: above the gate, but HALF of it (300px) is under the bar's
  // 345px natural width. That band is the only place the shrink bug is
  // reachable, so it is what makes `w-max` load-bearing — at 1500 there is
  // already enough room and the width assertion above passes either way.
  // Viewer width is `vw - 70 - sidebarWidth - detailWidth` = `vw - 843` at the
  // embedded defaults (35px rails ×2, sidebar 360, detail 413), so 1450 gives
  // ~607. Recompute if either panel default moves: widening the detail panel
  // from 360 to 413 is exactly what pushed the previous 1390 below the gate.
  await page.setViewportSize({ width: 1450, height: 860 });
  await expect(bar).toBeVisible();
  expect((await bar.boundingBox())!.width).toBeGreaterThan(340);

  // 1280 wide → ~490px viewer, below the gate: gone rather than squashed or
  // overlapping the legend. The bar was visible a moment ago, so this is a real
  // disappearance.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(bar).toHaveCount(0);

  // Collapsing a panel widens the viewer past the gate, so it comes back — the
  // gate tracks the viewer, not the window.
  await page.getByTestId('rail-detail').click();
  await expect(bar).toBeVisible();
  expect((await bar.boundingBox())!.width).toBeGreaterThan(340);
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

test('embedded mode opens with free rotation, no momentum, and a raised framing', async ({
  page,
}) => {
  // Wide enough for the orientation bar, since the preset click below needs it.
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/?mock=1&embed=1');
  await expect(page.getByTestId('embedded-sidebar')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(2500); // let the point cloud and outline mesh draw

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  // mapZebrain's own 3D view orbits freely with no damping; embedded matches it.
  await expect(page.getByLabel(/object-centric/i).first()).not.toBeChecked();
  const momentum = page.locator('label').filter({ hasText: /momentum/i }).first();
  expect(await momentum.locator('input').last().inputValue()).toBe('0');

  // The 10px upward framing nudge is a projection offset held outside the
  // user's pan, so that a reset-to-default restores it instead of undoing it.
  // Measured as the topmost lit row of the rendered canvas: reading the offset
  // off the camera is not possible from the page, and pixels are the thing that
  // actually matters anyway. Embedded mode sets preserveDrawingBuffer, so the
  // canvas can be read back.
  const topLitRow = () =>
    page.evaluate(async () => {
      const cv = document.querySelector('canvas') as HTMLCanvasElement;
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = cv.toDataURL('image/png');
      });
      const oc = document.createElement('canvas');
      oc.width = img.width;
      oc.height = img.height;
      const ctx = oc.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, oc.width, oc.height).data;
      const dpr = oc.height / cv.clientHeight;
      for (let y = 0; y < oc.height; y++) {
        for (let x = 0; x < oc.width; x++) {
          const i = (y * oc.width + x) * 4;
          if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 18) return y / dpr;
        }
      }
      return -1;
    });

  const before = await topLitRow();
  expect(before).toBeGreaterThan(0);

  // A preset click runs applyView, which zeroes the user pan. If it also zeroed
  // the baseline — as it did before the baseline existed — the volume would
  // drop back down by 10px here.
  await page.getByRole('button', { name: 'Dorsal' }).click();
  await page.waitForTimeout(1200);
  const after = await topLitRow();
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
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
