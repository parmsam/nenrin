// Captures app screenshots for the README and the PWA install dialog, then composes the
// README's row of phones (readme-light.png / readme-dark.png, one per GitHub theme).
// Usage: npm run screenshots (builds first). Output: public/screenshots/*.png
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const port = 4180;
const url = `http://localhost:${port}/`;
const out = 'public/screenshots';
const phone = { device: 'iPhone 15' };
const desktop = { viewport: { width: 1280, height: 800 } };

// Steps that put the app into the state each screenshot shows.
const addSample = async (page) => {
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  await page.getByRole('link', { name: /Japanese: Nature/ }).waitFor();
};
// A few months of demo review history, so the home screen's tree has rings to show.
const DEMO_WEEKS = [12, 30, 0, 45, 8, 60, 22, 0, 35, 90, 15, 40, 5, 70, 28, 0, 50, 33, 18, 64, 12];
const DEMO_DAYS = Array.from({ length: 6 }, () => DEMO_WEEKS).flat();
const withHistory = async (page) => {
  await addSample(page);
  await page.evaluate(
    (days) =>
      new Promise((resolve) => {
        const open = indexedDB.open('nenrin');
        open.onsuccess = () => {
          const tx = open.result.transaction('reviewLogs', 'readwrite');
          const store = tx.objectStore('reviewLogs');
          const now = Date.now();
          days.forEach((n, k) => {
            for (let j = 0; j < n; j++) {
              store.add({
                id: `demo-${k}-${j}`,
                cardId: 'demo',
                ts: now - (days.length - k) * 86_400_000 + j * 1000,
                rating: 3,
                state: 2,
                elapsedDays: 1,
                scheduledDays: 1,
                stability: 1,
                difficulty: 5,
                durationMs: 4000,
              });
            }
          });
          tx.oncomplete = resolve;
        };
      }),
    DEMO_DAYS,
  );
  // Reload so the home screen reads the history, and let the rings finish growing.
  await page.reload();
  await page.getByRole('link', { name: /Japanese: Nature/ }).waitFor();
  await page.waitForTimeout(1800);
};
const openDeck = async (page) => {
  await addSample(page);
  await page.getByRole('link', { name: /Japanese: Nature/ }).click();
  await page.getByRole('link', { name: 'Study now' }).waitFor();
};
const reviewAnswer = async (page) => {
  await openDeck(page);
  await page.getByRole('link', { name: 'Study now' }).click();
  await page.getByRole('button', { name: /Show answer/ }).click();
  await page.getByRole('button', { name: /Good/ }).waitFor();
};
const addCloze = async (page) => {
  await addSample(page);
  await page.getByRole('link', { name: 'Add cards', exact: true }).click();
  await page.getByLabel('Type').selectOption('cloze');
  await page
    .getByLabel('Text')
    .fill('**年輪** (nenrin) are the {{c1::growth rings}} of a tree, one per {{c2::year}}.');
  await page.locator('.preview .cloze').waitFor();
};

const shots = [
  { name: 'mobile-empty-light', ...phone, scheme: 'light', setup: async () => {} },
  { name: 'mobile-decks-light', ...phone, scheme: 'light', setup: withHistory },
  { name: 'mobile-decks-dark', ...phone, scheme: 'dark', setup: withHistory },
  { name: 'mobile-review-light', ...phone, scheme: 'light', setup: reviewAnswer },
  { name: 'mobile-review-dark', ...phone, scheme: 'dark', setup: reviewAnswer },
  { name: 'mobile-deck-light', ...phone, scheme: 'light', setup: openDeck },
  { name: 'mobile-deck-dark', ...phone, scheme: 'dark', setup: openDeck },
  { name: 'mobile-add-light', ...phone, scheme: 'light', setup: addCloze },
  { name: 'mobile-add-dark', ...phone, scheme: 'dark', setup: addCloze },
  { name: 'desktop-decks-light', ...desktop, scheme: 'light', setup: withHistory },
  { name: 'desktop-review-light', ...desktop, scheme: 'light', setup: reviewAnswer },
];

/** Lays four phone screenshots side by side, same size, with rounded corners. */
async function composeReadme(browser) {
  for (const scheme of ['light', 'dark']) {
    const names = ['decks', 'review', 'add', 'deck'].map((n) => `mobile-${n}-${scheme}`);
    const imgs = names
      .map((n) => readFileSync(`${out}/${n}.png`).toString('base64'))
      .map((b64) => `<img src="data:image/png;base64,${b64}">`)
      .join('');
    const border = scheme === 'light' ? '#e8dccb' : '#3a332c';
    const page = await browser.newPage({
      deviceScaleFactor: 2,
      viewport: { width: 1280, height: 700 },
    });
    await page.setContent(`<style>
      body { margin: 0; background: transparent; }
      .row { display: flex; gap: 28px; padding: 24px; width: max-content; }
      img { width: 280px; border-radius: 30px; border: 1px solid ${border};
            box-shadow: 0 10px 30px rgb(0 0 0 / 18%); }
    </style><div class="row">${imgs}</div>`);
    await page
      .locator('.row')
      .screenshot({ path: `${out}/readme-${scheme}.png`, omitBackground: true });
    console.log(`${out}/readme-${scheme}.png`);
    await page.close();
  }
}

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
  detached: true,
});
const up = () =>
  fetch(url).then(
    () => true,
    () => false,
  );

try {
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const shot of shots) {
    const context = await browser.newContext({
      ...(shot.device ? devices[shot.device] : { viewport: shot.viewport, deviceScaleFactor: 1 }),
      colorScheme: shot.scheme,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.goto(url);
    await page.getByRole('heading', { name: 'Nenrin' }).waitFor();
    await shot.setup(page);
    // Start at the top, with no focus ring left from the clicks that got here.
    await page.evaluate(() => {
      document.activeElement?.blur();
      scrollTo(0, 0);
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}/${shot.name}.png` });
    console.log(`${out}/${shot.name}.png`);
    await context.close();
  }
  await composeReadme(browser);
  await browser.close();
} finally {
  process.kill(-server.pid);
}
