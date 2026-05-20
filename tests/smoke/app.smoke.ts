import { expect, test } from '@playwright/test';

test('loads the mock atlas and core panels without client errors', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    failedRequests.push(`${request.method()} ${request.url()} ${failure?.errorText ?? ''}`.trim());
  });

  await page.goto('/?mock=1');

  await expect(page.getByRole('heading', { name: 'WARP Atlas Viewer' })).toBeVisible();
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });

  // These assertions force the lazy chunks for the 3D viewer, t-SNE panel,
  // and detail panel to load. The previous Vite client regression surfaced
  // here as a pageerror before the app could finish mounting.
  await expect(page.getByText('t-SNE')).toBeVisible();
  await expect(page.getByRole('heading', { name: /All neurons \(10,000 neurons\)/ })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(2);

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('Point density')).toBeVisible();
  await expect(page.getByText('Rendering', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByText('10,000 cells visible')).toBeVisible();

  await page.waitForTimeout(250);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
