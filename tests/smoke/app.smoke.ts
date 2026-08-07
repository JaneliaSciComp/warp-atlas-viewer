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
  // Exact, for the same strict-mode reason as the Settings lookups below: the
  // filter row's always-present "t-SNE selection" card also contains "t-SNE".
  // The exact match is the UmapPanel header, which exists only once that lazy
  // chunk has mounted — which is what this assertion is here to force.
  await expect(page.getByText('t-SNE', { exact: true })).toBeVisible();
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

  // The header Export button still opens (and Escape still closes) the dialog
  // it shares with embedded mode's export icon, which owns the open state
  // itself — see ExportDialog.
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('heading', { name: 'Export cells to CSV' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

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
  const cycleProjectionModes = async () => {
    for (const label of ['Min', 'Mean', 'Max', 'Min/Max', 'Sum', 'Off']) {
      await projectionSection.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(200);
    }
  };
  await cycleProjectionModes();

  // Also exercise the signed stim/swim projection path. It uses different
  // blending/composite behavior from sequential Activity/Gene projections.
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByLabel('scheme').selectOption({ label: 'Stim correlation' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await cycleProjectionModes();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
