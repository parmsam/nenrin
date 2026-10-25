/**
 * Anki-compatible card templates, as plain string functions (no DOM).
 * Supports {{Field}}, {{FrontSide}}, {{#Field}}…{{/Field}}, {{^Field}}…{{/Field}}, special fields
 * (Tags, Type, Deck, Subdeck, Card) and filters, chained right to left as in Anki:
 * cloze, text, hint, type, furigana, kana, kanji, tts. Unknown filters pass the value through.
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

// Anki's ruby syntax: "漢字[かんじ]", with an optional leading space to separate words.
const RUBY_RE = / ?([^ >[\]]+?)\[([^\]]+)\]/g;

/** Applies one template filter (e.g. `text`, `furigana`) to a value. */
function applyFilter(
  filter: string,
  value: string,
  fieldName: string,
  ctx: TemplateContext,
): string {
  // `tts en_US voices=…` carries options after the name.
  const name = filter.split(/\s+/)[0];
  switch (name) {
    case 'cloze':
      return renderCloze(value, ctx.cloze ?? 0, ctx.side);
    case 'text':
      return stripHtml(value);
    case 'hint':
      return isBlank(value)
        ? ''
        : `<details class="hint"><summary>${fieldName}</summary>${value}</details>`;
    case 'type':
      // Type-in-the-answer isn't supported yet; show nothing rather than raw markup.
      return '';
    case 'furigana':
      return value.replace(RUBY_RE, '<ruby>$1<rt>$2</rt></ruby>');
    case 'kana':
      return value.replace(RUBY_RE, '$2');
    case 'kanji':
      return value.replace(RUBY_RE, '$1');
    case 'tts':
      return value;
    default:
      return value;
  }
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
    const parts = tag.split(':');
    const fieldName = parts.pop()!.trim();
    return parts
      .reverse()
      .reduce(
        (value, filter) => applyFilter(filter.trim(), value, fieldName, ctx),
        fields[fieldName] ?? '',
      );
  });
}

/** True if a rendered front has no visible content (Anki doesn't create such cards). */
export function isEmptyFront(html: string): boolean {
  return isBlank(html.replace(/<img\b/gi, 'x<img'));
}
