import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NenrinDB } from '../db';
import { createDeck } from '../db/decks';
import { recordReview } from '../db/repo';
import { Rating } from '../scheduler';
import { addNote, ensureBuiltins } from '.';
import { addTags, deleteNotes, moveNotes, removeTags, setSuspended } from './bulk';

let db: NenrinDB;
let a: string;
let b: string;
let ids: string[];

beforeEach(async () => {
  db = new NenrinDB(`test-${crypto.randomUUID()}`);
  await ensureBuiltins(db);
  a = (await createDeck(db, 'A')).id;
  b = (await createDeck(db, 'B')).id;
  ids = [];
  for (const f of ['x', 'y', 'z']) {
    ids.push(
      (
        await addNote(db, {
          noteTypeId: 'basic-reversed',
          deckId: a,
          fields: { Front: f, Back: f },
          tags: ['t'],
        })
      ).id,
    );
  }
});

afterEach(async () => {
  await db.delete();
});

describe('bulk actions', () => {
  it('suspends and unsuspends every card of the notes', async () => {
    await setSuspended(db, ids.slice(0, 2), true);
    expect(await db.cards.filter((c) => c.suspended).count()).toBe(4);
    await setSuspended(db, ids, false);
    expect(await db.cards.filter((c) => c.suspended).count()).toBe(0);
  });

  it('moves notes to another deck', async () => {
    await moveNotes(db, [ids[0]], b);
    expect(await db.cards.where('deckId').equals(b).count()).toBe(2);
  });

  it('adds and removes tags', async () => {
    await addTags(db, ids, ['new', 't']);
    expect((await db.notes.get(ids[0]))!.tags).toEqual(['t', 'new']);
    await removeTags(db, ids, ['T']);
    expect((await db.notes.get(ids[0]))!.tags).toEqual(['new']);
  });

  it('deletes notes with their cards and history', async () => {
    const card = (await db.cards.where('noteId').equals(ids[0]).first())!;
    await recordReview(db, card.id, Rating.Good);
    await deleteNotes(db, [ids[0]]);
    expect(await db.notes.count()).toBe(2);
    expect(await db.cards.count()).toBe(4);
    expect(await db.reviewLogs.count()).toBe(0);
  });
});
