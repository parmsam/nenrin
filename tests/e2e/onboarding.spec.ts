import { expect, test } from '@playwright/test';

test('first run: take the tour, which teaches the app as you study it', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Coming from Anki?' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Import from Anki' })).toHaveAttribute(
    'href',
    '#/import',
  );
  await page.getByRole('button', { name: 'Take the tour' }).click();
  await expect(page).toHaveURL(/#\/study\//);
  await expect(page.getByText('Welcome to Nenrin! How do you see the answer')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('.card-content')).toContainText('Most of the time, choose Good');
});

test('the user guide works in the app, with links between pages', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Help' }).click();
  await expect(page.getByRole('heading', { name: 'Nenrin user guide' })).toBeVisible();
  await page.getByRole('link', { name: 'Moving from Anki' }).click();
  await expect(page).toHaveURL(/#\/help\/from-anki$/);
  await expect(page.getByRole('heading', { name: 'Import your decks' })).toBeVisible();
  // Pager to the next page, and outside links open in a new tab.
  await page.getByRole('link', { name: /Preview and custom study →/ }).click();
  await expect(page.getByRole('heading', { name: 'Preview a deck' })).toBeVisible();
  await page.goto('./#/help/faq');
  await expect(page.getByRole('link', { name: 'open source' })).toHaveAttribute('target', '_blank');
});

test('the header Help button opens the guide, and can be turned off in Settings', async ({
  page,
}) => {
  await page.goto('./');
  const help = page.getByRole('banner').getByRole('link', { name: 'Help: user guide' });
  await help.click();
  await expect(page.getByRole('heading', { name: 'Nenrin user guide' })).toBeVisible();

  await page.goto('./#/settings');
  await page.getByLabel(/Show the Help button/).uncheck();
  await expect(help).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel(/Show the Help button/)).not.toBeChecked();
  await expect(help).toHaveCount(0);
});
