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

test('optional progress bar while reviewing', async ({ page }) => {
  await createDeck(page, 'Rivers');
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await addBasic(page, 'Longest river?', 'Nile');
  await addBasic(page, 'River through Paris?', 'Seine');
  await page.getByRole('link', { name: '← Back' }).click();
  await page.getByRole('link', { name: /Rivers/ }).click();

  // Off by default.
  await page.getByRole('link', { name: 'Study now' }).click();
  await expect(page.getByText('Longest river?')).toBeVisible();
  await expect(page.locator('progress')).toHaveCount(0);

  await page.goto('./#/settings');
  await page.getByLabel('Progress while reviewing').selectOption('fraction');
  await page.goBack();
  await expect(page.getByText('Longest river?')).toBeVisible();
  const bar = page.getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-label', 'Progress: 0 done, 2 left');

  await page.keyboard.press('Space');
  await page.keyboard.press('4');
  await expect(bar).toHaveAttribute('aria-label', 'Progress: 1 done, 1 left');
  await expect(bar).toHaveJSProperty('value', 0.5);
  await expect(page.locator('.session-progress')).toContainText('1 / 2');

  // Undo takes it back.
  await page.keyboard.press('z');
  await expect(bar).toHaveAttribute('aria-label', 'Progress: 0 done, 2 left');

  // Or as a percentage.
  await page.goto('./#/settings');
  await page.getByLabel('Progress while reviewing').selectOption('percent');
  await page.goBack();
  await expect(page.locator('.session-progress')).toContainText('0%');
  await expect(page.getByRole('button', { name: /Show answer/ })).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('4');
  await expect(page.locator('.session-progress')).toContainText('50%');
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

test('keyboard shortcuts dialog opens with ? and closes with Esc', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Undo last rating');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // In review, Esc closes the dialog instead of leaving the session.
  await page.getByRole('link', { name: /Japanese: Nature/ }).click();
  await page.getByRole('link', { name: 'Study now' }).click();
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Show answer/ })).toBeVisible();
});

test('math renders with KaTeX, loaded only when a card has math', async ({ page }) => {
  const katexRequests: string[] = [];
  page.on('request', (r) => {
    if (/katex/i.test(r.url())) katexRequests.push(r.url());
  });
  await page.goto('./');
  await page.getByLabel('Deck name').fill('Math');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: '+ Add cards' }).click();
  expect(katexRequests).toEqual([]);

  await page.getByLabel('Front').fill('Area of a circle: $\\pi r^2$');
  await page.getByLabel('Back').fill('$$\\int_0^1 x\\,dx = \\tfrac12$$');
  await expect(page.locator('.preview .katex')).toBeVisible();
  expect(katexRequests.length).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Back' }).click();
  await expect(page.locator('.preview .katex-display')).toBeVisible();
});

test('Mermaid diagrams render with Pele, loaded only when a card has one', async ({ page }) => {
  const peleRequests: string[] = [];
  page.on('request', (r) => {
    if (/pele|lazy-/i.test(r.url())) peleRequests.push(r.url());
  });
  await page.goto('./');
  await page.getByLabel('Deck name').fill('Diagrams');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await page.getByLabel('Front').fill('Plain front');
  await expect(page.locator('.preview')).toContainText('Plain front');
  expect(peleRequests).toEqual([]);

  await page.getByLabel('Front').fill('```mermaid\nflowchart LR\n  Q[Question] --> A[Answer]\n```');
  const svg = page.locator('.preview .nenrin-diagram svg');
  await expect(svg).toBeVisible();
  await expect(svg).toContainText('Question');
  // Themed from the app's tokens, not Pele's defaults.
  const fg = await page
    .locator('.preview .nenrin-diagram')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--pele-fg').trim());
  expect(fg).not.toBe('');

  // Bad syntax shows the source and an error, never a blank card.
  await page.getByLabel('Front').fill('```mermaid\nflowchart LR\n  A -->\n```');
  await expect(page.locator('.preview .diagram-error')).toBeVisible();
});
