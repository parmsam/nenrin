/**
 * Turns a note into card HTML: per-field Markdown, then the note type's template, then
 * DOMPurify. Imported Anki content is untrusted; everything goes through sanitize().
 *
 * Math becomes `<span class="nenrin-math">TeX</span>` placeholders; CardView renders them with
 * KaTeX, which is loaded only when a card has math (see ./math.ts). Fenced ```mermaid blocks
 * become `<div class="nenrin-diagram">` placeholders, rendered by Pele (see ./diagram.ts).
 * Both keep the main bundle small.
 */
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { Note, NoteType } from '../db/types';
import { renderTemplate } from './template';

export { clozeNumbers, isEmptyFront, renderTemplate, stripHtml } from './template';

// $$…$$, \[…\], $…$ (no space just inside), \(…\). Same delimiters Anki and Markdown editors use.
const MATH_RE =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$|\\\(([\s\S]+?)\\\)/g;

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderMath(src: string): { text: string; math: string[] } {
  const math: string[] = [];
  const text = src.replace(MATH_RE, (_, block1, block2, inline1, inline2) => {
    const display = block1 !== undefined || block2 !== undefined;
    const tex = block1 ?? block2 ?? inline1 ?? inline2;
    math.push(`<span class="nenrin-math" data-display="${display}">${escapeText(tex)}</span>`);
    return `@@MATH${math.length - 1}@@`;
  });
  return { text, math };
}

// A fenced block (``` or ~~~, 3+ marks) whose info string is a diagram language.
const DIAGRAM_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*(mermaid)[ \t]*\n([\s\S]*?)\n {0,3}\1[`~]*[ \t]*$/gm;

/** Pulls diagram fences out before Markdown and math touch them (`$` is valid Mermaid). */
function extractDiagrams(src: string): { text: string; diagrams: string[] } {
  const diagrams: string[] = [];
  const text = src.replace(DIAGRAM_RE, (_, _fence, lang: string, body: string) => {
    diagrams.push(`<div class="nenrin-diagram" data-lang="${lang}">${escapeText(body)}</div>`);
    return `\n\n@@DIAGRAM${diagrams.length - 1}@@\n\n`;
  });
  return { text, diagrams };
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Anki's `[sound:file.mp3]` → an audio player for that media file. */
function renderSounds(html: string): string {
  return html.replace(
    /\[sound:([^\]]+)\]/g,
    (_, file: string) => `<audio controls preload="none" src="${attr(file.trim())}"></audio>`,
  );
}

/** Converts one field's source to HTML. Markdown notes get Markdown + math; HTML notes get math only. */
export function fieldToHtml(value: string, format: Note['format'] = 'markdown'): string {
  const { text: rest, diagrams } =
    format === 'html' ? { text: value, diagrams: [] } : extractDiagrams(value);
  const { text, math } = renderMath(rest);
  const html =
    format === 'html' ? text : (marked.parse(text, { async: false, breaks: true }) as string);
  return renderSounds(
    html
      .replace(/(?:<p>)?@@DIAGRAM(\d+)@@(?:<\/p>)?/g, (_, i) => diagrams[Number(i)])
      .replace(/@@MATH(\d+)@@/g, (_, i) => math[Number(i)]),
  );
}

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
    // Keep `controls`/`preload` on Anki's audio players.
    ADD_ATTR: ['controls', 'preload'],
  });
}

export interface RenderedCard {
  front: string;
  back: string;
}

/** Context for Anki's special fields {{Deck}} and {{Subdeck}}. */
export interface RenderExtras {
  /** Full deck path segments, e.g. ["Japanese", "Vocab"]. */
  deckPath?: string[];
}

/** `ordinal` is the template index for basic types, or cloze number − 1 for cloze types. */
export function renderCard(
  noteType: NoteType,
  note: Note,
  ordinal: number,
  extras: RenderExtras = {},
): RenderedCard {
  const cloze = noteType.kind === 'cloze' ? ordinal + 1 : undefined;
  const tpl = noteType.kind === 'cloze' ? noteType.templates[0] : noteType.templates[ordinal];
  if (!tpl) return { front: '', back: '' };
  const fields: Record<string, string> = {
    // Special fields first, so a real field with the same name wins.
    Tags: note.tags.join(' '),
    Type: noteType.name,
    Card: tpl.name,
    Deck: extras.deckPath?.join('::') ?? '',
    Subdeck: extras.deckPath?.at(-1) ?? '',
    ...Object.fromEntries(
      Object.entries(note.fields).map(([k, v]) => [k, fieldToHtml(v, note.format)]),
    ),
  };
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

/**
 * Field source → HTML for Anki: Markdown is rendered, but math stays as TeX in Anki's
 * MathJax delimiters, \(…\) and \[…\], so it keeps rendering after export.
 */
export function fieldToAnkiHtml(value: string, format: Note['format'] = 'markdown'): string {
  if (format === 'html') return value;
  const math: string[] = [];
  const text = value.replace(MATH_RE, (_, block1, block2, inline1, inline2) => {
    const display = block1 !== undefined || block2 !== undefined;
    const tex = escapeText(block1 ?? block2 ?? inline1 ?? inline2);
    math.push(display ? `\\[${tex}\\]` : `\\(${tex}\\)`);
    return `@@MATH${math.length - 1}@@`;
  });
  const html = (marked.parse(text, { async: false, breaks: true }) as string).trim();
  // A lone paragraph is just text to Anki; drop the wrapper.
  const unwrapped = /^<p>((?:(?!<\/?p>)[\s\S])*)<\/p>$/.exec(html)?.[1] ?? html;
  return unwrapped.replace(/@@MATH(\d+)@@/g, (_, i) => math[Number(i)]);
}
