/**
 * Turns one pasted block of Markdown (e.g. from an LLM) into a card. Tried in order:
 *   1. cloze      — any {{c1::…}} makes a Cloze note; text after a `---` line is Back Extra
 *   2. separator  — a line that is just `---` splits front from back
 *   3. labels     — Q:/A:, Question:/Answer:, Front:/Back: (bold markers like **Q:** are fine)
 *   4. heading    — a first `# Heading` is the front, the rest is the back
 *   5. paragraph  — the first paragraph is the front, the rest is the back
 * A wrapping ``` (or ````) fence is removed, and a last line `Tags: a b` becomes tags.
 *
 * parsePastedCards() also recognises several cards in one block: repeated Q/A pairs (numbered,
 * bulleted, or separated by --- or headings), a Markdown table, or several cloze paragraphs.
 */
import { clozeNumbers } from '../render/template';

export type SplitMethod =
  'cloze' | 'separator' | 'labels' | 'heading' | 'paragraph' | 'pairs' | 'table' | 'clozes';

export interface PastedCard {
  kind: 'basic' | 'cloze';
  front: string;
  back: string;
  tags: string[];
  method: SplitMethod;
}

export const SPLIT_LABELS: Record<SplitMethod, string> = {
  cloze: 'Cloze deletions',
  separator: 'Split at the --- line',
  labels: 'Split at the Q:/A: labels',
  heading: 'Heading as the front',
  paragraph: 'First paragraph as the front',
  pairs: 'One card per Q/A pair',
  table: 'One card per table row',
  clozes: 'One cloze card per paragraph',
};

const SEPARATOR = /^\s*---+\s*$/m;
// "Q:", "**Q:**", "**Question 3**:", "1. Q1:", "- Front -" … at the start of a line.
const label = (names: string, flags = 'im') =>
  new RegExp(
    `^[ \\t]*(?:(?:\\d+[.)]|[-*+])[ \\t]+)?(?:\\*\\*|__)?(?:${names})[ \\t]*\\d*(?:\\*\\*|__)?[ \\t]*[:：\\-–][ \\t]*(?:\\*\\*|__)?[ \\t]*`,
    flags,
  );
const Q_LABEL = label('q|question|front');
const A_LABEL = label('a|answer|back');
const Q_LABEL_ALL = label('q|question|front', 'img');

function unwrapFence(text: string): string {
  // 3+ backticks: LLMs use ```` to wrap Markdown that has ``` blocks (e.g. diagrams) inside.
  const m = text.match(/^\s*(`{3,})([\w-]*)[ \t]*\n([\s\S]*?)\n\1\s*$/);
  // A lone diagram is content, not a wrapper.
  return m && !/^(mermaid|typst)$/i.test(m[2]) ? m[3] : text;
}

function takeTags(text: string): { text: string; tags: string[] } {
  const m = text.match(/\n?^[ \t]*(?:\*\*)?tags(?:\*\*)?[ \t]*:[ \t]*(.+)\s*$/im);
  if (!m || m.index === undefined || text.slice(m.index + m[0].length).trim()) {
    return { text, tags: [] };
  }
  const tags = m[1]
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, ''))
    .filter(Boolean);
  return { text: text.slice(0, m.index), tags };
}

export function parsePastedCard(input: string): PastedCard | null {
  const { text: body, tags } = takeTags(unwrapFence(input.replace(/\r\n?/g, '\n')).trim());
  const text = body.trim();
  if (!text) return null;

  if (clozeNumbers(text).length > 0) {
    const sep = text.match(SEPARATOR);
    const front = sep?.index !== undefined ? text.slice(0, sep.index) : text;
    const back = sep?.index !== undefined ? text.slice(sep.index + sep[0].length) : '';
    return { kind: 'cloze', front: front.trim(), back: back.trim(), tags, method: 'cloze' };
  }

  const done = (front: string, back: string, method: SplitMethod): PastedCard | null =>
    front.trim() && back.trim()
      ? { kind: 'basic', front: front.trim(), back: back.trim(), tags, method }
      : null;

  const sep = text.match(SEPARATOR);
  if (sep?.index !== undefined) {
    return done(text.slice(0, sep.index), text.slice(sep.index + sep[0].length), 'separator');
  }

  const a = text.match(A_LABEL);
  if (a?.index !== undefined) {
    const before = text.slice(0, a.index);
    const q = before.match(Q_LABEL);
    const front = q?.index !== undefined ? before.slice(q.index + q[0].length) : before;
    return done(front, text.slice(a.index + a[0].length), 'labels');
  }

  const heading = text.match(/^#{1,6}[ \t]+(.+)\n([\s\S]+)$/);
  if (heading) return done(heading[1], heading[2], 'heading');

  const para = text.match(/^([\s\S]+?)\n[ \t]*\n([\s\S]+)$/);
  if (para) return done(para[1], para[2], 'paragraph');

  return null;
}

/** Leftover dividers between cards: trailing `---` lines and "### Card 2"-style headings. */
function trimDividers(text: string): string {
  return text.replace(/(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,}|#{1,6}[ \t].*)?[ \t]*)+\s*$/, '').trim();
}

function parseTable(text: string): [string, string][] | null {
  const lines = text.split('\n').filter((l) => l.trim());
  const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  if (lines.length < 3 || !lines.every(isRow)) return null;
  const cells = (l: string) =>
    l
      .trim()
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, '|'));
  if (!cells(lines[1]).every((c) => /^:?-{3,}:?$/.test(c))) return null;
  const rows = lines
    .slice(2)
    .map(cells)
    .filter((r) => r.length >= 2 && r[0] && r[1]);
  return rows.length
    ? rows.map((r) => [r[0].replace(/<br\s*\/?>/gi, '\n'), r[1].replace(/<br\s*\/?>/gi, '\n')])
    : null;
}

/** Like parsePastedCard, but finds several cards in one block when they're there. */
export function parsePastedCards(input: string): PastedCard[] {
  const { text: body, tags } = takeTags(unwrapFence(input.replace(/\r\n?/g, '\n')).trim());
  const text = body.trim();
  if (!text) return [];
  const basic = (front: string, back: string, method: SplitMethod): PastedCard[] =>
    front.trim() && back.trim()
      ? [{ kind: 'basic', front: front.trim(), back: back.trim(), tags, method }]
      : [];

  const table = parseTable(text);
  if (table) return table.flatMap(([front, back]) => basic(front, back, 'table'));

  const starts = [...text.matchAll(Q_LABEL_ALL)];
  if (starts.length >= 2) {
    return starts.flatMap((m, i) => {
      const chunk = text.slice(m.index! + m[0].length, starts[i + 1]?.index ?? text.length);
      const a = chunk.match(A_LABEL);
      if (a?.index === undefined) return [];
      return basic(
        chunk.slice(0, a.index),
        trimDividers(chunk.slice(a.index + a[0].length)),
        'pairs',
      );
    });
  }

  const paragraphs = text
    .split(/\n[ \t]*\n/)
    .map((p) => trimDividers(p))
    .filter(Boolean);
  if (paragraphs.length >= 2 && paragraphs.every((p) => clozeNumbers(p).length > 0)) {
    return paragraphs.map((p) => ({ kind: 'cloze', front: p, back: '', tags, method: 'clozes' }));
  }

  const single = parsePastedCard(input);
  return single ? [single] : [];
}
