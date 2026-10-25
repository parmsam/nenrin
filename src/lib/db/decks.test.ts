import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addNote, ensureBuiltins } from '../notes';
import { NenrinDB } from '.';
import {
  createDeck,
  deckSubtreeIds,
  deckTree,
  deleteDeck,
  renameDeck,
  updateDeckConfig,
} from './decks';

let db: NenrinDB;

beforeEach(async () => {
  db = new NenrinDB(`test-${crypto.randomUUID()}`);
  await ensureBuiltins(db);
});

afterEach(async () => {
  await db.delete();
});

describe('decks', () => {
  it('builds a sorted tree with paths', async () => {
    const jp = await createDeck(db, 'Japanese');
    await createDeck(db, 'Vocab', jp.id);
    await createDeck(db, 'Kanji', jp.id);
    await createDeck(db, 'Biology');
    const tree = deckTree(await db.decks.toArray());
    expect(tree.map((d) => [d.depth, d.path])).toEqual([
      [0, 'Biology'],
      [0, 'Japanese'],
      [1, 'Japanese / Kanji'],
      [1, 'Japanese / Vocab'],
    ]);
  });

  it('gives sub-decks their parent’s settings', async () => {
    const parent = await createDeck(db, 'P');
    await updateDeckConfig(db, parent.id, { newPerDay: 5 });
    const child = await createDeck(db, 'C', parent.id);
    expect(child.config.newPerDay).toBe(5);
  });

  it('rejects blank names', async () => {
    await expect(createDeck(db, '   ')).rejects.toThrow('empty');
    const d = await createDeck(db, 'x');
    await expect(renameDeck(db, d.id, '')).rejects.toThrow('empty');
  });

  it('deletes a deck subtree with its cards and notes', async () => {
    const keep = await createDeck(db, 'Keep');
    const parent = await createDeck(db, 'P');
    const child = await createDeck(db, 'C', parent.id);
    await addNote(db, { noteTypeId: 'basic', deckId: child.id, fields: { Front: 'a', Back: 'b' } });
    await addNote(db, { noteTypeId: 'basic', deckId: keep.id, fields: { Front: 'c', Back: 'd' } });
    expect(await deckSubtreeIds(db, parent.id)).toHaveLength(2);

    await deleteDeck(db, parent.id);
    expect((await db.decks.toArray()).map((d) => d.name)).toEqual(['Keep']);
    expect(await db.cards.count()).toBe(1);
    expect(await db.notes.count()).toBe(1);
  });
});
