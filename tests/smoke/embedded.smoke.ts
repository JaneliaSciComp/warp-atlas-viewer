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
