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

test('toggling embedded mode live via Settings shows the bar but not the screenshot button or a repainted accent', async ({
  page,
}) => {
  // Deliberately NOT ?embed=1: this loads the standalone layout, so the
  // Canvas is created with preserveDrawingBuffer fixed to false at mount
  // (embeddedAtMountRef captures settings.embeddedMode === false here).
  await page.goto('/?mock=1');
  await expect(page.getByRole('heading', { name: 'WARP Atlas Viewer' })).toBeVisible({
    timeout: 20_000,
  });
  // BrainViewer is lazy-loaded (React.lazy + Suspense): its function body,
  // and therefore embeddedAtMountRef's useRef initializer, only runs once
  // the chunk resolves and it actually mounts. Wait for its canvas before
  // touching settings, or the checkbox toggle below could race the mount
  // and get baked into the ref instead of the pre-toggle value.
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });

  // No orientation bar yet — embeddedMode starts off in standalone mode.
  await expect(page.getByRole('button', { name: 'Dorsal' })).toHaveCount(0);

  // Flip embeddedMode on via the live Settings checkbox (SettingsTab.tsx),
  // not the URL — a ?embed=1 reload would make the mount-time ref and the
  // live value agree, defeating the point of this test.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Embedded mode (orientation icons)').check();

  // The bar itself is gated on the LIVE settings.embeddedMode, so it (and
  // the gear, which is always rendered inside it) appear immediately.
  await expect(page.getByRole('button', { name: 'Dorsal' })).toBeVisible();
  await expect(page.getByRole('button', { name: '3D view settings' })).toBeVisible();

  // But the screenshot button stays gated on embeddedAtMountRef, which is
  // still false — toggling the checkbox cannot retroactively add
  // preserveDrawingBuffer to the already-created Canvas, so offering the
  // button here would silently produce a blank PNG.
  await expect(page.getByRole('button', { name: '3D view screenshot' })).toHaveCount(0);

  // Same story for the accent palette: `.embedded` is applied from the
  // module-load EMBEDDED constant (src/App.tsx), not the live
  // settings.embeddedMode this checkbox writes to. That's deliberate — a
  // mid-session toggle must not repaint the palette (or reflow the layout,
  // or jump the camera) out from under the user. If EMBEDDED were ever
  // swapped for the live setting here, this checkbox would turn the
  // underline pink; it must not. 'Settings' is the active tab at this point
  // (clicked above), so its underline is the one carrying border-accent.
  const accentAfterToggle = await page
    .getByRole('button', { name: 'Settings', exact: true })
    .evaluate((el) => getComputedStyle(el).borderBottomColor);
  expect(accentAfterToggle).toBe('rgb(253, 224, 71)');
});
