import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function createDeck(page: Page, name: string) {
  await page.goto('./');
  await page.getByLabel('Deck name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function addBasic(page: Page, front: string, back: string) {
  await page.getByLabel('Front').fill(front);
  await page.getByLabel('Back').fill(back);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/Added 1 card/);
}

test('add cards, study with the keyboard, and undo', async ({ page }) => {
  await createDeck(page, 'Capitals');
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await addBasic(page, 'Capital of **France**?', 'Paris');
  await addBasic(page, 'Capital of Japan?', 'Tokyo');

  await page.getByRole('link', { name: '← Back' }).click();
  await page.getByRole('link', { name: /Capitals/ }).click();
  await page.getByRole('link', { name: 'Study now' }).click();

  // Front, rendered from Markdown.
  await expect(page.locator('.card-content strong')).toHaveText('France');
  await expect(page.getByText('Paris')).toBeHidden();

  // Space reveals, and the rating buttons show interval previews.
  await page.keyboard.press('Space');
  await expect(page.getByText('Paris')).toBeVisible();
  await expect(page.getByRole('button', { name: /Again/ })).toContainText(/\d+m/);

  // 4 = Easy: the card graduates and the next one appears.
  await page.keyboard.press('4');
  await expect(page.getByText('Capital of Japan?')).toBeVisible();

  // Z brings back the previous card, unrevealed.
  await page.keyboard.press('z');
  await expect(page.locator('.card-content strong')).toHaveText('France');
  await expect(page.getByText('Paris')).toBeHidden();

  // Finish both cards with Easy, waiting for each card to load.
  await page.keyboard.press('Space');
  await page.keyboard.press('4');
  await expect(page.getByText('Capital of Japan?')).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('4');
  await expect(page.getByRole('heading', { name: 'Done for now' })).toBeVisible();
});

test('cloze notes create one card per deletion', async ({ page }) => {
  await createDeck(page, 'Biology');
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await page.getByLabel('Type').selectOption('cloze');
  await page.getByLabel('Text').fill('The {{c1::mitochondria}} makes {{c2::ATP}}.');
  await expect(page.locator('.preview')).toContainText('[…] makes ATP');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Added 2 cards.');

  // Siblings from one note are spread over days, so only one is offered today.
  await page.goto('./');
  await expect(page.getByLabel('1 new, 0 learning, 0 to review')).toBeVisible();
});

test('backup export and restore', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  await expect(page.getByRole('link', { name: /Japanese: Nature/ })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^nenrin-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(backup.data.cards).toHaveLength(5);
  await expect(page.getByText('Last backup: today')).toBeVisible();

  // Wipe by restoring into a fresh browser context.
  const fresh = await page.context().browser()!.newPage();
  await fresh.goto(page.url());
  fresh.on('dialog', (d) => d.accept());
  await fresh.locator('input[type=file]').setInputFiles((await download.path())!);
  await expect(fresh.getByRole('status')).toHaveText('Restored 5 cards.');
  await fresh.goto(page.url().replace(/#.*/, '#/'));
  await expect(fresh.getByRole('link', { name: /Japanese: Nature/ })).toBeVisible();
  await fresh.close();
});
