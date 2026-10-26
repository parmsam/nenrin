// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fieldToHtml } from '.';
import { renderMathIn } from './math';

describe('KaTeX rendering', () => {
  it('typesets each formula once, even when two renders overlap', async () => {
    const root = document.body.appendChild(document.createElement('div'));
    root.innerHTML = fieldToHtml('<div>[$]\\sqrt{108a^6}[/$]</div>', 'html');
    // The card preview re-renders as you type, so calls can overlap while KaTeX loads.
    await Promise.all([renderMathIn(root), renderMathIn(root)]);
    expect(root.querySelectorAll('.katex')).toHaveLength(1);
    expect(root.querySelector('annotation')?.textContent).toBe('\\sqrt{108a^6}');
  });
});
