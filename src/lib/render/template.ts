/**
 * Anki-compatible card templates, as plain string functions (no DOM).
 * Supports {{Field}}, {{FrontSide}}, {{cloze:Field}}, {{#Field}}…{{/Field}} and {{^Field}}…{{/Field}}.
 */

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

export type Side = 'front' | 'back';

/** Distinct cloze numbers used in a text, ascending (`{{c2::…}}` → 2). */
export function clozeNumbers(text: string): number[] {
  const nums = new Set<number>();
  for (const m of text.matchAll(CLOZE_RE)) nums.add(Number(m[1]));
  return [...nums].filter((n) => n > 0).sort((a, b) => a - b);
}

/** Renders cloze `n`: hidden on the front, highlighted on the back. Other clozes show their text. */
export function renderCloze(text: string, n: number, side: Side): string {
  return text.replace(CLOZE_RE, (_, num: string, answer: string, hint?: string) => {
    if (Number(num) !== n) return answer;
    return side === 'front'
      ? `<span class="cloze">[${hint ?? '…'}]</span>`
      : `<span class="cloze">${answer}</span>`;
  });
}

export interface TemplateContext {
  side: Side;
  /** Rendered front, substituted for {{FrontSide}} on the back. */
  frontSide?: string;
  /** Which cloze (1-based) this card tests, for cloze note types. */
  cloze?: number;
}

const isBlank = (html: string | undefined) => !html || stripHtml(html).trim() === '';

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
}

export function renderTemplate(
  template: string,
  fields: Record<string, string>,
  ctx: TemplateContext,
): string {
  // Sections first: {{#Field}}shown if non-empty{{/Field}}, {{^Field}}shown if empty{{/Field}}.
  const withSections = template.replace(
    /\{\{([#^])\s*([^}]+?)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g,
    (_, kind: string, name: string, inner: string) =>
      (kind === '#') !== isBlank(fields[name]) ? inner : '',
  );
  return withSections.replace(/\{\{\s*([^#^/}][^}]*?)\s*\}\}/g, (_, tag: string) => {
    if (tag === 'FrontSide') return ctx.frontSide ?? '';
    const cloze = tag.match(/^cloze:(.+)$/);
    if (cloze) return renderCloze(fields[cloze[1]] ?? '', ctx.cloze ?? 0, ctx.side);
    return fields[tag] ?? '';
  });
}

/** True if a rendered front has no visible content (Anki doesn't create such cards). */
export function isEmptyFront(html: string): boolean {
  return isBlank(html.replace(/<img\b/gi, 'x<img'));
}
