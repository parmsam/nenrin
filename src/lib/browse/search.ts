/**
 * Note search with a subset of Anki's syntax:
 *   word "exact phrase"   in any field (case- and accent-insensitive, HTML ignored)
 *   -word                 exclude
 *   deck:Name             deck and its sub-decks; nested as deck:"Parent::Child"; * wildcard
 *   tag:name              tag (or tag:parent::child); * wildcard
 *   note:Basic            note type name
 *   is:new is:learn is:review is:due is:suspended
 *   added:7               created in the last 7 days
 * Terms are ANDed. Card-level filters (deck, is:) match if any of the note's cards does.
 */
import type { Card, Note, NoteType } from '../db/types';
import { stripHtml } from '../render/template';
import { State } from '../scheduler';

export type Term =
  | { kind: 'text'; value: string; negate: boolean }
  | { kind: 'deck' | 'tag' | 'note'; value: string; negate: boolean }
  | { kind: 'is'; value: string; negate: boolean }
  | { kind: 'added'; days: number; negate: boolean };

/** Lowercase, strip accents, collapse whitespace: so "Café" finds "cafe". */
export function normalize(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function parseQuery(query: string): Term[] {
  const terms: Term[] = [];
  // -?(key:)?("quoted"|bare)
  for (const m of query.matchAll(/(-?)(?:(\w+):)?(?:"([^"]*)"|(\S+))/g)) {
    const negate = m[1] === '-';
    const key = m[2]?.toLowerCase();
    const value = m[3] ?? m[4] ?? '';
    if (!value) continue;
    if (key === 'deck' || key === 'tag' || key === 'note') terms.push({ kind: key, value, negate });
    else if (key === 'is') terms.push({ kind: 'is', value: value.toLowerCase(), negate });
    else if (key === 'added' && /^\d+$/.test(value)) {
      terms.push({ kind: 'added', days: Number(value), negate });
    } else terms.push({ kind: 'text', value: normalize(key ? `${key}:${value}` : value), negate });
  }
  return terms;
}

function wildcard(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Everything a search needs about one note, precomputed once per data load. */
export interface SearchRow {
  note: Note;
  type?: NoteType;
  cards: Card[];
  /** Deck paths of the note's cards, "Parent::Child". */
  decks: string[];
  /** Normalized text of all fields, for free-text matching. */
  text: string;
  /** First field as plain text, for display and sorting. */
  sortField: string;
}

export function buildRows(
  notes: Note[],
  cards: Card[],
  noteTypes: NoteType[],
  deckPaths: Map<string, string>,
): SearchRow[] {
  const typeById = new Map(noteTypes.map((t) => [t.id, t]));
  const cardsByNote = new Map<string, Card[]>();
  for (const c of cards) {
    const list = cardsByNote.get(c.noteId);
    if (list) list.push(c);
    else cardsByNote.set(c.noteId, [c]);
  }
  return notes.map((note) => {
    const type = typeById.get(note.noteTypeId);
    const noteCards = cardsByNote.get(note.id) ?? [];
    // Plain text for display, sorting and search: no HTML, and clozes show their answers.
    const plain = (v: string) =>
      stripHtml(v.replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, '$1'))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    const first = type?.fields[0] ?? Object.keys(note.fields)[0];
    return {
      note,
      type,
      cards: noteCards,
      decks: [...new Set(noteCards.map((c) => deckPaths.get(c.deckId) ?? ''))],
      text: normalize(Object.values(note.fields).map(plain).join(' ')),
      sortField: plain(note.fields[first] ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    };
  });
}

/** True if `path` ("A::B::C") or any ancestor of it ("A", "A::B") matches the pattern. */
function matchesPath(path: string, pattern: string): boolean {
  const re = wildcard(pattern);
  const parts = path.split('::');
  return parts.some((_, i) => re.test(parts.slice(0, i + 1).join('::')));
}

function cardIs(card: Card, what: string, now: number): boolean {
  switch (what) {
    case 'new':
      return card.state === State.New;
    case 'learn':
      return card.state === State.Learning || card.state === State.Relearning;
    case 'review':
      return card.state === State.Review;
    case 'due':
      return card.state !== State.New && card.due <= now && !card.suspended;
    case 'suspended':
      return card.suspended;
    default:
      return false;
  }
}

function matchesTerm(row: SearchRow, term: Term, now: number): boolean {
  switch (term.kind) {
    case 'text':
      return row.text.includes(term.value);
    case 'deck':
      return row.decks.some((d) => matchesPath(d, term.value));
    case 'tag':
      return row.note.tags.some((t) => matchesPath(t, term.value));
    case 'note':
      return !!row.type && wildcard(term.value).test(row.type.name);
    case 'is':
      return row.cards.some((c) => cardIs(c, term.value, now));
    case 'added':
      return row.note.createdAt >= now - term.days * 86_400_000;
  }
}

export function search(rows: SearchRow[], query: string, now = Date.now()): SearchRow[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return rows;
  return rows.filter((row) => terms.every((t) => matchesTerm(row, t, now) !== t.negate));
}

export type SortKey = 'newest' | 'oldest' | 'alpha' | 'due';

export function sortRows(rows: SearchRow[], key: SortKey): SearchRow[] {
  const due = (r: SearchRow) => Math.min(...r.cards.map((c) => c.due), Infinity);
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const byKey: Record<SortKey, (a: SearchRow, b: SearchRow) => number> = {
    newest: (a, b) => b.note.createdAt - a.note.createdAt,
    oldest: (a, b) => a.note.createdAt - b.note.createdAt,
    alpha: (a, b) => collator.compare(a.sortField, b.sortField),
    due: (a, b) => due(a) - due(b),
  };
  return [...rows].sort(byKey[key]);
}
