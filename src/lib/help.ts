/**
 * The user guide, from docs/guide/*.md: one source for GitHub and the in-app Help screen.
 * The Markdown is bundled into the Help chunk, so Help works offline.
 */
import { marked } from 'marked';
import { sanitize } from './render';

const files = import.meta.glob('../../docs/guide/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Screenshots (from `npm run screenshots`), bundled as assets so they're precached too.
const shots = import.meta.glob('../../docs/guide/images/*.webp', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface HelpPage {
  /** File name without .md; "README" is the contents page. */
  slug: string;
  title: string;
  markdown: string;
}

const pages: HelpPage[] = Object.entries(files).map(([path, markdown]) => ({
  slug: path.split('/').pop()!.replace(/\.md$/, ''),
  title: /^#\s+(.+)$/m.exec(markdown)?.[1].trim() ?? 'Help',
  markdown,
}));

/** Pages in the order the contents page lists them. */
export function helpPages(): HelpPage[] {
  const order = [...(pageBySlug('README')?.markdown ?? '').matchAll(/\]\(([\w-]+)\.md\)/g)].map(
    (m) => m[1],
  );
  return order.map(pageBySlug).filter((p): p is HelpPage => !!p);
}

export function pageBySlug(slug: string): HelpPage | undefined {
  return pages.find((p) => p.slug === slug);
}

/**
 * A guide page as sanitized HTML. Links to other guide pages become app routes, and
 * outside links open in a new tab.
 */
export function helpHtml(page: HelpPage): string {
  const html = marked.parse(withShots(page.markdown), { async: false }) as string;
  // DOMPurify drops `target`, so outside links get it after sanitizing.
  return sanitize(html).replace(/<a href="([^"]+)"/g, (whole, href: string) => {
    const local = /^([\w-]+)\.md(?:#[\w-]*)?$/.exec(href);
    if (local) return `<a href="#/help/${local[1] === 'README' ? '' : local[1]}"`;
    if (/^https?:/.test(href)) return `<a target="_blank" rel="noreferrer" href="${href}"`;
    return whole;
  });
}

const PICTURE =
  /<picture><source media="\(prefers-color-scheme: dark\)" srcset="images\/([\w-]+\.webp)"><img src="images\/([\w-]+\.webp)" alt="([^"]*)"[^>]*><\/picture>/g;

/**
 * The guide's screenshots are `<picture>`s that pick light or dark by the OS theme, for GitHub.
 * In the app, Settings can override the OS theme, so each becomes a pair of images and CSS
 * shows the one for the app's theme.
 */
function withShots(markdown: string): string {
  return markdown.replace(PICTURE, (_, dark: string, light: string, alt: string) => {
    const img = (file: string, theme: string) =>
      `<img class="shot shot-${theme}" src="${shotUrl(file)}" alt="${alt}">`;
    return img(light, 'light') + img(dark, 'dark');
  });
}

export function shotUrl(file: string): string | undefined {
  return shots[`../../docs/guide/images/${file}`];
}
