/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

/**
 * The optimizer page needs cross-origin isolation (COOP/COEP) for WASM threads. In production the
 * service worker adds these headers (public/sw-custom.js); this does the same for `vite` and
 * `vite preview`, including the very first load before the service worker is installed.
 */
function isolateOptimizerPage(): Plugin {
  const middleware = (
    req: { url?: string },
    res: { setHeader(k: string, v: string): void },
    next: () => void,
  ) => {
    const path = req.url?.split('?')[0] ?? '';
    if (path.endsWith('/optimize.html')) {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    } else if (/optimize\.worker/.test(path)) {
      // The isolated page's worker must carry the embedder policy too, or it won't start.
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }
    next();
  };
  return {
    name: 'nenrin-isolate-optimizer',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

// GitHub Pages serves project sites from /<repo>/; CI sets BASE_PATH accordingly.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    isolateOptimizerPage(),
    svelte(),
    VitePWA({
      // New versions wait for the user (UpdatePrompt.svelte) instead of swapping in mid-review.
      registerType: 'prompt',
      pwaAssets: {
        image: 'public/favicon.svg',
        preset: 'minimal-2023',
        overrideManifestIcons: true,
      },
      manifest: {
        name: 'Nenrin',
        short_name: 'Nenrin',
        description: 'Local-first flashcards with FSRS spaced repetition.',
        theme_color: '#2b2520',
        background_color: '#faf6ef',
        display: 'standalone',
        start_url: base,
        scope: base,
        // Shown in the richer install dialog on Android and desktop Chrome. Regenerate with `npm run screenshots`.
        screenshots: [
          {
            src: 'screenshots/mobile-review-light.png',
            sizes: '1179x1977',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Review with FSRS: interval previews on every button',
          },
          {
            src: 'screenshots/mobile-decks-light.png',
            sizes: '1179x1977',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Your decks and what is due today',
          },
          {
            src: 'screenshots/desktop-review-light.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Keyboard-first review on desktop',
          },
          {
            src: 'screenshots/desktop-decks-light.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Nenrin on desktop',
          },
        ],
      },
      workbox: {
        // The plugin precaches manifest.webmanifest itself. Globbing it too creates a
        // conflicting duplicate entry, and Workbox then silently precaches nothing.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,wasm,woff2}'],
        // Typst (~29 MB) is opt-in: downloaded into its own cache from Settings, never precached.
        globIgnores: ['screenshots/**', '**/typst_ts_*.wasm', 'typst/**'],
        // Control the page on first install; later updates still wait for the prompt.
        clientsClaim: true,
        // Update-prompt rescue + isolation headers for optimize.html (see public/sw-custom.js).
        importScripts: ['sw-custom.js'],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: { main: 'index.html', optimize: 'optimize.html' },
    },
  },
  // Pre-bundle up front so the dev server doesn't reload mid-session when the import
  // worker first pulls these in.
  optimizeDeps: { include: ['sql.js', 'fflate', 'fzstd'] },
  // ES module workers, so the Anki import worker can share code chunks with the app.
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
