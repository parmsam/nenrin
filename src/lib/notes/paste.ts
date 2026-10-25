/**
 * Turns one pasted block of Markdown (e.g. from an LLM) into a card. Tried in order:
 *   1. cloze      — any {{c1::…}} makes a Cloze note; text after a `---` line is Back Extra
 *   2. separator  — a line that is just `---` splits front from back
 *   3. labels     — Q:/A:, Question:/Answer:, Front:/Back: (bold markers like **Q:** are fine)
 *   4. heading    — a first `# Heading` is the front, the rest is the back
 *   5. paragraph  — the first paragraph is the front, the rest is the back
 * A wrapping ``` fence is removed, and a last line `Tags: a b` becomes tags.
 */
import { clozeNumbers } from '../render/template';

export type SplitMethod = 'cloze' | 'separator' | 'labels' | 'heading' | 'paragraph';

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
};

const SEPARATOR = /^\s*---+\s*$/m;
// "Q:", "**Q:**", "**Question**:", "Front -" … at the start of a line.
const label = (names: string) =>
  new RegExp(
    `^[ \\t]*(?:\\*\\*|__)?(?:${names})(?:\\*\\*|__)?[ \\t]*[:：\\-–][ \\t]*(?:\\*\\*|__)?[ \\t]*`,
    'im',
  );
const Q_LABEL = label('q|question|front');
const A_LABEL = label('a|answer|back');

function unwrapFence(text: string): string {
  const m = text.match(/^\s*```[\w-]*[ \t]*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1] : text;
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
