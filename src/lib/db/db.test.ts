import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating, State } from '../scheduler';
import { NenrinDB } from '.';
import { recordReview, undoReview } from './repo';
import { createSampleDeck } from './sample';

const T0 = Date.UTC(2026, 0, 1, 12);
let db: NenrinDB;

beforeEach(() => {
  db = new NenrinDB(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

describe('db', () => {
  it('creates a sample deck with five new cards', async () => {
    const deckId = await createSampleDeck(db, T0);
    expect(await db.decks.get(deckId)).toMatchObject({ name: 'Japanese: Nature' });
    expect(await db.cards.where('[deckId+state]').equals([deckId, State.New]).count()).toBe(5);
    expect(await db.noteTypes.count()).toBe(6);
  });

  it('records a review and can undo it exactly', async () => {
    const deckId = await createSampleDeck(db, T0);
    const card = (await db.cards.where('deckId').equals(deckId).first())!;
    const undo = await recordReview(db, card.id, Rating.Good, { now: T0, durationMs: 4200 });

    const updated = (await db.cards.get(card.id))!;
    expect(updated.state).not.toBe(State.New);
    expect(updated.due).toBeGreaterThan(T0);
    const logs = await db.reviewLogs.where('cardId').equals(card.id).toArray();
    expect(logs).toEqual([
      expect.objectContaining({
        rating: Rating.Good,
        state: State.New,
        durationMs: 4200,
        deviceId: expect.any(String),
      }),
    ]);

    await undoReview(db, undo);
    expect(await db.cards.get(card.id)).toEqual(card);
    expect(await db.reviewLogs.count()).toBe(0);
  });

  it('rejects reviews of missing cards without writing a log', async () => {
    await expect(recordReview(db, 'nope', Rating.Good)).rejects.toThrow('not found');
    expect(await db.reviewLogs.count()).toBe(0);
  });

  it('upgrades a v1 database without losing data', async () => {
    const name = `test-v1-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      decks: 'id, name, parentId',
      noteTypes: 'id, name',
      notes: 'id, noteTypeId, *tags, ankiGuid, updatedAt',
      cards: 'id, noteId, deckId, due, [deckId+due]',
      reviewLogs: 'id, cardId, ts',
      media: 'filename, sha1',
    });
    await v1.table('cards').add({ id: 'c1', noteId: 'n1', deckId: 'd1', due: 5, state: 0 });
    v1.close();

    const upgraded = new NenrinDB(name);
    expect(await upgraded.cards.where('[deckId+state]').equals(['d1', 0]).count()).toBe(1);
    expect(await upgraded.settings.count()).toBe(0);
    await upgraded.delete();
  });
});
