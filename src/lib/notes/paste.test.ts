import { describe, expect, it } from 'vitest';
import { parsePastedCard } from './paste';

describe('parsePastedCard', () => {
  it('splits at a --- line', () => {
    expect(parsePastedCard('What is **FSRS**?\n\n---\n\nA spaced repetition *scheduler*.')).toEqual(
      {
        kind: 'basic',
        front: 'What is **FSRS**?',
        back: 'A spaced repetition *scheduler*.',
        tags: [],
        method: 'separator',
      },
    );
  });

  it('understands Q:/A: labels in the styles LLMs use', () => {
    for (const text of [
      'Q: Capital of Japan?\nA: Tokyo',
      '**Q:** Capital of Japan?\n**A:** Tokyo',
      '**Question:** Capital of Japan?\n\n**Answer:** Tokyo',
      'Front: Capital of Japan?\nBack: Tokyo',
      'question - Capital of Japan?\nanswer - Tokyo',
    ]) {
      expect(parsePastedCard(text)).toMatchObject({
        front: 'Capital of Japan?',
        back: 'Tokyo',
        method: 'labels',
      });
    }
  });

  it('keeps multi-line answers with lists and code', () => {
    const card = parsePastedCard(
      'Q: Name two FSRS parameters\nA:\n- stability\n- difficulty\n\n```js\nfsrs()\n```',
    );
    expect(card?.back).toBe('- stability\n- difficulty\n\n```js\nfsrs()\n```');
  });

  it('uses a heading as the front', () => {
    expect(parsePastedCard('## Mitochondria\nThe powerhouse of the cell.')).toMatchObject({
      front: 'Mitochondria',
      back: 'The powerhouse of the cell.',
      method: 'heading',
    });
  });

  it('falls back to first paragraph / rest', () => {
    expect(parsePastedCard('What is $e^{i\\pi}$?\n\n$-1$, by Euler’s identity.')).toMatchObject({
      front: 'What is $e^{i\\pi}$?',
      back: '$-1$, by Euler’s identity.',
      method: 'paragraph',
    });
  });

  it('detects clozes, with optional Back Extra after ---', () => {
    expect(
      parsePastedCard('The {{c1::mitochondria}} makes {{c2::ATP}}.\n---\nSee chapter 3.'),
    ).toEqual({
      kind: 'cloze',
      front: 'The {{c1::mitochondria}} makes {{c2::ATP}}.',
      back: 'See chapter 3.',
      tags: [],
      method: 'cloze',
    });
  });

  it('strips a wrapping code fence and reads a final Tags: line', () => {
    const text = '```markdown\nQ: 2 + 2?\nA: 4\n\nTags: math, #arithmetic\n```';
    expect(parsePastedCard(text)).toMatchObject({
      front: '2 + 2?',
      back: '4',
      tags: ['math', 'arithmetic'],
    });
  });

  it('returns null when there is no answer', () => {
    expect(parsePastedCard('Just one line')).toBeNull();
    expect(parsePastedCard('Q: only a question\nA:   ')).toBeNull();
    expect(parsePastedCard('   ')).toBeNull();
  });
});
