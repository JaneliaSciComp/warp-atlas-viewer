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
