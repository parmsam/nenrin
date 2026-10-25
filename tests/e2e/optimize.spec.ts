import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/** A backup with one deck of 300 cards, each reviewed 5 times over a few weeks. */
function backupWithHistory(): string {
  const DAY = 86_400_000;
  const start = Date.now() - 60 * DAY;
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const notes = [];
  const cards = [];
  const reviewLogs = [];
  for (let i = 0; i < 300; i++) {
    notes.push({
      id: `n${i}`,
      noteTypeId: 'basic',
      fields: { Front: `q${i}`, Back: `a${i}` },
      tags: [],
      createdAt: start,
      updatedAt: start,
      format: 'markdown',
    });
    let t = start + i * 60_000;
    for (const [k, gap] of [0, 1, 3, 8, 20].entries()) {
      t += gap * DAY;
      const rating = k === 0 ? 3 : rnd() < 0.15 ? 1 : rnd() < 0.2 ? 2 : 3;
      reviewLogs.push({
        id: `l${i}-${k}`,
        cardId: `c${i}`,
        ts: t,
        rating,
        state: k === 0 ? 0 : 2,
        elapsedDays: gap,
        scheduledDays: gap,
        stability: 0,
        difficulty: 0,
        durationMs: 5000,
      });
    }
    cards.push({
      id: `c${i}`,
      noteId: `n${i}`,
      deckId: 'd1',
      ordinal: 0,
      suspended: false,
      buried: false,
      due: t + 30 * DAY,
      stability: 30,
      difficulty: 5,
      scheduledDays: 30,
      learningSteps: 0,
      reps: 5,
      lapses: 0,
      state: 2,
      lastReview: t,
    });
  }
  const backup = {
    app: 'nenrin',
    kind: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      decks: [
        {
          id: 'd1',
          name: 'History',
          config: { newPerDay: 20, reviewsPerDay: 200, desiredRetention: 0.9 },
          createdAt: start,
        },
      ],
      noteTypes: [],
      notes,
      cards,
      reviewLogs,
      settings: [],
    },
    media: [],
  };
  const file = join(mkdtempSync(join(tmpdir(), 'nenrin-opt-')), 'history.json');
  writeFileSync(file, JSON.stringify(backup));
  return file;
}

test('optimizes FSRS parameters from review history', async ({ page }) => {
  await page.goto('./#/settings');
  page.on('dialog', (d) => d.accept());
  await page.locator('input[type=file]').setInputFiles(backupWithHistory());
  await expect(page.getByRole('status')).toHaveText('Restored 300 cards.');

  // Once the service worker controls the app, it serves optimize.html with the isolation
  // headers (production path; the preview server's own headers only cover the first load).
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.goto('./optimize.html?deck=d1');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByText('1,500 reviews')).toBeVisible();

  await page.getByRole('button', { name: 'Optimize' }).click();
  await expect(page.getByRole('heading', { name: 'Your parameters' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('table tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'Use for History' }).click();
  await expect(
    page.getByText('Saved. Future reviews in this deck use your parameters.'),
  ).toBeVisible();

  // Back in the app, the deck shows it uses personal parameters, and can revert.
  await page.getByRole('link', { name: '← Back to Nenrin' }).click();
  await expect(page.getByText('Personal FSRS parameters')).toBeVisible();
  await expect(page.getByText(/from 1,500 reviews/)).toBeVisible();
  await page.getByRole('button', { name: 'Use defaults' }).click();
  await expect(page.getByText('Default FSRS parameters.')).toBeVisible();
});
