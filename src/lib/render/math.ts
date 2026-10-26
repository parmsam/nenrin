/** Renders math placeholders from fieldToHtml with KaTeX, loading it on first use. */
import type katexType from 'katex';

let katex: Promise<typeof katexType> | undefined;

function load(): Promise<typeof katexType> {
  katex ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
    ([m]) => m.default,
  );
  return katex;
}

/** Typesets every `.nenrin-math` placeholder inside `root` that hasn't been rendered yet. */
export async function renderMathIn(root: HTMLElement): Promise<void> {
  const nodes = [...root.querySelectorAll<HTMLElement>('.nenrin-math:not([data-rendered])')];
  if (nodes.length === 0) return;
  const k = await load();
  for (const el of nodes) {
    if (!el.isConnected) continue;
    k.render(el.textContent ?? '', el, {
      displayMode: el.dataset.display === 'true',
      throwOnError: false,
    });
    el.dataset.rendered = 'true';
  }
}
