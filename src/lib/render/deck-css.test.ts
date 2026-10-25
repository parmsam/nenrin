import { describe, expect, it } from 'vitest';
import { cssMediaRefs, isStockCss, scopeDeckCss } from './deck-css';

const STOCK_OLD = `.card {
 font-family: arial;
 font-size: 20px;
 text-align: center;
 color: black;
 background-color: white;
}`;
const STOCK_NEW = `.card {
    font-family: arial;
    font-size: 20px;
    line-height: 1.5;
    text-align: center;
    color: black;
    background-color: white;
}
`;

describe('deck CSS', () => {
  it('recognizes Anki’s stock CSS, so the app theme applies instead', () => {
    expect(isStockCss(STOCK_OLD)).toBe(true);
    expect(isStockCss(STOCK_NEW)).toBe(true);
    expect(isStockCss('')).toBe(true);
    expect(scopeDeckCss(STOCK_NEW)).toBe('');
    expect(isStockCss(`${STOCK_NEW}\n.reading { color: gray; }`)).toBe(false);
  });

  it('scopes custom rules to the card', () => {
    const out = scopeDeckCss('.card { color: red } .reading { font-size: 12px; }');
    expect(out).toBe(
      '@scope (.deck-scope) {\n.card { color: red }\n.reading { font-size: 12px; }\n}',
    );
  });

  it('keeps nested at-rules inside the scope', () => {
    const out = scopeDeckCss(
      '.nightMode .card { color: white } @media (max-width: 600px) { .card { font-size: 14px } }',
    );
    expect(out).toContain('@scope (.deck-scope) {');
    expect(out).toContain('@media (max-width: 600px) { .card { font-size: 14px } }');
  });

  it('removes imports and remote URLs', () => {
    const out = scopeDeckCss(
      '@import url("https://fonts.example/x.css"); .card { background: url(https://tracker.example/p.gif) }',
    );
    expect(out).not.toMatch(/import|tracker|https/);
    expect(out).toContain('background: none');
  });

  it('removes image-set, which can load URLs without url()', () => {
    const out = scopeDeckCss('.card { background-image: image-set("https://t.example/p.png" 1x) }');
    expect(out).not.toContain('example');
  });

  it('lifts @font-face out of the scope and resolves local font files', () => {
    const css = `@font-face { font-family: Jp; src: url("_NotoSansJP.woff2"); }\n.card { font-family: Jp }`;
    expect(cssMediaRefs(css)).toEqual(['_NotoSansJP.woff2']);
    const out = scopeDeckCss(css, { urls: new Map([['_NotoSansJP.woff2', 'blob:abc']]) });
    expect(out.startsWith('@font-face { font-family: Jp; src: url("blob:abc"); }')).toBe(true);
    expect(out).toContain('@scope (.deck-scope) {\n.card { font-family: Jp }\n}');
  });

  it('cannot close its <style> element', () => {
    const out = scopeDeckCss('.card::after { content: "</style><script>alert(1)</script>" }');
    expect(out).not.toContain('<');
  });

  it('handles braces inside strings', () => {
    const out = scopeDeckCss('.a::before { content: "}" } .b { color: blue }');
    expect(out).toContain('.a::before { content: "}" }\n.b { color: blue }');
  });
});
