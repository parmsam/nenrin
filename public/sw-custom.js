// Imported into the generated service worker (see vite.config.ts).

// 1. Rescue devices on versions without the update prompt.
//
// Versions before 0.3.0's update prompt auto-updated and have no prompt UI. A new worker
// would wait behind them indefinitely (reloads don't release a waiting worker), leaving
// those users stuck on the old version. So: if no prompt-capable page has ever run here,
// take over immediately. Pages with the prompt leave a marker (UpdatePrompt.svelte), and
// from then on new versions wait for the user to choose "Reload".
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .match(new URL('__nenrin-update-prompt', self.registration.scope).href)
      .then((marker) => {
        if (!marker) return self.skipWaiting();
      }),
  );
});

// 2. Cross-origin isolation for the optimizer page only.
//
// The FSRS optimizer (WASM threads) needs SharedArrayBuffer, which browsers only allow on
// cross-origin isolated pages. GitHub Pages can't send the headers, so this worker adds them
// to optimize.html alone; the main app stays un-isolated so remote images and sign-in popups
// keep working. This listener is registered before Workbox's, so it answers first.
// The isolated page's worker script needs the embedder policy too, or the browser won't start it.
const isIsolatedPage = (request, path) => request.mode === 'navigate' && path === 'optimize.html';
const isIsolatedWorker = (request, path) =>
  request.destination === 'worker' && /(^|\/)optimize\.worker[^/]*\.js$/.test(path);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  const page = isIsolatedPage(request, path);
  if (!page && !isIsolatedWorker(request, path)) return;
  event.respondWith(
    (async () => {
      const response =
        (await caches.match(url.origin + url.pathname, { ignoreSearch: true })) ??
        (await fetch(request));
      const headers = new Headers(response.headers);
      if (page) headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    })(),
  );
});

// 3. Study reminders, without a server (see src/lib/reminder.ts).
//
// The page asks for a check when its timer reaches the reminder time, and installed Chromium
// apps also wake this worker with Periodic Background Sync. Either way: if notifications are
// on, the reminder time has passed today, nothing was studied today, and cards are due, show
// one notification per day. Reads Nenrin's IndexedDB directly (schema: src/lib/db/index.ts).
const DB_NAME = 'nenrin';
const NEW = 0; // ts-fsrs State.New

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function reminderCheck(now = Date.now()) {
  const db = await request(indexedDB.open(DB_NAME));
  try {
    if (!['settings', 'cards', 'reviewLogs'].every((s) => db.objectStoreNames.contains(s))) return;
    const tx = db.transaction(['settings', 'cards', 'reviewLogs'], 'readwrite');
    const settings = tx.objectStore('settings');
    const prefs = (await request(settings.get('prefs')))?.value ?? {};
    if (!prefs.reminderNotify) return;

    const [hour, minute] = String(prefs.reminderTime ?? '19:00').split(':').map(Number);
    const today = new Date(now);
    const remindAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour || 0, minute || 0);
    if (now < remindAt.getTime()) return;
    const dayKey = remindAt.toDateString();
    if ((await request(settings.get('reminderShownOn')))?.value === dayKey) return;

    // Studied since the study day began (rollover hour, 4 AM by default)? Then no nagging.
    const rollover = prefs.rolloverHour ?? 4;
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), rollover);
    if (dayStart.getTime() > now) dayStart.setDate(dayStart.getDate() - 1);
    const studied = await request(
      tx.objectStore('reviewLogs').index('ts').count(IDBKeyRange.lowerBound(dayStart.getTime())),
    );
    if (studied > 0) return;

    // Reviews and learning cards due now (new cards are always "due", so they're left out).
    let due = 0;
    await new Promise((resolve, reject) => {
      const cursor = tx.objectStore('cards').index('due').openCursor(IDBKeyRange.upperBound(now));
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        const card = c.value;
        if (card.state !== NEW && !card.suspended) due++;
        c.continue();
      };
    });
    if (due === 0) return;

    await request(settings.put({ key: 'reminderShownOn', value: dayKey }));
    await self.registration.showNotification('Time to study', {
      body: `${due} ${due === 1 ? 'card is' : 'cards are'} due. A few minutes keeps them fresh.`,
      icon: new URL('pwa-192x192.png', self.registration.scope).href,
      tag: 'nenrin-reminder',
    });
  } finally {
    db.close();
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'nenrin-reminder-check') event.waitUntil(reminderCheck());
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'nenrin-reminder') event.waitUntil(reminderCheck());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) return open.focus();
      return self.clients.openWindow(self.registration.scope);
    })(),
  );
});
