/** Command palette state and fuzzy matching (the component is CommandPalette.svelte). */

export const paletteState = $state({ open: false });

export interface Command {
  id: string;
  label: string;
  /** Shown on the right: "Deck", "Go to", "Action"… */
  group: string;
  /** Extra words that should match (e.g. "dark" for the theme command). */
  keywords?: string;
  /** Key combo shown as a hint, e.g. ['?'] or ['⌘', 'K']. */
  keys?: string[];
  run: () => void | Promise<void>;
}

/**
 * Scores how well `query` matches `text` as a fuzzy subsequence; higher is better, -1 is no
 * match. Rewards consecutive letters and letters at the start of words, like most palettes.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().replace(/\s+/g, '');
  const t = text.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return -1;
    const wordStart = found === 0 || /[\s\-/:(“"]/.test(t[found - 1]);
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak * 2 + (wordStart ? 3 : 0) - Math.min(3, found - ti) * 0.25;
    ti = found + 1;
  }
  // Prefer shorter labels when scores tie.
  return score - t.length * 0.01;
}

export function rankCommands(commands: Command[], query: string, recent: string[] = []): Command[] {
  if (!query.trim()) {
    const rank = (c: Command) => {
      const i = recent.indexOf(c.id);
      // Not Infinity: Infinity − Infinity is NaN, which breaks sort().
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...commands].sort((a, b) => rank(a) - rank(b));
  }
  return commands
    .map((c) => ({
      c,
      s: Math.max(
        fuzzyScore(query, c.label),
        fuzzyScore(query, `${c.label} ${c.keywords ?? ''}`) - 1,
      ),
    }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

const RECENT_KEY = 'nenrin:palette-recent';

export function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function rememberRecent(id: string): void {
  try {
    const next = [id, ...loadRecent().filter((x) => x !== id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: recents just aren't remembered.
  }
}
