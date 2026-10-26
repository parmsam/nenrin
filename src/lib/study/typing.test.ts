import { describe, expect, it } from 'vitest';
import { compareTyped } from './typing';

describe('type-in-the-answer comparison', () => {
  it('accepts an exact answer, ignoring surrounding and repeated spaces', () => {
    const c = compareTyped('  Tokyo   tower ', 'Tokyo tower');
    expect(c.correct).toBe(true);
    expect(c.typed).toEqual([{ text: 'Tokyo tower', kind: 'good' }]);
  });

  it('marks wrong and extra characters in the typed text, missing ones in the answer', () => {
    const c = compareTyped('Tokio', 'Tokyo');
    expect(c.correct).toBe(false);
    expect(c.typed).toEqual([
      { text: 'Tok', kind: 'good' },
      { text: 'i', kind: 'bad' },
      { text: 'o', kind: 'good' },
    ]);
    expect(c.expected).toEqual([
      { text: 'Tok', kind: 'good' },
      { text: 'y', kind: 'missing' },
      { text: 'o', kind: 'good' },
    ]);
  });

  it('counts case and accents, like Anki', () => {
    expect(compareTyped('tokyo', 'Tokyo').correct).toBe(false);
    expect(compareTyped('cafe', 'café').correct).toBe(false);
    // Composed and decomposed é are the same answer.
    expect(compareTyped('café', 'café').correct).toBe(true);
  });

  it('handles an empty answer and characters outside the BMP', () => {
    expect(compareTyped('', 'ki').typed).toEqual([]);
    expect(compareTyped('', 'ki').expected).toEqual([{ text: 'ki', kind: 'missing' }]);
    expect(compareTyped('𠮷野家', '𠮷野家').correct).toBe(true);
  });
});
