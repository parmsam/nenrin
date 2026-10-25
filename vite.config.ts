/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves project sites from /<repo>/; CI sets BASE_PATH accordingly.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
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
            src: 'screenshots/mobile-decks-light.png',
            sizes: '1179x1977',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Your decks and what is due today',
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm}'],
        globIgnores: ['screenshots/**'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
