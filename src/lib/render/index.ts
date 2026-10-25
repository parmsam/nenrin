/**
 * Turns a note into card HTML: per-field Markdown + KaTeX, then the note type's template,
 * then DOMPurify. Imported Anki content is untrusted; everything goes through sanitize().
 */
import DOMPurify from 'dompurify';
import katex from 'katex';
import { marked } from 'marked';
import type { Note, NoteType } from '../db/types';
import { renderTemplate } from './template';

export { clozeNumbers, isEmptyFront, renderTemplate, stripHtml } from './template';

// $$…$$, \[…\], $…$ (no space just inside), \(…\). Same delimiters Anki and Markdown editors use.
const MATH_RE =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$|\\\(([\s\S]+?)\\\)/g;

function renderMath(src: string): { text: string; math: string[] } {
  const math: string[] = [];
  const text = src.replace(MATH_RE, (_, block1, block2, inline1, inline2) => {
    const display = block1 !== undefined || block2 !== undefined;
    const tex = block1 ?? block2 ?? inline1 ?? inline2;
    math.push(katex.renderToString(tex, { displayMode: display, throwOnError: false }));
    return `@@MATH${math.length - 1}@@`;
  });
  return { text, math };
}

/** Converts one field's source to HTML. Markdown notes get Markdown + math; HTML notes get math only. */
export function fieldToHtml(value: string, format: Note['format'] = 'markdown'): string {
  const { text, math } = renderMath(value);
  const html =
    format === 'html' ? text : (marked.parse(text, { async: false, breaks: true }) as string);
  return html.replace(/@@MATH(\d+)@@/g, (_, i) => math[Number(i)]);
}

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form', 'input', 'button'] });
}

export interface RenderedCard {
  front: string;
  back: string;
}

/** `ordinal` is the template index for basic types, or cloze number − 1 for cloze types. */
export function renderCard(noteType: NoteType, note: Note, ordinal: number): RenderedCard {
  const fields = Object.fromEntries(
    Object.entries(note.fields).map(([k, v]) => [k, fieldToHtml(v, note.format)]),
  );
  const cloze = noteType.kind === 'cloze' ? ordinal + 1 : undefined;
  const tpl = noteType.kind === 'cloze' ? noteType.templates[0] : noteType.templates[ordinal];
  if (!tpl) return { front: '', back: '' };
  const front = renderTemplate(tpl.front, fields, { side: 'front', cloze });
  const back = renderTemplate(tpl.back, fields, { side: 'back', cloze, frontSide: front });
  return { front: sanitize(front), back: sanitize(back) };
}

/** Local media filenames referenced by `<img src>` / `<audio src>` in rendered HTML. */
export function mediaRefs(html: string): string[] {
  const refs = new Set<string>();
  for (const m of html.matchAll(/\bsrc="([^"]+)"/g)) {
    if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(m[1])) refs.add(decodeURIComponent(m[1]));
  }
  return [...refs];
}

/** Swaps local media filenames for URLs (e.g. blob: URLs from IndexedDB). */
export function resolveMedia(html: string, urls: Map<string, string>): string {
  return html.replace(/\bsrc="([^"]+)"/g, (whole, src: string) => {
    const url = urls.get(decodeURIComponent(src));
    return url ? `src="${url}"` : whole;
  });
}
