// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BASIC as basic, CLOZE as cloze } from '../notes/builtins';
import type { Note } from '../db/types';
import { fieldToHtml, mediaRefs, renderCard, resolveMedia, sanitize } from '.';
import { clozeNumbers, isEmptyFront, renderCloze, renderTemplate } from './template';

const note = (fields: Record<string, string>, format?: Note['format']): Note => ({
  id: 'n',
  noteTypeId: 'x',
  fields,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  format,
});

describe('templates', () => {
  it('substitutes fields, FrontSide and conditional sections', () => {
    const tpl = '{{FrontSide}}|{{Back}}{{#Extra}} ({{Extra}}){{/Extra}}{{^Extra}}!{{/Extra}}';
    expect(renderTemplate(tpl, { Back: 'b', Extra: '' }, { side: 'back', frontSide: 'F' })).toBe(
      'F|b!',
    );
    expect(renderTemplate(tpl, { Back: 'b', Extra: 'e' }, { side: 'back', frontSide: 'F' })).toBe(
      'F|b (e)',
    );
  });

  it('finds and renders clozes', () => {
    const text = 'The {{c1::cell}} has a {{c2::nucleus::organelle}}. {{c1::Cells}} divide.';
    expect(clozeNumbers(text)).toEqual([1, 2]);
    expect(renderCloze(text, 2, 'front')).toBe(
      'The cell has a <span class="cloze">[organelle]</span>. Cells divide.',
    );
    expect(renderCloze(text, 1, 'back')).toContain('<span class="cloze">cell</span>');
  });

  it('treats a front with only an image as non-empty', () => {
    expect(isEmptyFront('<p> </p>')).toBe(true);
    expect(isEmptyFront('<img src="a.png">')).toBe(false);
    expect(isEmptyFront('[sound:a.mp3]')).toBe(false);
    // A field with only an image or audio still opens its {{#section}}.
    const tpl = '{{#Flag}}Flag: {{Flag}}{{/Flag}}';
    expect(renderTemplate(tpl, { Flag: '<img src="f.svg">' }, { side: 'front' })).toContain(
      'Flag:',
    );
    expect(renderTemplate(tpl, { Flag: '<br>' }, { side: 'front' })).toBe('');
    // Nested sections resolve at every level.
    const nested = '{{#A}}a{{#B}}b{{/B}}{{^C}}!c{{/C}}{{/A}}';
    expect(renderTemplate(nested, { A: '1', B: '1', C: '' }, { side: 'front' })).toBe('ab!c');
    expect(renderTemplate(nested, { A: '1', B: '', C: '1' }, { side: 'front' })).toBe('a');
    expect(renderTemplate(nested, { A: '', B: '1' }, { side: 'front' })).toBe('');
  });
});

describe('rendering', () => {
  it('renders Markdown and math in fields', () => {
    const html = fieldToHtml('**bold** and $x^2$');
    expect(html).toContain('<strong>bold</strong>');
    // Math is a placeholder that CardView typesets with KaTeX, loaded on demand.
    expect(html).toContain('<span class="nenrin-math" data-display="false">x^2</span>');
    expect(fieldToHtml('$$\\sum_i a_i$$')).toContain('data-display="true"');
    expect(fieldToHtml('costs $5 and $6')).not.toContain('nenrin-math');
    // TeX is escaped as text, and the placeholder survives sanitizing.
    expect(sanitize(fieldToHtml('$a<b$'))).toContain(
      '<span class="nenrin-math" data-display="false">a&lt;b</span>',
    );
  });

  it('leaves HTML fields as HTML', () => {
    expect(fieldToHtml('<b>x</b> **y**', 'html')).toBe('<b>x</b> **y**');
  });

  it('strips scripts and event handlers', () => {
    const html = sanitize('<img src="a.png" onerror="alert(1)"><script>alert(2)</script>ok');
    expect(html).not.toMatch(/onerror|script/);
    expect(html).toContain('ok');
  });

  it('renders a basic card front and back', () => {
    const card = renderCard(basic, note({ Front: 'Q', Back: 'A' }), 0);
    expect(card.front).toContain('Q');
    expect(card.back).toContain('Q');
    expect(card.back).toContain('A');
    expect(card.back).toContain('<hr id="answer">');
  });

  it('renders the right cloze for each ordinal', () => {
    const n = note({ Text: '{{c1::A}} and {{c2::B}}', 'Back Extra': '' });
    expect(renderCard(cloze, n, 1).front).toContain('A and <span class="cloze">[…]</span>');
    expect(renderCard(cloze, n, 0).back).toContain('<span class="cloze">A</span> and B');
  });

  it('resolves local media but not remote URLs', () => {
    const html = '<img src="paste-1.png"><img src="https://x.org/a.png">';
    expect(mediaRefs(html)).toEqual(['paste-1.png']);
    expect(resolveMedia(html, new Map([['paste-1.png', 'blob:1']]))).toBe(
      '<img src="blob:1"><img src="https://x.org/a.png">',
    );
  });
});

describe('Anki template features', () => {
  const ctx = { side: 'front' as const };
  it('applies filters right to left', () => {
    const f = { Reading: '年輪[ねんりん]を 見[み]る', Html: '<b>bold</b>', Text: '{{c1::a}}' };
    expect(renderTemplate('{{furigana:Reading}}', f, ctx)).toBe(
      '<ruby>年輪<rt>ねんりん</rt></ruby>を<ruby>見<rt>み</rt></ruby>る',
    );
    expect(renderTemplate('{{kana:Reading}}', f, ctx)).toBe('ねんりんをみる');
    expect(renderTemplate('{{kanji:Reading}}', f, ctx)).toBe('年輪を見る');
    expect(renderTemplate('{{text:Html}}', f, ctx)).toBe('bold');
    expect(renderTemplate('{{text:cloze:Text}}', f, { side: 'back', cloze: 1 })).toBe('a');
    expect(renderTemplate('{{tts en_US:Html}}', f, ctx)).toBe('<b>bold</b>');
    expect(renderTemplate('{{hint:Html}}', f, ctx)).toBe(
      '<details class="hint"><summary>Html</summary><b>bold</b></details>',
    );
  });

  it('turns {{type:…}} into a text box on the front and the expected answer on the back', () => {
    const f = {
      Back: '<b>Tokyo</b> &amp; "Kyoto"',
      Text: '{{c1::年輪}} and {{c1::ring}} {{c2::x}}',
    };
    expect(renderTemplate('{{type:Back}}', f, ctx)).toBe('<span class="nenrin-type"></span>');
    const front = renderTemplate('Q {{type:Back}}', f, ctx);
    expect(
      renderTemplate('{{FrontSide}}<hr id="answer">{{type:Back}}', f, {
        side: 'back',
        frontSide: front,
      }),
    ).toBe(
      'Q <hr id="answer"><span class="nenrin-type-answer" data-expected="Tokyo &amp; &quot;Kyoto&quot;"></span>',
    );
    expect(renderTemplate('{{type:cloze:Text}}', f, { side: 'back', cloze: 1 })).toBe(
      '<span class="nenrin-type-answer" data-expected="年輪, ring"></span>',
    );
    expect(renderTemplate('{{type:nc:Back}}', f, ctx)).toBe('<span class="nenrin-type"></span>');
  });

  it('fills special fields', () => {
    const n = { ...note({ Front: 'q', Back: 'a' }), tags: ['x', 'y'] };
    const tpl = {
      ...basic,
      templates: [
        { name: 'Card 1', front: '{{Tags}}|{{Type}}|{{Card}}|{{Deck}}|{{Subdeck}}', back: '' },
      ],
    };
    expect(renderCard(tpl, n, 0, { deckPath: ['Lang', 'Japanese'] }).front).toBe(
      'x y|Basic|Card 1|Lang::Japanese|Japanese',
    );
  });

  it('turns [sound:] tags into audio players', () => {
    expect(fieldToHtml('[sound:ki.mp3]', 'html')).toBe(
      '<audio controls preload="none" src="ki.mp3"></audio>',
    );
    expect(mediaRefs(sanitize(fieldToHtml('[sound:ki.mp3]', 'html')))).toEqual(['ki.mp3']);
  });
});

describe('diagrams', () => {
  it('turns a ```mermaid fence into a placeholder, untouched by Markdown or math', () => {
    const html = fieldToHtml(
      'Before\n\n```mermaid\nflowchart LR\n  A[$5] --> B["**b**"]\n```\n\nAfter',
    );
    expect(html).toContain(
      '<div class="nenrin-diagram" data-lang="mermaid">flowchart LR\n  A[$5] --&gt; B["**b**"]</div>',
    );
    expect(html).not.toContain('nenrin-math');
    expect(html).not.toContain('<strong>');
    expect(html).toMatch(/<p>Before<\/p>[\s\S]*<p>After<\/p>/);
  });

  it('keeps other code fences as code, and leaves HTML notes alone', () => {
    expect(fieldToHtml('```js\nx\n```')).toContain('<code class="language-js">');
    expect(fieldToHtml('```mermaid\nx\n```', 'html')).not.toContain('nenrin-diagram');
  });

  it('survives sanitizing', () => {
    expect(sanitize(fieldToHtml('```mermaid\npie\n```'))).toContain(
      '<div class="nenrin-diagram" data-lang="mermaid">pie</div>',
    );
  });
});

describe('typst fences', () => {
  it('become diagram placeholders like mermaid', () => {
    expect(fieldToHtml('```typst\n$ x^2 $\n```')).toContain(
      '<div class="nenrin-diagram" data-lang="typst">$ x^2 $</div>',
    );
  });
});
