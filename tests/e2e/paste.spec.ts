import { expect, test } from '@playwright/test';

test('paste Markdown from an LLM to make cards', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Deck name').fill('LLM cards');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: '+ Add cards' }).click();

  await page.getByRole('radio', { name: 'Paste Markdown' }).click();
  const box = page.getByLabel('Markdown');

  // Basic card from bold Q/A labels, with tags on the last line.
  await box.fill(
    '```markdown\n**Q:** What does **FSRS** stand for?\n**A:** Free Spaced Repetition Scheduler\n\nTags: srs memory\n```',
  );
  await expect(page.locator('.detected')).toContainText(
    'Detected: Basic · Split at the Q:/A: labels · tags: srs memory',
  );
  await expect(page.locator('.preview strong')).toHaveText('FSRS');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByText('Added 1 card.')).toBeVisible();
  await expect(box).toHaveValue('');

  // Clozes switch to the Cloze type automatically.
  await box.fill('The {{c1::mitochondria}} makes {{c2::ATP}}.');
  await expect(page.locator('.detected')).toContainText('Detected: Cloze');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Added 2 cards.')).toBeVisible();

  // No answer: explain instead of saving.
  await box.fill('Just a question with no answer');
  await expect(page.locator('.detected')).toContainText('No answer found yet');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Couldn’t find a front and back');

  // The mode is remembered for next time.
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Paste Markdown' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('paste a whole set of cards at once', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Deck name').fill('Set');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await page.getByRole('radio', { name: 'Paste Markdown' }).click();
  await page
    .getByLabel('Markdown')
    .fill(
      'Here are some cards:\n\n1. **Q:** 2 + 2?\n   **A:** 4\n\n---\n\n2. **Q:** 3 × 3?\n   **A:** 9\n\n3. **Q:** 10 / 2?\n   **A:** 5',
    );
  await expect(page.locator('.detected')).toContainText(
    'Detected: 3 cards · One card per Q/A pair',
  );
  await page.getByRole('button', { name: 'Add all 3' }).click();
  await expect(page.getByText('Added 3 cards from 3 notes.')).toBeVisible();
  await page.goto('./');
  await expect(page.getByLabel('3 new, 0 learning, 0 to review')).toBeVisible();
});
