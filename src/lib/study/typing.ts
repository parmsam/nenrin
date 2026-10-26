/**
 * Type-in-the-answer: compares what was typed with the expected answer, character by character,
 * as Anki does. Case and accents count; surrounding and repeated spaces don't.
 */

export type DiffKind = 'good' | 'bad' | 'missing';

export interface DiffPart {
  text: string;
  kind: DiffKind;
}

export interface TypedComparison {
  correct: boolean;
  /** What was typed: `good` characters match, `bad` ones are wrong or extra. */
  typed: DiffPart[];
  /** The answer: `good` characters were typed, `missing` ones weren't. */
  expected: DiffPart[];
}

export function normalizeAnswer(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Joins runs of the same kind. */
function runs(chars: string[], kinds: DiffKind[]): DiffPart[] {
  const parts: DiffPart[] = [];
  chars.forEach((ch, i) => {
    const last = parts.at(-1);
    if (last?.kind === kinds[i]) last.text += ch;
    else parts.push({ text: ch, kind: kinds[i] });
  });
  return parts;
}

export function compareTyped(typedRaw: string, expectedRaw: string): TypedComparison {
  // Code points, not UTF-16 units, so kanji outside the BMP and emoji stay whole.
  const a = [...normalizeAnswer(typedRaw)];
  const b = [...normalizeAnswer(expectedRaw)];
  // Longest common subsequence; answers are short, so the O(n·m) table is fine.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const typedKinds = new Array<DiffKind>(a.length).fill('bad');
  const expectedKinds = new Array<DiffKind>(b.length).fill('missing');
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      typedKinds[i++] = 'good';
      expectedKinds[j++] = 'good';
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  return {
    correct: a.join('') === b.join(''),
    typed: runs(a, typedKinds),
    expected: runs(b, expectedKinds),
  };
}
