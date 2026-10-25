import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('welcome splash greets returning users once, and can be turned off', async ({ page }) => {
  // First visit with no decks: the welcome screen, no splash.
  await page.goto('./');
  await expect(page.locator('.splash')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  await expect(page.getByRole('link', { name: /Japanese: Nature/ })).toBeVisible();

  // A fresh session with decks: the splash shows today's count, then gets out of the way.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const splash = page.locator('.splash');
  await expect(splash).toBeVisible();
  await expect(splash).toContainText('5 cards to study today');
  await expect(splash).toBeHidden({ timeout: 3000 });

  // Once per session: a reload doesn't show it again.
  await page.reload();
  await expect(page.getByRole('heading', { name: '5 cards to study' })).toBeVisible();
  await expect(splash).toHaveCount(0);

  // Not over a deep link.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('./#/stats');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible();
  await expect(splash).toHaveCount(0);

  // Tap to dismiss early.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('./#/');
  await page.reload();
  await expect(splash).toBeVisible();
  await splash.click();
  await expect(splash).toBeHidden();

  // Turned off in Settings.
  await page.goto('./#/settings');
  await page.getByLabel('Show welcome screen when opening Nenrin').uncheck();
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('./#/');
  await page.reload();
  await expect(page.getByRole('heading', { name: '5 cards to study' })).toBeVisible();
  await expect(splash).toHaveCount(0);
});
