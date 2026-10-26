import { expect, test } from '@playwright/test';

test('rewards: session marks, a stamp for a finished day, milestones and seasons', async ({
  page,
}) => {
  await page.goto('./#/settings');
  const rewards = page.getByRole('checkbox', { name: /^Rewards/ });
  await rewards.check();
  await expect(page.getByLabel('Wood-block sound when a session mark is reached')).toBeEnabled();
  // Saved to IndexedDB, not just ticked, before leaving the page.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            const open = indexedDB.open('nenrin');
            open.onsuccess = () => {
              const get = open.result.transaction('settings').objectStore('settings').get('prefs');
              get.onsuccess = () => resolve(get.result?.value?.rewards);
            };
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(rewards).toBeChecked();

  await page.goto('./');
  await page.getByLabel('Deck name').fill('Ten');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Ten' })).toBeVisible();
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await page.getByRole('radio', { name: 'Paste Markdown' }).click();
  await page
    .getByLabel('Markdown')
    .fill(Array.from({ length: 10 }, (_, i) => `Q: Question ${i + 1}\nA: Answer`).join('\n\n'));
  await page.getByRole('button', { name: 'Add all 10' }).click();
  await expect(page.getByText('Added 10 cards')).toBeVisible();
  await page.getByRole('link', { name: '← Back' }).click();
  await page.getByRole('link', { name: 'Study now' }).click();

  const mark = page.getByRole('img', { name: /^Session mark/ });
  const question = page.locator('.card-content');
  for (let i = 0; i < 10; i++) {
    await expect(question).toHaveText(/^Question \d+\s*$/);
    const text = await question.innerText();
    await expect(mark).toHaveCount(0);
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /Easy/ })).toBeVisible();
    // Easy, so each new card graduates and the deck is finished after ten.
    await page.keyboard.press('4');
    if (i < 9) {
      await expect(page.getByRole('button', { name: /Show answer/ })).toBeVisible();
      await expect(question).not.toHaveText(text);
    }
  }
  await expect(page.getByRole('heading', { name: 'Done for now' })).toBeVisible();
  await expect(mark).toHaveAttribute('aria-label', 'Session mark: Tree, 10 cards');
  await expect(page.getByText('Tree: 10 cards this session')).toBeVisible();
  await expect(page.getByText(/Today is stamped/)).toBeVisible();
  await expect(page.getByText('Sprout.')).toBeVisible();

  await page.getByRole('link', { name: 'stamp book' }).click();
  const book = page.getByRole('region', { name: /Stamp book/ });
  await expect(book.getByLabel(/finished everything due, milestone: Sprout/)).toBeVisible();
  await expect(book.getByText('Your first review.')).toBeVisible();

  await page.goto('./');
  await expect(page.locator('.rings .season')).toHaveCount(1);
});
