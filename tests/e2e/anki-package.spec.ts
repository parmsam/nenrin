import { expect, test } from '@playwright/test';

test('imports a real Anki .apkg with media and studies it', async ({ page }) => {
  await page.goto('./#/import');
  await page.locator('input[type=file]').setInputFiles('fixtures/modern.apkg');
  await expect(page.getByText('Anki deck package')).toBeVisible();
  await expect(page.getByText('Nenrin Fixture / Japanese')).toBeVisible();
  await expect(page.getByLabel('Import review history and scheduling')).toBeChecked();
  await page.getByRole('button', { name: 'Import 7 notes' }).click();
  await expect(page.getByRole('status')).toContainText('7 notes added');
  await expect(page.getByRole('status')).toContainText('2 media files');

  await page.getByRole('link', { name: 'Go to decks' }).click();
  await page.getByRole('link', { name: /^Japanese/ }).click();
  await page.getByRole('link', { name: 'Study now' }).click();

  // Find the card with the image and audio, and check media resolves to local blobs.
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: /Show answer/ }).click();
    if (await page.locator('.card-content img').count()) break;
    await page.keyboard.press('3');
  }
  await expect(page.locator('.card-content img')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('.card-content audio')).toHaveAttribute('src', /^blob:/);
});
