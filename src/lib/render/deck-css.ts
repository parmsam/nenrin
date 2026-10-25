/**
 * Makes a note type's CSS (e.g. from an imported Anki deck) safe to apply to one card:
 *  - wrapped in `@scope (.deck-scope)` so it can't style the app around the card. Rules inside
 *    @scope only match descendants of the root, so `.card` / `.nightMode` live on an inner element
 *  - `@import` and remote `url()`s removed (no network requests from deck styles)
 *  - `<` escaped, so the CSS can't close its <style> element
 *  - `@font-face` rules lifted out of the scope (they aren't allowed inside it), with
 *    local font files resolved to blob URLs
 * Anki's stock note type CSS (black on white, Arial) is dropped so the app theme applies.
 */

/** Anki's default `.card` rule, in the variations shipped over the years. */
const STOCK_RULE =
  /^\.card\s*\{\s*(?:(?:font-family|font-size|text-align|color|background-color|line-height)\s*:[^;{}]*;?\s*)*\}$/i;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** True when the CSS is just Anki's stock styling (nothing a deck author customized). */
export function isStockCss(css: string): boolean {
  const rules = stripComments(css).trim();
  return rules === '' || STOCK_RULE.test(rules.replace(/\s+/g, ' '));
}

/** Splits CSS into top-level blocks (`selector { … }` or `@rule …;`), respecting nesting. */
function topLevelBlocks(css: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        blocks.push(css.slice(start, i + 1).trim());
        start = i + 1;
      }
    } else if (ch === ';' && depth === 0) {
      blocks.push(css.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  const rest = css.slice(start).trim();
  if (rest) blocks.push(rest);
  return blocks.filter(Boolean);
}

const URL_RE = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
const isRemote = (u: string) =>
  /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u) && !/^(?:data|blob):/i.test(u);

/** Local files a stylesheet refers to (e.g. `_NotoSansJP.woff2`), to resolve before applying. */
export function cssMediaRefs(css: string): string[] {
  const refs = new Set<string>();
  for (const m of stripComments(css).matchAll(URL_RE)) {
    const u = m[2].trim();
    if (u && !isRemote(u) && !/^(?:data|blob):/i.test(u)) refs.add(u);
  }
  return [...refs];
}

export interface ScopeOptions {
  /** Local media filename → URL (blob:) for fonts and images referenced by the CSS. */
  urls?: Map<string, string>;
}

/** Returns CSS safe to inline in a <style>, scoped to `.deck-scope`, or '' if nothing to apply. */
export function scopeDeckCss(css: string, { urls = new Map() }: ScopeOptions = {}): string {
  if (isStockCss(css)) return '';
  // image-set() takes bare strings as URLs, so it could load remote images without url().
  const noImageSet = stripComments(css).replace(/(?:-webkit-)?image-set\([^)]*\)/gi, 'none');
  const cleaned = noImageSet.replace(URL_RE, (_, _q, raw: string) => {
    const u = raw.trim();
    if (isRemote(u)) return 'none';
    const local = urls.get(u);
    return local ? `url("${local}")` : /^(?:data|blob):/i.test(u) ? `url("${u}")` : 'none';
  });
  const global: string[] = [];
  const scoped: string[] = [];
  for (const block of topLevelBlocks(cleaned)) {
    if (/^@import\b/i.test(block) || /^@charset\b/i.test(block) || /^@namespace\b/i.test(block)) {
      continue;
    }
    if (/^@font-face\b/i.test(block)) global.push(block);
    else scoped.push(block);
  }
  if (scoped.length === 0 && global.length === 0) return '';
  const out = [...global, scoped.length ? `@scope (.deck-scope) {\n${scoped.join('\n')}\n}` : ''];
  // Never let deck CSS end the <style> element it's placed in.
  return out.join('\n').replace(/</g, '\\3C ');
}
