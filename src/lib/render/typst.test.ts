import { describe, expect, it } from 'vitest';
import { TYPST_INK, typstDocument } from './typst';

describe('Typst blocks', () => {
  it('wraps the source in an auto-sized page with text in the theme marker color', () => {
    const doc = typstDocument('$ x^2 $');
    expect(doc).toContain('#set page(width: auto, height: auto');
    expect(doc).toContain(`fill: rgb("${TYPST_INK}")`);
    expect(doc.endsWith('$ x^2 $')).toBe(true);
  });
});
