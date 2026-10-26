/**
 * Renders diagram placeholders from fieldToHtml. Mermaid uses Pele (MIT, from the Obsidian
 * team), loaded on first use so cards without diagrams pay nothing. Colors come from CSS
 * variables (see app.css), so diagrams follow the theme without re-rendering.
 */
import DOMPurify from 'dompurify';

type Pele = typeof import('pele/lazy');
let pele: Promise<Pele> | undefined;
/** Unique id prefixes, so two diagrams on one page (front and back) don't share ids. */
let count = 0;

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Renders Mermaid source to sanitized SVG markup. Throws Pele's error on bad syntax. */
export async function mermaidSvg(source: string): Promise<string> {
  pele ??= import('pele/lazy').catch((err) => {
    pele = undefined;
    throw err;
  });
  const { renderAsync } = await pele;
  const { svg } = await renderAsync(source, {
    // No links or remote images: cards render offline and can't navigate away.
    links: false,
    images: false,
    idPrefix: `nd${++count}-`,
  });
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}

/** Renders every `.nenrin-diagram` placeholder inside `root` that hasn't been rendered yet. */
export async function renderDiagramsIn(root: HTMLElement): Promise<void> {
  const nodes = [
    ...root.querySelectorAll<HTMLElement>(
      '.nenrin-diagram[data-lang="mermaid"]:not([data-rendered])',
    ),
  ];
  for (const el of nodes) {
    const source = el.textContent ?? '';
    el.dataset.rendered = 'true';
    try {
      const svg = await mermaidSvg(source);
      if (el.isConnected) el.innerHTML = svg;
    } catch (err) {
      // Show the source and why it failed, never a blank card.
      el.classList.add('failed');
      el.innerHTML = `<pre><code>${escapeText(source)}</code></pre><p class="diagram-error">${escapeText(
        `Diagram error: ${(err as Error).message}`,
      )}</p>`;
    }
  }
}
