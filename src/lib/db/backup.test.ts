import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from '../scheduler';
import { NenrinDB } from '.';
import { createBackup, InvalidBackupError, parseBackup, restoreBackup } from './backup';
import { addImage } from './media';
import { setPrefs } from './prefs';
import { recordReview } from './repo';
import { createSampleDeck } from './sample';

let db: NenrinDB;

beforeEach(() => {
  db = new NenrinDB(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

describe('backup', () => {
  it('round-trips everything, including review history and media', async () => {
    const deckId = await createSampleDeck(db);
    const card = (await db.cards.where('deckId').equals(deckId).first())!;
    await recordReview(db, card.id, Rating.Good);
    await setPrefs(db, { rolloverHour: 2 });
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' });
    const filename = await addImage(db, png);

    const json = JSON.stringify(await createBackup(db));
    const other = new NenrinDB(`test-${crypto.randomUUID()}`);
    await other.decks.add({ id: 'junk', name: 'Junk', config: {} as never, createdAt: 0 });
    await restoreBackup(other, parseBackup(json));

    expect(await other.decks.toArray()).toEqual(await db.decks.toArray());
    expect(await other.cards.toArray()).toEqual(await db.cards.toArray());
    expect(await other.reviewLogs.count()).toBe(1);
    expect((await other.settings.get('prefs'))!.value).toEqual({ rolloverHour: 2 });
    const media = (await other.media.get(filename))!;
    expect(new Uint8Array(await media.blob.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
    );
    await other.delete();
  });

  it('dedupes identical images', async () => {
    const blob = new Blob(['same'], { type: 'image/png' });
    expect(await addImage(db, blob)).toBe(
      await addImage(db, new Blob(['same'], { type: 'image/png' })),
    );
    expect(await db.media.count()).toBe(1);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(InvalidBackupError);
    expect(() => parseBackup('{"app":"other"}')).toThrow(InvalidBackupError);
  });
});
