import { expect, test, type Page } from '@playwright/test';

/** A pretend controller: getGamepads() returns it, and tests flip its buttons. */
async function fakeController(page: Page) {
  await page.addInitScript(() => {
    const pad = {
      id: 'Test Controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      vibrationActuator: {
        playEffect() {
          (window as unknown as { rumbles: number }).rumbles++;
          return Promise.resolve('complete');
        },
      },
    };
    Object.assign(window, { pad, rumbles: 0 });
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
}

async function connect(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
}

/** Presses and releases a button, a few frames apart, as a hand would. */
async function tap(page: Page, button: number) {
  const set = (down: boolean) =>
    page.evaluate(
      ([b, d]) => {
        const pad = (window as unknown as { pad: { buttons: { pressed: boolean }[] } }).pad;
        pad.buttons[b as number].pressed = d as boolean;
      },
      [button, down],
    );
  await set(true);
  await page.waitForTimeout(80);
  await set(false);
  await page.waitForTimeout(80);
}

async function deckWithCards(page: Page, n: number) {
  await page.goto('./');
  await page.getByLabel('Deck name').fill('Couch');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Couch' })).toBeVisible();
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await page.getByRole('radio', { name: 'Paste Markdown' }).click();
  await page
    .getByLabel('Markdown')
    .fill(Array.from({ length: n }, (_, i) => `Q: Question ${i + 1}\nA: Answer`).join('\n\n'));
  await page.getByRole('button', { name: `Add all ${n}` }).click();
  await expect(page.getByText(`Added ${n} cards`)).toBeVisible();
}

test('study with a game controller, and remap its buttons', async ({ page }) => {
  await fakeController(page);
  await page.goto('./#/settings');
  await connect(page);
  await expect(page.getByText('Connected: Test Controller')).toBeVisible();

  // Remap Again to RB (button 5). The two actions swap, so Replay audio gets B.
  await page.getByRole('button', { name: /^Again: B\. Change/ }).click();
  await tap(page, 5);
  await expect(page.getByRole('button', { name: /^Again: RB\. Change/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Replay audio: B\. Change/ })).toBeVisible();

  await deckWithCards(page, 2);
  await page.getByRole('link', { name: '← Back' }).click();
  await page.getByRole('link', { name: 'Study now' }).click();
  await connect(page);
  await expect(page.getByText(/^Question 1\s*$/)).toBeVisible();

  // A shows the answer.
  await tap(page, 0);
  await expect(page.getByRole('button', { name: /Again/ })).toBeVisible();
  // RB is Again now: the card goes back into learning, with a rumble.
  await tap(page, 5);
  await expect(page.getByLabel('1 new, 1 learning, 0 to review')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { rumbles: number }).rumbles)).toBe(1);
  // LB undoes it.
  await tap(page, 4);
  await expect(page.getByLabel('2 new, 0 learning, 0 to review')).toBeVisible();
  // View goes back to the deck.
  await tap(page, 8);
  await expect(page.getByRole('link', { name: 'Study now' })).toBeVisible();
});

test('a page turner shows the answer and rates with Page Down and Page Up', async ({ page }) => {
  await deckWithCards(page, 2);
  await page.getByRole('link', { name: '← Back' }).click();
  await page.getByRole('link', { name: 'Study now' }).click();
  await expect(page.getByText(/^Question 1\s*$/)).toBeVisible();

  await page.keyboard.press('PageDown');
  await expect(page.getByRole('button', { name: /Easy/ })).toBeVisible();
  // Page Up is Again: the card goes back into learning.
  await page.keyboard.press('PageUp');
  await expect(page.getByLabel('1 new, 1 learning, 0 to review')).toBeVisible();
  // Page Down twice more: show it, then Good.
  await page.keyboard.press('PageDown');
  await expect(page.getByRole('button', { name: /Easy/ })).toBeVisible();
  await page.keyboard.press('PageDown');
  await expect(page.getByRole('button', { name: /Show answer/ })).toBeVisible();
});
