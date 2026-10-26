import { describe, expect, it } from 'vitest';
import { parsePastedCard, parsePastedCards } from './paste';

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

  it('unwraps a 4-backtick fence that has a diagram inside', () => {
    const text =
      '````markdown\nQ: Flow?\nA: See:\n\n```mermaid\nflowchart LR\n  A --> B\n```\n````';
    expect(parsePastedCard(text)).toMatchObject({ front: 'Flow?' });
    expect(parsePastedCard(text)?.back).toContain('```mermaid');
  });

  it('keeps a lone diagram fence as content', () => {
    const text = '```mermaid\nflowchart LR\n  A --> B\n```';
    expect(parsePastedCard(text)?.front).toContain('```mermaid');
  });

  it('returns null when there is no answer', () => {
    expect(parsePastedCard('Just one line')).toBeNull();
    expect(parsePastedCard('Q: only a question\nA:   ')).toBeNull();
    expect(parsePastedCard('   ')).toBeNull();
  });
});

describe('parsePastedCards (several cards)', () => {
  it('splits numbered Q/A pairs with an intro line, dividers and headings', () => {
    const text = [
      'Here are 3 flashcards on cell biology:',
      '',
      '### Card 1',
      '1. **Q:** What is the powerhouse of the cell?',
      '   **A:** The mitochondrion.',
      '',
      '---',
      '',
      '### Card 2',
      '2. **Q:** What does DNA stand for?',
      '   **A:** Deoxyribonucleic acid',
      '',
      '---',
      '',
      '3. **Question 3:** Name two organelles.',
      '   **Answer:**',
      '   - nucleus',
      '   - ribosome',
      '',
      'Tags: biology',
    ].join('\n');
    const cards = parsePastedCards(text);
    expect(cards.map((c) => [c.front, c.back])).toEqual([
      ['What is the powerhouse of the cell?', 'The mitochondrion.'],
      ['What does DNA stand for?', 'Deoxyribonucleic acid'],
      ['Name two organelles.', '- nucleus\n   - ribosome'],
    ]);
    expect(cards.every((c) => c.method === 'pairs' && c.tags[0] === 'biology')).toBe(true);
  });

  it('reads a Markdown table, one card per row', () => {
    const text =
      '| Front | Back |\n|---|:---:|\n| 犬 | dog |\n| 猫 | cat<br>(animal) |\n| a \\| b | pipe |';
    expect(parsePastedCards(text).map((c) => [c.front, c.back, c.method])).toEqual([
      ['犬', 'dog', 'table'],
      ['猫', 'cat\n(animal)', 'table'],
      ['a | b', 'pipe', 'table'],
    ]);
  });

  it('makes one cloze card per paragraph', () => {
    const cards = parsePastedCards('{{c1::Paris}} is in France.\n\n{{c1::Tokyo}} is in Japan.');
    expect(cards.map((c) => [c.kind, c.front])).toEqual([
      ['cloze', '{{c1::Paris}} is in France.'],
      ['cloze', '{{c1::Tokyo}} is in Japan.'],
    ]);
  });

  it('falls back to a single card', () => {
    expect(parsePastedCards('Q: one?\nA: yes')).toHaveLength(1);
    expect(parsePastedCards('Front\n---\nBack')).toMatchObject([{ method: 'separator' }]);
    expect(parsePastedCards('nothing here')).toEqual([]);
  });
});
