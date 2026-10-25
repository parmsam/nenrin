import { expect, test } from '@playwright/test';

test('stats reflect today’s reviews and the cards in each stage', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  await page.getByRole('link', { name: 'Study now' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /Show answer/ }).click();
    await page.getByRole('button', { name: /Easy/ }).click();
  }
  await page.goto('./#/');
  await page.getByRole('link', { name: 'Stats', exact: true }).click();

  const tile = (label: string) => page.locator('.tile', { hasText: label });
  await expect(tile('Reviews today')).toContainText('2');
  await expect(tile('Streak')).toContainText('1 day');
  await expect(
    page.getByRole('img', { name: /Review heatmap: 2 reviews on 1 of the last/ }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /Review forecast: 2 reviews due/ })).toBeVisible();
  await expect(
    page.getByRole('img', {
      name: 'Cards by stage: 3 new, 0 learning, 2 young, 0 mature, 0 suspended',
    }),
  ).toBeVisible();

  // The deck filter scopes everything and is kept in the URL.
  await page.getByLabel('Deck').selectOption({ label: 'Japanese: Nature' });
  await expect(page).toHaveURL(/#\/stats\?deck=/);
  await expect(page.getByRole('link', { name: 'Optimize this deck…' })).toBeVisible();

  // Keyboard readout on the forecast.
  await page.mouse.move(0, 0); // keep a stray hover from picking a day first
  await page.getByRole('img', { name: /Review forecast/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.forecast .tip')).toContainText('Today');
});
