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
