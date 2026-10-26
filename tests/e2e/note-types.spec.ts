import { expect, test } from '@playwright/test';

test('clone a note type, change its fields and cards, and use it', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Deck name').fill('Words');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Words' })).toBeVisible();

  await page.goto('./#/note-types');
  await expect(page.getByRole('heading', { name: 'Note types' })).toBeVisible();
  await page
    .getByRole('listitem')
    .filter({ hasText: /^Basic\b.*built-in/ })
    .first()
    .getByRole('button', { name: 'Clone' })
    .click();
  await expect(page.getByRole('heading', { name: 'Basic copy' })).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('Vocab');
  // Renaming a field updates the templates that use it.
  await page.getByLabel('Field 1 name').fill('Word');
  await expect(page.getByLabel('Front template')).toHaveValue('{{Word}}');
  await page.getByLabel('New field name').fill('Example');
  await page.getByRole('button', { name: 'Add field' }).click();
  await expect(page.getByLabel('Field 3 name')).toHaveValue('Example');

  await page.getByRole('button', { name: '+ Card type' }).click();
  await page.getByLabel('Front template').fill('{{Back}}');
  await expect(page.locator('.preview .card-content')).toContainText('(Back)');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');

  await page.goto('./#/add');
  await page.getByLabel('Type').selectOption({ label: 'Vocab' });
  await page.getByLabel('Word', { exact: true }).fill('木');
  await page.getByLabel('Back').fill('tree');
  await page.getByLabel('Example').fill('木の下');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/Added 2 cards/);

  // Removing the card type deletes its cards, after a warning.
  await page.goto('./#/note-types');
  await page.getByRole('link', { name: 'Vocab' }).click();
  await page.getByRole('tab', { name: 'Card 2' }).click();
  await page.getByRole('button', { name: 'Remove card type' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toContainText('Saving deletes 1 card');
  await page.getByRole('button', { name: 'Save and delete' }).click();
  await expect(page.getByRole('status')).toHaveText(/Saved\. 1 removed\./);
});
