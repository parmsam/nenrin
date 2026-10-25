import { expect, test, type Page } from '@playwright/test';

async function swipe(page: Page, distance: number) {
  const row = page.locator('.decks .deck-link').first();
  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width - 20;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x - (distance * i) / 10, y);
  await page.mouse.up();
}

test('swipe a deck left to delete it, with confirmation', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  const deckLink = page.getByRole('link', { name: /Japanese: Nature/ });
  await expect(deckLink).toBeVisible();

  // Short swipe reveals the button; cancelling keeps the deck.
  await swipe(page, 110);
  const del = page.getByRole('button', { name: 'Delete Japanese: Nature' });
  await expect(del).toBeVisible();
  await del.click();
  const dialog = page.getByRole('dialog', { name: 'Delete “Japanese: Nature”?' });
  await expect(dialog).toContainText('5 cards and their review history');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(deckLink).toBeVisible();

  // A plain tap still opens the deck (the swipe didn't break links).
  await deckLink.click();
  await expect(page.getByRole('heading', { name: 'Japanese: Nature' })).toBeVisible();
  await page.goto('./');

  // A full swipe goes straight to the confirmation; confirming deletes it.
  await swipe(page, 260);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete deck' }).click();
  await expect(page.getByRole('button', { name: 'Add a sample deck' })).toBeVisible();
});
