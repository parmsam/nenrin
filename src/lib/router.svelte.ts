/**
 * Minimal hash router (#/deck/123). Hash URLs work on GitHub Pages without server rewrites
 * and keep the service worker's single cached index.html.
 */
const current = () => location.hash.replace(/^#/, '') || '/';

let href = $state(current());
window.addEventListener('hashchange', () => (href = current()));

export const router = {
  get path(): string {
    return href.split('?')[0];
  },
  get query(): URLSearchParams {
    // Rebuilt from reactive `href` on every read and never mutated, so it needn't be reactive itself.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    return new URLSearchParams(href.split('?')[1] ?? '');
  },
};

export function navigate(to: string, { replace = false } = {}): void {
  if (replace) history.replaceState(null, '', `#${to}`);
  else location.hash = to;
  href = current();
}

/** Matches "/deck/:id" against a path. Returns params, or null if it doesn't match. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/');
  const s = path.split('/');
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}
