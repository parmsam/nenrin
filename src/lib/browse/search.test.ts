import { describe, expect, it } from 'vitest';
import type { Card, Note, NoteType } from '../db/types';
import { newSchedulingState, State } from '../scheduler';
import { buildRows, normalize, parseQuery, search, sortRows } from './search';

const NOW = Date.UTC(2026, 5, 1);
const DAY = 86_400_000;
const basic: NoteType = {
  id: 'basic',
  name: 'Basic',
  kind: 'basic',
  fields: ['Front', 'Back'],
  templates: [],
  css: '',
};
const cloze: NoteType = {
  id: 'cloze',
  name: 'Cloze',
  kind: 'cloze',
  fields: ['Text', 'Back Extra'],
  templates: [],
  css: '',
};

let n = 0;
function note(fields: Record<string, string>, opts: Partial<Note> = {}): Note {
  n++;
  return {
    id: `n${n}`,
    noteTypeId: 'basic',
    fields,
    tags: [],
    createdAt: NOW - n * DAY,
    updatedAt: 0,
    ...opts,
  };
}
function card(noteId: string, deckId: string, opts: Partial<Card> = {}): Card {
  return {
    ...newSchedulingState(NOW),
    id: `c-${noteId}-${deckId}`,
    noteId,
    deckId,
    ordinal: 0,
    suspended: false,
    buried: false,
    ...opts,
  };
}

const notes = [
  note(
    { Front: '<b>Café</b> au lait', Back: 'coffee with milk' },
    { tags: ['french', 'food::drink'] },
  ),
  note({ Front: '犬', Back: 'dog' }, { tags: ['japanese', 'n5'] }),
  note({ Front: '猫', Back: 'cat' }, { tags: ['japanese', 'n5'] }),
  note(
    { Text: '{{c1::Paris}} is the capital of France', 'Back Extra': '' },
    { noteTypeId: 'cloze', tags: ['geo'] },
  ),
];
const cards = [
  card('n1', 'fr'),
  card('n2', 'jpv', { state: State.Review, due: NOW - DAY }),
  card('n3', 'jpv', { suspended: true }),
  card('n4', 'geo', { state: State.Learning, due: NOW + DAY }),
];
const paths = new Map([
  ['fr', 'French'],
  ['jpv', 'Japanese::Vocab'],
  ['geo', 'Geography'],
]);
const rows = buildRows(notes, cards, [basic, cloze], paths);
const ids = (q: string) => search(rows, q, NOW).map((r) => r.note.id);

describe('search', () => {
  it('normalizes accents and case', () => {
    expect(normalize('  CAFÉ\n au  Lait ')).toBe('cafe au lait');
  });

  it('parses terms, phrases and negation', () => {
    expect(parseQuery('dog -"cat food" deck:"A::B" is:due added:3')).toEqual([
      { kind: 'text', value: 'dog', negate: false },
      { kind: 'text', value: 'cat food', negate: true },
      { kind: 'deck', value: 'A::B', negate: false },
      { kind: 'is', value: 'due', negate: false },
      { kind: 'added', days: 3, negate: false },
    ]);
  });

  it('finds text in any field, ignoring HTML and accents', () => {
    expect(ids('cafe')).toEqual(['n1']);
    expect(ids('"coffee with"')).toEqual(['n1']);
    expect(ids('犬')).toEqual(['n2']);
    expect(ids('paris capital')).toEqual(['n4']);
    expect(ids('-dog -cat')).toEqual(['n1', 'n4']);
    expect(ids('')).toHaveLength(4);
  });

  it('filters by deck (with sub-decks), tag, note type and wildcards', () => {
    expect(ids('deck:Japanese')).toEqual(['n2', 'n3']);
    expect(ids('deck:"japanese::vocab"')).toEqual(['n2', 'n3']);
    expect(ids('deck:Geo*')).toEqual(['n4']);
    expect(ids('tag:n5 -tag:food')).toEqual(['n2', 'n3']);
    expect(ids('tag:food')).toEqual(['n1']);
    expect(ids('tag:jap*')).toEqual(['n2', 'n3']);
    expect(ids('note:cloze')).toEqual(['n4']);
  });

  it('filters by card state and age', () => {
    expect(ids('is:new')).toEqual(['n1', 'n3']);
    expect(ids('is:review')).toEqual(['n2']);
    expect(ids('is:learn')).toEqual(['n4']);
    expect(ids('is:due')).toEqual(['n2']);
    expect(ids('is:suspended')).toEqual(['n3']);
    expect(ids('added:2')).toEqual(['n1', 'n2']);
  });

  it('sorts', () => {
    expect(sortRows(rows, 'alpha').map((r) => r.sortField)).toEqual(
      ['Café au lait', 'Paris is the capital of France', '犬', '猫'].sort(
        new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }).compare,
      ),
    );
    expect(sortRows(rows, 'newest')[0].note.id).toBe('n1');
    expect(sortRows(rows, 'oldest')[0].note.id).toBe('n4');
    expect(sortRows(rows, 'due')[0].note.id).toBe('n2');
  });
});
