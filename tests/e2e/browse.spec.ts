import { expect, test } from '@playwright/test';

test('browse, search and bulk-edit notes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  await page.getByRole('link', { name: 'Browse notes' }).first().click();

  const results = page.locator('.results li');
  await expect(results).toHaveCount(5);
  await expect(page.getByText('5 notes')).toBeVisible();

  // Free text, accent-insensitive, and the query lands in the URL.
  const box = page.getByLabel('Search notes');
  await box.fill('forest');
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText('森 (mori)');
  await expect(page).toHaveURL(/#\/browse\?q=forest$/);

  // Filters: deck and tag, plus a quick-filter chip.
  await box.fill('deck:"Japanese: Nature" tag:sample');
  await expect(results).toHaveCount(5);
  await box.fill('');
  await page.getByRole('button', { name: 'is:suspended' }).click();
  await expect(page.getByText('No notes match.')).toBeVisible();

  // Bulk: select two, suspend and tag them.
  await box.fill('');
  await page.getByLabel('Select 山 (yama)').check();
  await page.getByLabel('Select 木 (ki)').check();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Suspend', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Suspended 2 notes.');
  await page.getByLabel('Tags').fill('hard');
  await page.getByRole('button', { name: '+ Tag' }).click();

  await box.fill('is:suspended tag:hard');
  await expect(results).toHaveCount(2);

  // Delete one; the deck now has 4 notes.
  await box.fill('yama');
  await page.getByLabel('Select all shown').check();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await box.fill('');
  await expect(results).toHaveCount(4);

  // `/` focuses search from anywhere on the page.
  await page.getByRole('heading', { name: 'Browse' }).click();
  await page.keyboard.press('/');
  await expect(box).toBeFocused();
});
