// Captures app screenshots for the README and the PWA install dialog.
// Usage: npm run screenshots (builds first). Output: public/screenshots/*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
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
  await page.getByRole('link', { name: '+ Add cards' }).click();
  await page.getByLabel('Type').selectOption('cloze');
  await page
    .getByLabel('Text')
    .fill('**年輪** (nenrin) are the {{c1::growth rings}} of a tree, one per {{c2::year}}.');
  await page.locator('.preview .cloze').waitFor();
};

const shots = [
  { name: 'mobile-empty-light', ...phone, scheme: 'light', setup: async () => {} },
  { name: 'mobile-decks-light', ...phone, scheme: 'light', setup: addSample },
  { name: 'mobile-decks-dark', ...phone, scheme: 'dark', setup: addSample },
  { name: 'mobile-review-light', ...phone, scheme: 'light', setup: reviewAnswer },
  { name: 'mobile-review-dark', ...phone, scheme: 'dark', setup: reviewAnswer },
  { name: 'mobile-deck-light', ...phone, scheme: 'light', setup: openDeck },
  { name: 'mobile-add-light', ...phone, scheme: 'light', setup: addCloze },
  { name: 'desktop-decks-light', ...desktop, scheme: 'light', setup: addSample },
  { name: 'desktop-review-light', ...desktop, scheme: 'light', setup: reviewAnswer },
];

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
    await page.screenshot({ path: `${out}/${shot.name}.png` });
    console.log(`${out}/${shot.name}.png`);
    await context.close();
  }
  await browser.close();
} finally {
  process.kill(-server.pid);
}
