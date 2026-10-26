/**
 * Anki-compatible card templates, as plain string functions (no DOM).
 * Supports {{Field}}, {{FrontSide}}, {{#Field}}…{{/Field}}, {{^Field}}…{{/Field}}, special fields
 * (Tags, Type, Deck, Subdeck, Card) and filters, chained right to left as in Anki:
 * cloze, text, hint, type, furigana, kana, kanji, tts. Unknown filters pass the value through.
 *
 * `{{type:Field}}` (and `{{type:cloze:Field}}`) becomes a placeholder: CardView puts a text box
 * in it on the front, and the comparison with the answer (from data-expected) on the back.
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

/** No visible text and no media. An image-only field isn't empty (Anki agrees). */
const isBlank = (html: string | undefined) =>
  !html ||
  stripHtml(
    html.replace(/<(?:img|audio|video)\b/gi, 'x$&').replace(/\[sound:[^\]]+\]/g, 'x'),
  ).trim() === '';

const TYPE_BOX = '<span class="nenrin-type"></span>';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Field HTML → the plain text someone would type. */
function answerText(html: string): string {
  return stripHtml(html.replace(/<br\s*\/?>/gi, ' '))
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, name: string) => {
      if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole;
      const code =
        name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    })
    .trim();
}

/** The answers of cloze `n`, joined as Anki does for several. */
function clozeAnswers(text: string, n: number): string {
  return [...text.matchAll(CLOZE_RE)]
    .filter((m) => Number(m[1]) === n)
    .map((m) => answerText(m[2]))
    .join(', ');
}

/** `{{type:Field}}`, `{{type:nc:Field}}` or `{{type:cloze:Field}}`. */
function renderTypeTag(
  filters: string[],
  fieldName: string,
  fields: Record<string, string>,
  ctx: TemplateContext,
): string {
  if (ctx.side === 'front') return TYPE_BOX;
  const value = fields[fieldName] ?? '';
  const expected = filters.includes('cloze')
    ? clozeAnswers(value, ctx.cloze ?? 0)
    : answerText(value);
  const attr = expected.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<span class="nenrin-type-answer" data-expected="${attr}"></span>`;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
}

export function renderTemplate(
  template: string,
  fields: Record<string, string>,
  ctx: TemplateContext,
): string {
  // Sections first: {{#Field}}shown if non-empty{{/Field}}, {{^Field}}shown if empty{{/Field}}.
  // Each pass resolves the outermost sections; repeat for sections nested inside them.
  const section = /\{\{([#^])\s*([^}]+?)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g;
  let withSections = template;
  for (let depth = 0; depth < 10; depth++) {
    const next = withSections.replace(section, (_, kind: string, name: string, inner: string) =>
      (kind === '#') !== isBlank(fields[name]) ? inner : '',
    );
    if (next === withSections) break;
    withSections = next;
  }
  return withSections.replace(/\{\{\s*([^#^/}][^}]*?)\s*\}\}/g, (_, tag: string) => {
    // The back shows the comparison, not the front's text box again.
    if (tag === 'FrontSide') return (ctx.frontSide ?? '').replaceAll(TYPE_BOX, '');
    const parts = tag.split(':');
    const fieldName = parts.pop()!.trim();
    if (parts[0]?.trim() === 'type') {
      return renderTypeTag(
        parts.map((p) => p.trim()),
        fieldName,
        fields,
        ctx,
      );
    }
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
  return isBlank(html);
}
