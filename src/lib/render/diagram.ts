/**
 * Renders diagram placeholders from fieldToHtml. Mermaid uses Pele (MIT, from the Obsidian
 * team), loaded on first use so cards without diagrams pay nothing. Typst is opt-in per
 * device (see ./typst.ts), compiled in a worker. Colors come from CSS
 * variables (see app.css), so diagrams follow the theme without re-rendering.
 */
import DOMPurify from 'dompurify';
import { cachedTypstSvg, typstEnabled, typstSvg } from './typst';

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

/**
 * Typst draws every glyph as <use href="#glyph">, which the default sanitizer removes. This
 * separate instance allows <use>, but only pointing inside the same SVG.
 */
let typstPurify: ReturnType<typeof DOMPurify> | undefined;

async function typstSvgSafe(source: string): Promise<string> {
  if (!typstPurify) {
    typstPurify = DOMPurify(window);
    typstPurify.addHook('uponSanitizeAttribute', (node, data) => {
      if (
        node.nodeName.toLowerCase() === 'use' &&
        /^(xlink:)?href$/.test(data.attrName) &&
        !data.attrValue.startsWith('#')
      ) {
        data.keepAttr = false;
      }
    });
  }
  return typstPurify.sanitize(await typstSvg(source), {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
  });
}

/** Renders every `.nenrin-diagram` placeholder inside `root` that hasn't been rendered yet. */
export async function renderDiagramsIn(root: HTMLElement): Promise<void> {
  const nodes = [...root.querySelectorAll<HTMLElement>('.nenrin-diagram:not([data-rendered])')];
  for (const el of nodes) {
    const source = el.textContent ?? '';
    const lang = el.dataset.lang;
    el.dataset.rendered = 'true';
    if (lang === 'typst' && !typstEnabled()) {
      // Opt-in (a large download): show the source with a pointer, never an error.
      el.classList.add('source');
      el.innerHTML = `<pre><code>${escapeText(source)}</code></pre><p class="diagram-hint">Typst isn’t on for this device. <a href="#/settings">Enable it in Settings</a> to render this.</p>`;
      continue;
    }
    if (lang === 'typst' && (await cachedTypstSvg(source)) === undefined) {
      // New source: wait for typing to pause (the editor preview re-renders on every key),
      // and skip it if the block was replaced meanwhile.
      await new Promise((r) => setTimeout(r, 300));
      if (!el.isConnected) continue;
    }
    try {
      const svg = lang === 'typst' ? await typstSvgSafe(source) : await mermaidSvg(source);
      if (el.isConnected) {
        el.innerHTML = svg;
        // The SVG's text is outlines; give screen readers the source instead.
        if (lang === 'typst') el.setAttribute('aria-label', source);
      }
    } catch (err) {
      // Show the source and why it failed, never a blank card.
      el.classList.add('failed');
      el.innerHTML = `<pre><code>${escapeText(source)}</code></pre><p class="diagram-error">${escapeText(
        `${lang === 'typst' ? 'Typst' : 'Diagram'} error: ${(err as Error).message}`,
      )}</p>`;
    }
  }
}
