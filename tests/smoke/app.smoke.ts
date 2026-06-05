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
  // Match each section header exactly: the two point-density sections
  // share the "Point density" substring, so a non-exact lookup hits
  // Playwright's strict-mode ambiguity check.
  await expect(page.getByText('3D point density', { exact: true })).toBeVisible();
  await expect(page.getByText('t-SNE point density', { exact: true })).toBeVisible();
  await expect(page.getByText('Rendering', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByText('10,000 cells visible')).toBeVisible();

  await page.waitForTimeout(250);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('cycles through projection modes without shader errors', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/?mock=1');
  await expect(page.getByText('10,000 cells pooled from 3 fish (mock)')).toBeVisible({
    timeout: 20_000,
  });
  // Projection is intentionally disabled for categorical schemes; switch
  // from the default Region coloring to a scalar scheme before cycling.
  await page.getByLabel('scheme').selectOption({ label: 'Activity' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('Projection', { exact: true })).toBeVisible();

  // Walk every projection mode so shader compile + link errors for any
  // of the three behaviors surface as a pageerror/console.error here
  // instead of silently producing a black canvas in production. Scope
  // to the Projection toggle group — the Multi-gene coloring section
  // uses the same "Max" label, so an unscoped lookup is ambiguous.
  const projectionSection = page.locator('section').filter({
    has: page.getByText('Projection', { exact: true }),
  });
  for (const label of ['Min', 'Mean', 'Max', 'Min/Max', 'Sum', 'Off']) {
    await projectionSection.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(200);
  }

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
