import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { expect, test } from '@playwright/test';

test('imports a CSV into a new deck, then exports it as Anki text and .apkg', async ({ page }) => {
  await page.goto('./#/import');
  await page.locator('input[type=file]').setInputFiles({
    name: 'capitals.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '# my capitals\nFrance,Paris\nJapan,"Tokyo, the capital"\n,missing front\n',
    ),
  });
  await expect(page.getByLabel('Separator')).toHaveValue(',');
  await expect(page.getByRole('cell', { name: 'Tokyo, the capital' })).toBeVisible();
  await page.getByRole('button', { name: 'Import 3 notes' }).click();
  await expect(page.getByRole('status')).toContainText(
    '2 added · 0 updated · 0 skipped · 1 failed',
  );
  await expect(page.getByRole('status')).toContainText('Row 3');

  // No deck existed, so a Default deck was created.
  await page.getByRole('link', { name: 'Go to decks' }).click();
  await page.getByRole('link', { name: /Default/ }).click();
  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export Default' });
  await dialog.getByLabel(/Notes as text/).check();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const text = await readFile((await (await downloadPromise).path())!, 'utf8');
  expect(text).toMatch(/^#separator:tab\n#html:true\n/);
  expect(text).toContain('\tBasic\tDefault\tJapan\tTokyo, the capital\t');
  await expect(dialog).toBeHidden();

  // The same deck as an Anki package, built in the worker.
  await page.getByRole('button', { name: 'Export…' }).click();
  await dialog.getByLabel(/Anki package/).check();
  await expect(dialog.getByLabel(/Include my progress/)).toBeChecked();
  const apkgPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const apkg = await apkgPromise;
  expect(apkg.suggestedFilename()).toMatch(/^Default-\d{4}-\d\d-\d\d\.apkg$/);
  const files = unzipSync(new Uint8Array(await readFile((await apkg.path())!)));
  expect(Object.keys(files)).toEqual(expect.arrayContaining(['collection.anki21', 'media']));
});

test('theme and accent choices apply immediately and persist', async ({ page }) => {
  await page.goto('./#/settings');
  const html = page.locator('html');
  await page.getByText('Dark', { exact: true }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByText('Matcha').click();
  await expect(html).toHaveAttribute('data-palette', 'matcha');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(26, 23, 20)');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('data-palette', 'matcha');

  await page.getByText('System', { exact: true }).click();
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
});

test('the gear toggles settings open and closed', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  await page.getByRole('link', { name: /Japanese: Nature/ }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('link', { name: 'Close settings' }).click();
  await expect(page.getByRole('heading', { name: 'Japanese: Nature' })).toBeVisible();
});
