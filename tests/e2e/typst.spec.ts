import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';

const block = '```typst\n$ sum_(k=1)^n k = (n(n+1))/2 $\n\n*Gauss*, 1786\n```';

test('Typst: a hint until enabled, then rendered SVG from the opt-in cache', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./');
  await page.getByLabel('Deck name').fill('Typst');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await page.getByLabel('Front').fill(block);
  await expect(page.locator('.preview .diagram-hint')).toContainText('Enable it in Settings');
  await page.getByLabel('Back').fill('the sum');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/Added 1 card/);

  await page.goto('./#/settings');
  await page.getByRole('button', { name: /Enable Typst/ }).click();
  await expect(page.getByText('Typst is ready')).toBeVisible({ timeout: 60_000 });

  // Everything Typst needs is in its own cache, which the service worker serves offline.
  // (Playwright's offline mode bypasses service workers, so check the cache directly.)
  const cached = await page.evaluate(async () =>
    (await (await caches.open('nenrin-typst')).keys()).map((r) => r.url.split('/').pop()),
  );
  expect(cached.some((u) => /^typst_ts_web_compiler_bg-.*\.wasm$/.test(u!))).toBe(true);
  expect(cached).toContain('NewCMMath-Regular.otf');

  await page.goto('./#/');
  await page.getByRole('link', { name: 'Study now' }).click();
  const svg = page.locator('.card-content .nenrin-diagram svg');
  await expect(svg).toBeVisible({ timeout: 60_000 });
  // Text follows the card's color instead of Typst's black.
  expect(await svg.evaluate((el) => el.outerHTML.includes('currentColor'))).toBe(true);
  expect(await svg.evaluate((el) => el.outerHTML.includes('<script'))).toBe(false);
});

test('Typst keeps working offline once enabled', async ({ page }) => {
  test.setTimeout(120_000);
  // As in smoke.spec.ts: Playwright's offline mode bypasses the service worker, so take a
  // real server down instead.
  const port = 4176;
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: 'ignore',
    detached: true,
  });
  const url = `http://localhost:${port}/`;
  const up = () =>
    fetch(url).then(
      (r) => r.ok,
      () => false,
    );
  try {
    await expect.poll(up).toBe(true);
    await page.goto(url);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByLabel('Deck name').fill('Offline');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: 'Offline' })).toBeVisible();
    await page.goto(`${url}#/settings`);
    await page.getByRole('button', { name: /Enable Typst/ }).click();
    await expect(page.getByText('Typst is ready')).toBeVisible({ timeout: 60_000 });

    process.kill(-server.pid!);
    await expect.poll(up).toBe(false);

    await page.goto(`${url}#/add`);
    await page.getByLabel('Front').fill('```typst\n$ a^2 + b^2 = c^2 $\n```');
    await expect(page.locator('.preview .nenrin-diagram svg use').first()).toBeAttached({
      timeout: 60_000,
    });
  } finally {
    try {
      process.kill(-server.pid!);
    } catch {
      // already stopped
    }
  }
});
