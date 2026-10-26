// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { helpHtml, helpPages, pageBySlug, shotUrl } from './help';
import { SHORTCUTS } from './shortcuts.svelte';

describe('user guide', () => {
  it('lists every guide page in the contents, with a title', () => {
    const pages = helpPages();
    expect(pages.map((p) => p.slug)).toContain('getting-started');
    expect(pages.length).toBeGreaterThanOrEqual(9);
    for (const p of pages) expect(p.title).not.toBe('Help');
  });

  it('turns guide links into app routes and opens outside links in a new tab', () => {
    const html = helpHtml(pageBySlug('README')!);
    expect(html).toContain('href="#/help/getting-started"');
    expect(html).not.toMatch(/href="[\w-]+\.md"/);
    const faq = helpHtml(pageBySlug('faq')!);
    expect(faq).toContain(
      '<a target="_blank" rel="noreferrer" href="https://github.com/parmsam/nenrin"',
    );
  });

  it('documents every single-key shortcut from the shortcuts dialog', () => {
    const md = pageBySlug('keyboard')!.markdown;
    const keys = SHORTCUTS.flatMap((s) => s.items.flatMap((i) => i.keys))
      .filter((combo) => combo.length === 1)
      .map((combo) => combo[0]);
    for (const key of new Set(keys)) expect(md, key).toContain(`<kbd>${key}</kbd>`);
  });

  it('shows each screenshot in the light and dark theme, from the bundle', () => {
    const pictures = helpPages().flatMap((p) => [
      ...p.markdown.matchAll(/<picture>.*?<\/picture>/g),
    ]);
    expect(pictures.length).toBeGreaterThanOrEqual(5);
    for (const page of helpPages()) {
      const html = helpHtml(page);
      expect(html).not.toContain('<picture');
      expect(html).not.toContain('src="images/');
      expect(html.match(/class="shot shot-light"/g)?.length ?? 0).toBe(
        html.match(/class="shot shot-dark"/g)?.length ?? 0,
      );
    }
    for (const [, file] of pictures.flatMap((m) => [...m[0].matchAll(/images\/([\w-]+\.webp)/g)]))
      expect(shotUrl(file), file).toBeTruthy();
  });
});
