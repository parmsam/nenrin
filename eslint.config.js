import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default defineConfig(
  {
    ignores: ['dist/', 'dev-dist/', 'ref/', 'playwright-report/', 'test-results/'],
  },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: {
      // __APP_VERSION__ is injected by Vite's `define` (see vite.config.ts).
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: ['.svelte'],
        svelteConfig,
      },
    },
  },
);
