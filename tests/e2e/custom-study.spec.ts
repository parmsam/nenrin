import { expect, test, type Page } from '@playwright/test';

async function deckWithCards(page: Page, name: string, cards: [string, string][]) {
  await page.goto('./');
  await page.getByLabel('Deck name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByRole('link', { name: '+ Add cards' }).click();
  for (const [front, back] of cards) {
    await page.getByLabel('Front').fill(front);
    await page.getByLabel('Back').fill(back);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(/Added 1 card/);
  }
  await page.getByRole('link', { name: '← Back' }).click();
  await page
    .getByRole('link', { name: new RegExp(name) })
    .first()
    .click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('preview a deck with the keyboard, without scheduling anything', async ({ page }) => {
  await deckWithCards(page, 'Colors', [
    ['red', 'aka'],
    ['blue', 'ao'],
  ]);
  await expect(page.getByLabel('2 new, 0 learning, 0 to review')).toBeVisible();

  // P opens the preview from the deck screen.
  await page.keyboard.press('p');
  await expect(page.getByText('Preview · Colors')).toBeVisible();
  await expect(page.getByText('1 / 2')).toBeVisible();
  await expect(page.getByText('red')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('aka')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('blue')).toBeVisible();
  // ← goes back a card.
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('red')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('2 / 2')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Session finished' })).toBeVisible();

  // Nothing was scheduled: both cards are still new.
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('2 new, 0 learning, 0 to review')).toBeVisible();
});

test('custom study: extra new cards today, and a tag session', async ({ page }) => {
  await deckWithCards(page, 'Numbers', [
    ['one', 'ichi'],
    ['two', 'ni'],
    ['three', 'san'],
  ]);
  // Limit new cards to 1 a day.
  await page.getByLabel('New cards / day').fill('1');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByLabel('1 new, 0 learning, 0 to review')).toBeVisible();

  await page.keyboard.press('c');
  await expect(page.getByRole('heading', { name: 'Custom study' })).toBeVisible();
  await page.getByLabel('Extra new cards').fill('2');
  await page.getByLabel('Extra new cards').press('Enter');
  await expect(page.getByText('Added 2 new cards for today.')).toBeVisible();
  await page.getByRole('link', { name: 'Numbers' }).click();
  await expect(page.getByLabel('3 new, 0 learning, 0 to review')).toBeVisible();

  // Practice session over all cards, shown with a live count.
  await page.getByRole('link', { name: 'Custom study' }).click();
  await page.getByLabel(/Preview new cards/).check();
  await expect(page.getByText('3 cards', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Practice (not scheduled) · Numbers')).toBeVisible();
  // Again puts the card back at the end.
  await page.keyboard.press('Space');
  await page.keyboard.press('1');
  await expect(page.getByText('2 / 4')).toBeVisible();
});

test('bury and suspend from the review screen, with undo', async ({ page }) => {
  await deckWithCards(page, 'Fruit', [
    ['apple', 'ringo'],
    ['peach', 'momo'],
  ]);
  await page.keyboard.press('s');
  await expect(page.getByText('apple')).toBeVisible();

  await page.keyboard.press('-');
  await expect(page.getByRole('status').filter({ hasText: 'Card buried' })).toBeVisible();
  await expect(page.getByText('peach')).toBeVisible();
  await page.keyboard.press('z');
  await expect(page.getByText('apple')).toBeVisible();

  // The ⋯ menu does the same for mouse users.
  await page.getByLabel('More actions').click();
  await page.getByRole('button', { name: /Suspend card/ }).click();
  await expect(page.getByText('peach')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('1 new, 0 learning, 0 to review')).toBeVisible();
});

test('global keys jump between screens', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByLabel('Deck name')).toBeVisible();
  await page.keyboard.press('b');
  await expect(page.getByRole('heading', { name: 'Browse' })).toBeVisible();
  // In the search box, letters type instead of navigating.
  await page.getByLabel('Search notes').press('t');
  await expect(page.getByLabel('Search notes')).toHaveValue('t');
  await page.getByLabel('Search notes').blur();
  await page.keyboard.press('t');
  await expect(page).toHaveURL(/#\/stats/);
  await page.keyboard.press('d');
  await expect(page).toHaveURL(/#\/$/);
});
