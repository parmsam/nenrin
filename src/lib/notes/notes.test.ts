import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NenrinDB } from '../db';
import { createDeck } from '../db/decks';
import { recordReview } from '../db/repo';
import { Rating } from '../scheduler';
import { addNote, deleteNote, ensureBuiltins, NoCardsError, parseTags, updateNote } from '.';

let db: NenrinDB;
let deckId: string;

beforeEach(async () => {
  db = new NenrinDB(`test-${crypto.randomUUID()}`);
  await ensureBuiltins(db);
  deckId = (await createDeck(db, 'D')).id;
});

afterEach(async () => {
  await db.delete();
});

const ordinals = async (noteId: string) =>
  (await db.cards.where('noteId').equals(noteId).toArray()).map((c) => c.ordinal).sort();

describe('notes', () => {
  it('creates one card for Basic and two for Basic (and reversed)', async () => {
    const basic = await addNote(db, {
      noteTypeId: 'basic',
      deckId,
      fields: { Front: 'a', Back: 'b' },
    });
    const rev = await addNote(db, {
      noteTypeId: 'basic-reversed',
      deckId,
      fields: { Front: 'a', Back: 'b' },
    });
    expect(await ordinals(basic.id)).toEqual([0]);
    expect(await ordinals(rev.id)).toEqual([0, 1]);
  });

  it('skips the reverse card when the back is empty', async () => {
    const n = await addNote(db, {
      noteTypeId: 'basic-reversed',
      deckId,
      fields: { Front: 'a', Back: '' },
    });
    expect(await ordinals(n.id)).toEqual([0]);
  });

  it('creates one card per cloze number', async () => {
    const n = await addNote(db, {
      noteTypeId: 'cloze',
      deckId,
      fields: { Text: '{{c1::a}} {{c3::b}} {{c1::c}}', 'Back Extra': '' },
    });
    expect(await ordinals(n.id)).toEqual([0, 2]);
  });

  it('refuses notes that would make no cards', async () => {
    await expect(
      addNote(db, { noteTypeId: 'cloze', deckId, fields: { Text: 'no clozes' } }),
    ).rejects.toBeInstanceOf(NoCardsError);
    await expect(
      addNote(db, { noteTypeId: 'basic', deckId, fields: { Front: '  ', Back: 'b' } }),
    ).rejects.toBeInstanceOf(NoCardsError);
    expect(await db.notes.count()).toBe(0);
  });

  it('adds and removes cloze cards on edit, keeping existing card history', async () => {
    const n = await addNote(db, {
      noteTypeId: 'cloze',
      deckId,
      fields: { Text: '{{c1::a}} {{c2::b}}', 'Back Extra': '' },
    });
    const c1 = (await db.cards.where('noteId').equals(n.id).toArray()).find(
      (c) => c.ordinal === 0,
    )!;
    await recordReview(db, c1.id, Rating.Good);

    const result = await updateNote(db, n.id, {
      fields: { Text: '{{c1::A}} {{c3::C}}', 'Back Extra': '' },
    });
    expect(result).toEqual({ added: 1, removed: 1 });
    expect(await ordinals(n.id)).toEqual([0, 2]);
    expect(await db.reviewLogs.where('cardId').equals(c1.id).count()).toBe(1);
    expect((await db.notes.get(n.id))!.fields.Text).toBe('{{c1::A}} {{c3::C}}');
  });

  it('deletes a note with its cards and history', async () => {
    const n = await addNote(db, { noteTypeId: 'basic', deckId, fields: { Front: 'a', Back: 'b' } });
    const [card] = await db.cards.where('noteId').equals(n.id).toArray();
    await recordReview(db, card.id, Rating.Good);
    await deleteNote(db, n.id);
    expect(await db.notes.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviewLogs.count()).toBe(0);
  });

  it('parses tags', () => {
    expect(parseTags(' verbs, n5  verbs ')).toEqual(['verbs', 'n5']);
  });
});
