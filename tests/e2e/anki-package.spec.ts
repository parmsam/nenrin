import { expect, test } from '@playwright/test';

test('imports a real Anki .apkg with media and studies it', async ({ page }) => {
  await page.goto('./#/import');
  await page.locator('input[type=file]').setInputFiles('fixtures/modern.apkg');
  await expect(page.getByText('Anki deck package')).toBeVisible();
  await expect(page.getByText('Nenrin Fixture / Japanese')).toBeVisible();
  await expect(page.getByLabel('Import review history and scheduling')).toBeChecked();
  await page.getByRole('button', { name: 'Import 8 notes' }).click();
  await expect(page.getByRole('status')).toContainText('8 notes added');
  await expect(page.getByRole('status')).toContainText('3 media files');

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

test('applies deck styling (scoped) and autoplays audio', async ({ page }) => {
  // Record play() calls instead of actually playing sound.
  await page.addInitScript(() => {
    const w = window as unknown as { played: string[] };
    w.played = [];
    HTMLMediaElement.prototype.play = function () {
      w.played.push(this.currentSrc || this.src);
      queueMicrotask(() => this.dispatchEvent(new Event('ended')));
      return Promise.resolve();
    };
  });
  await page.goto('./#/import');
  await page.locator('input[type=file]').setInputFiles('fixtures/shared.apkg');
  await page.getByRole('button', { name: 'Import 8 notes' }).click();
  await page.getByRole('link', { name: 'Go to decks' }).click();
  await page.getByRole('link', { name: /^Japanese/ }).click();
  await page.getByRole('link', { name: 'Study now' }).click();

  const played = () => page.evaluate(() => (window as unknown as { played: string[] }).played);
  for (let i = 0; i < 8; i++) {
    const front = (await page.locator('.card-content').innerText()).trim();
    if (front === '川') {
      // The Styled note type's CSS applies inside the card, with its font from local media…
      await expect(page.locator('.card-content .reading')).toHaveCSS('color', 'rgb(10, 20, 30)');
      expect(await page.locator('style').filter({ hasText: '@scope (.deck-scope)' }).count()).toBe(
        1,
      );
      expect(await page.locator('style').filter({ hasText: 'blob:' }).count()).toBe(1);
      // …and nowhere else: the app's text color is untouched.
      await expect(page.locator('.deck-name')).not.toHaveCSS('color', 'rgb(10, 20, 30)');
    }
    await page.getByRole('button', { name: /Show answer/ }).click();
    if (front === '木') {
      // The answer's audio autoplays once revealed, from local media; R replays it.
      await expect.poll(played).toEqual([expect.stringMatching(/^blob:/)]);
      await page.keyboard.press('r');
      await expect.poll(async () => (await played()).length).toBe(2);
    }
    await page.keyboard.press('3');
  }
  expect((await played()).length).toBeGreaterThanOrEqual(2);
});

test.describe('in dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('deck night-mode rules and .card rules apply', async ({ page }) => {
    await page.goto('./#/import');
    await page.locator('input[type=file]').setInputFiles('fixtures/shared.apkg');
    await page.getByRole('button', { name: 'Import 8 notes' }).click();
    await page.goto('./#/browse?q=%E5%B7%9D');
    await page.locator('.results a.main').first().click();
    const reading = page.locator('.preview .reading');
    await expect(reading).toHaveCSS('color', 'rgb(200, 210, 220)');
    await expect(page.locator('.preview .deck-card')).toHaveCSS('font-family', /FixtureFont/);
  });
});
