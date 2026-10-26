import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';

test('shows the welcome screen and creates a sample deck that persists', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Nenrin' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  await expect(page.getByRole('link', { name: /Japanese: Nature/ })).toBeVisible();
  await expect(page.getByLabel('5 new, 0 learning, 0 to review')).toBeVisible();

  // Data survives a reload (IndexedDB).
  await page.reload();
  await expect(page.getByRole('link', { name: /Japanese: Nature/ })).toBeVisible();
});

test('works offline after the first visit', async ({ page }) => {
  // Playwright's offline emulation and request routing both make Chromium bypass
  // the service worker, so take a real server down instead.
  const port = 4174;
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    stdio: 'ignore',
    detached: true,
  });
  const url = `http://localhost:${port}/`;
  try {
    // Starting a second server takes a while when the rest of the suite runs alongside.
    await expect
      .poll(
        () =>
          fetch(url).then(
            (r) => r.ok,
            () => false,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await page.goto(url);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    process.kill(-server.pid!);
    await expect
      .poll(() =>
        fetch(url).then(
          () => true,
          () => false,
        ),
      )
      .toBe(false);

    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Nenrin' })).toBeVisible();
  } finally {
    try {
      process.kill(-server.pid!);
    } catch {
      // already stopped
    }
  }
});
