import { expect, test, type Locator, type Page } from '@playwright/test';

const IMAGE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#8cf"/><text x="40" y="100">Aorta</text><text x="260" y="100">Ventricle</text></svg>',
);

/** Drags across a fraction of the element's box, like drawing with a mouse. */
async function drag(page: Page, el: Locator, from: [number, number], to: [number, number]) {
  const box = (await el.boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 5 });
  await page.mouse.up();
}

test('image occlusion: draw masks, then study one card per mask', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Deck name').fill('Anatomy');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await page.getByLabel('Type').selectOption('image-occlusion');

  await page.getByLabel('Choose an image').setInputFiles({
    name: 'heart.svg',
    mimeType: 'image/svg+xml',
    buffer: IMAGE,
  });
  const stage = page.getByRole('application', { name: 'Drag to add a mask' });
  await expect(stage).toBeVisible();
  await drag(page, stage, [0.05, 0.3], [0.35, 0.7]);
  await drag(page, stage, [0.6, 0.3], [0.95, 0.7]);
  // A click is not a mask.
  await drag(page, stage, [0.5, 0.1], [0.5, 0.1]);
  await expect(page.getByText('2 masks, 2 cards')).toBeVisible();

  // Delete the second, then draw it again: it gets a new number, the first keeps its own.
  await page.getByRole('button', { name: /^Mask 2/ }).click();
  await page.getByRole('button', { name: 'Delete mask' }).click();
  await expect(page.getByText('1 mask, 1 card')).toBeVisible();
  await drag(page, stage, [0.6, 0.3], [0.95, 0.7]);
  await expect(page.getByRole('button', { name: /^Mask 2, card 2/ })).toBeVisible();

  await page.getByLabel('Header').fill('The heart');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/Added 2 cards/);

  await page.getByRole('link', { name: '← Back' }).click();
  await page.getByRole('link', { name: 'Study now' }).click();
  const card = page.locator('.card-content');
  await expect(card.getByText('The heart')).toBeVisible();
  await expect(card.locator('.io-active')).toHaveCount(1);
  // Hide all, guess one: the other mask stays covered.
  await expect(card.locator('.io-inactive')).toHaveCount(1);
  await page.keyboard.press('Space');
  await expect(card.locator('.io-revealed')).toHaveCount(1);
  await expect(card.locator('.io-active')).toHaveCount(0);
});
