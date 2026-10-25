// Captures app screenshots for the README and the PWA install dialog.
// Usage: npm run screenshots (builds first). Output: public/screenshots/*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const port = 4180;
const url = `http://localhost:${port}/`;
const out = 'public/screenshots';

const shots = [
  { name: 'mobile-empty-light', device: 'iPhone 15', scheme: 'light', sample: false },
  { name: 'mobile-decks-light', device: 'iPhone 15', scheme: 'light', sample: true },
  { name: 'mobile-decks-dark', device: 'iPhone 15', scheme: 'dark', sample: true },
  {
    name: 'desktop-decks-light',
    viewport: { width: 1280, height: 800 },
    scheme: 'light',
    sample: true,
  },
];

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
  detached: true,
});

try {
  for (let i = 0; i < 50; i++) {
    if (
      await fetch(url).then(
        () => true,
        () => false,
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 200));
  }
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
    if (shot.sample) {
      await page.getByRole('button', { name: 'Add a sample deck' }).click();
      await page.getByText('Japanese: Nature').waitFor();
    } else {
      await page.getByRole('button', { name: 'Add a sample deck' }).waitFor();
    }
    await page.screenshot({ path: `${out}/${shot.name}.png` });
    console.log(`${out}/${shot.name}.png`);
    await context.close();
  }
  await browser.close();
} finally {
  process.kill(-server.pid);
}
