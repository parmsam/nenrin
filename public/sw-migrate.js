// Imported into the generated service worker (see vite.config.ts).
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
