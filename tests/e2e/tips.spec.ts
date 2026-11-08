import { expect, test } from '@playwright/test';

// Tips are on for a new visitor; the shared storage state turns them off for other specs.
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:4173',
        localStorage: [{ name: 'nenrin:splash', value: 'false' }],
      },
    ],
  },
});

test('welcome tips explain the name, close with ×, and come back from Settings', async ({
  page,
}) => {
  await page.goto('./');
  const nameTip = page.getByRole('complementary', { name: /tree rings/ });
  await expect(nameTip).toBeVisible();
  await nameTip.getByRole('button', { name: /Close tip/ }).click();
  await expect(nameTip).toHaveCount(0);

  // Closed for good: still gone after a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Coming from Anki?' })).toBeVisible();
  await expect(nameTip).toHaveCount(0);

  // A deck brings the deck tip; "Hide all tips" hides every one.
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  await page
    .getByRole('link', { name: /Japanese: Nature/ })
    .first()
    .click();
  const deckTip = page.getByRole('complementary', { name: /Three ways through a deck/ });
  await expect(deckTip).toBeVisible();
  await deckTip.getByRole('button', { name: 'Hide all tips' }).click();
  await expect(deckTip).toHaveCount(0);

  // Settings turns them back on, including the one closed earlier.
  await page.goto('./#/settings');
  const toggle = page.getByLabel(/Show welcome tips/);
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.goto('./');
  await expect(nameTip).toBeVisible();
});
