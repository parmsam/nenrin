import { spawn } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('prompts to reload when a new version is deployed', async ({ page }) => {
  // Serve a private copy of the build, so we can "deploy" a new version into it.
  const site = mkdtempSync(join(tmpdir(), 'nenrin-update-'));
  cpSync('dist', site, { recursive: true });
  const port = 4177;
  const server = spawn(
    'npx',
    ['vite', 'preview', '--outDir', site, '--port', String(port), '--strictPort'],
    { stdio: 'ignore', detached: true },
  );
  const url = `http://localhost:${port}/`;
  try {
    await expect
      .poll(() =>
        fetch(url).then(
          (r) => r.ok,
          () => false,
        ),
      )
      .toBe(true);
    await page.goto(url);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await expect(page.getByText('A new version of Nenrin is ready.')).toBeHidden();

    // New deploy: any change to sw.js makes the browser install a new worker.
    appendFileSync(join(site, 'sw.js'), '\n// next version\n');
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());

    const toast = page.getByRole('alert').filter({ hasText: 'A new version of Nenrin is ready.' });
    await expect(toast).toBeVisible({ timeout: 15_000 });
    // Start waiting before clicking: the reload can finish before a later wait would begin.
    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Reload' }).click();
    await reloaded;
    await expect(toast).toBeHidden();
    // The waiting worker took over: nothing is left waiting.
    expect(
      await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
    ).toBe(false);
  } finally {
    try {
      process.kill(-server.pid!);
    } catch {
      // already stopped
    }
    rmSync(site, { recursive: true, force: true });
  }
});
