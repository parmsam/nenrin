import { strToU8, zipSync } from 'fflate';
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

  let sawTree = false;
  const played = () => page.evaluate(() => (window as unknown as { played: string[] }).played);
  for (let i = 0; i < 8; i++) {
    // Wait for the next card's question before reading it (rating loads it asynchronously).
    await page.getByRole('button', { name: /Show answer/ }).waitFor();
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
    // Only the first time: rated Good, the card comes back as a learning card within the
    // 20-minute learn-ahead window, and plays again then.
    if (front === '木' && !sawTree) {
      sawTree = true;
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

test('imports a CrowdAnki deck (zipped folder) with media', async ({ page }) => {
  // A tiny deck in CrowdAnki's layout: Flags/deck.json + Flags/media/.
  const deck = {
    name: 'Flags',
    note_models: [
      {
        crowdanki_uuid: 'm1',
        name: 'Flag',
        type: 0,
        css: '.card { text-align: center; }',
        flds: [
          { name: 'Country', ord: 0 },
          { name: 'Flag', ord: 1 },
        ],
        tmpls: [{ name: 'Flag', ord: 0, qfmt: '{{#Flag}}{{Flag}}{{/Flag}}', afmt: '{{Country}}' }],
      },
    ],
    notes: [
      {
        guid: 'g1',
        note_model_uuid: 'm1',
        fields: ['Square land', '<img src="square.svg">'],
        tags: [],
      },
    ],
    children: [],
  };
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
  const zip = zipSync({
    Flags: { 'deck.json': strToU8(JSON.stringify(deck)), media: { 'square.svg': strToU8(svg) } },
  });

  await page.goto('./#/import');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'Flags.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await expect(page.getByText('CrowdAnki deck')).toBeVisible();
  await expect(page.getByLabel('Import review history and scheduling')).toHaveCount(0);
  await page.getByRole('button', { name: 'Import 1 note' }).click();
  await expect(page.getByRole('status')).toContainText('1 note added');

  await page.getByRole('link', { name: 'Go to decks' }).click();
  await page.getByRole('link', { name: /^Flags/ }).click();
  await page.getByRole('link', { name: 'Study now' }).click();
  // The image-only field still makes a card, and its image comes from the zip.
  await expect(page.locator('.card-content img')).toHaveAttribute('src', /^blob:/);
});

test('imports a file dropped on the page, and turns away files it cannot read', async ({
  page,
}) => {
  await page.goto('./#/import');
  await expect(page.getByText('Choose a file…')).toBeVisible();
  const drop = (name: string, text: string) =>
    page.evaluate(
      ([name, text]) => {
        const data = new DataTransfer();
        data.items.add(new File([text], name));
        for (const type of ['dragover', 'drop'])
          window.dispatchEvent(new DragEvent(type, { dataTransfer: data, cancelable: true }));
      },
      [name, text],
    );

  await drop('photo.jpg', 'not a deck');
  await expect(page.getByRole('alert')).toContainText("can't import “photo.jpg”");

  await drop('words.csv', 'front,back\n犬,dog\n猫,cat\n');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Import 3 notes' }).click();
  await expect(page.getByRole('status')).toContainText('3 added');
});
