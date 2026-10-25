import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating, State } from '../scheduler';
import { NenrinDB } from '.';
import { deckSummaries, recordReview } from './repo';
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
  it('creates a sample deck with due cards', async () => {
    const deckId = await createSampleDeck(db, T0);
    const [summary] = await deckSummaries(db, T0);
    expect(summary).toMatchObject({ id: deckId, name: 'Japanese: Nature', total: 5, due: 5 });
    expect(await db.noteTypes.get('basic')).toBeDefined();
  });

  it('records a review: updates the card and appends a log', async () => {
    const deckId = await createSampleDeck(db, T0);
    const card = await db.cards.where('deckId').equals(deckId).first();
    await recordReview(db, card!.id, Rating.Good, { now: T0, durationMs: 4200 });

    const updated = await db.cards.get(card!.id);
    expect(updated!.state).not.toBe(State.New);
    expect(updated!.due).toBeGreaterThan(T0);

    const logs = await db.reviewLogs.where('cardId').equals(card!.id).toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ rating: Rating.Good, state: State.New, durationMs: 4200 });

    const [summary] = await deckSummaries(db, T0);
    expect(summary.due).toBe(4);
  });

  it('rejects reviews of missing cards without writing a log', async () => {
    await expect(recordReview(db, 'nope', Rating.Good)).rejects.toThrow('not found');
    expect(await db.reviewLogs.count()).toBe(0);
  });
});
