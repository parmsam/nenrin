// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BUILTIN_NOTE_TYPES } from '../notes/builtins';
import type { Note } from '../db/types';
import { fieldToHtml, mediaRefs, renderCard, resolveMedia, sanitize } from '.';
import { clozeNumbers, isEmptyFront, renderCloze, renderTemplate } from './template';

const [basic, , cloze] = BUILTIN_NOTE_TYPES;
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
  });
});

describe('rendering', () => {
  it('renders Markdown and math in fields', () => {
    const html = fieldToHtml('**bold** and $x^2$');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('class="katex"');
    expect(fieldToHtml('costs $5 and $6')).not.toContain('katex');
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
