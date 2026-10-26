import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/** Makes one card a review that's due now, straight in IndexedDB (the worker reads it there). */
const makeDueReview = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('nenrin');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const store = open.result.transaction('cards', 'readwrite').objectStore('cards');
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result!;
            c.update({ ...c.value, state: 2, due: Date.now() - 60_000 });
            resolve();
          };
        };
      }),
  );

test('study reminder: calendar file, and a notification when reviews are due', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['notifications'], { origin: 'http://localhost:4173' });
  await page.goto('./');
  await page.getByRole('button', { name: 'Add a sample deck' }).click();
  await expect(page.getByRole('link', { name: /Japanese: Nature/ }).first()).toBeVisible();
  await makeDueReview(page);

  await page.goto('./#/settings');
  await page.getByLabel('Remind me at').fill('00:00');
  await page.getByLabel('Remind me at').dispatchEvent('change');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  const ics = await readFile((await (await downloadPromise).path())!, 'utf8');
  expect(ics).toContain('RRULE:FREQ=DAILY');
  expect(ics).toMatch(/DTSTART:\d{8}T000000/);

  await page.getByLabel(/Also notify me/).check();
  await expect(page.getByText('Notifications on.')).toBeVisible();

  // Headless Chromium won't let a service worker show notifications, so record them instead.
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await sw.evaluate(() => {
    const w = self as unknown as { shown: string[]; registration: ServiceWorkerRegistration };
    w.shown = [];
    w.registration.showNotification = async (_title: string, options?: NotificationOptions) => {
      w.shown.push(options?.body ?? '');
    };
  });
  const notifications = () => sw.evaluate(() => (self as unknown as { shown: string[] }).shown);

  // What the page's timer does when the time comes and Nenrin is in the background.
  const check = () =>
    page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      reg.active!.postMessage({ type: 'nenrin-reminder-check' });
    });
  await check();
  await expect.poll(notifications).toEqual(['1 card is due. A few minutes keeps them fresh.']);

  // Once a day only.
  await check();
  await page.waitForTimeout(500);
  expect(await notifications()).toHaveLength(1);
});
