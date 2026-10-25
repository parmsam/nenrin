import { addNote, ensureBuiltins } from '../notes';
import { createDeck } from './decks';
import type { NenrinDB } from '.';

const SAMPLE: [front: string, back: string][] = [
  ['年輪 (nenrin)', 'tree rings'],
  ['木 (ki)', 'tree'],
  ['森 (mori)', 'forest'],
  ['山 (yama)', 'mountain'],
  ['木漏れ日 (komorebi)', 'sunlight filtering through leaves'],
];

/** Creates a small demo deck. Returns its id. */
export async function createSampleDeck(db: NenrinDB, now = Date.now()): Promise<string> {
  await ensureBuiltins(db);
  return db.transaction('rw', db.decks, db.noteTypes, db.notes, db.cards, async () => {
    const deck = await createDeck(db, 'Japanese: Nature', undefined, now);
    for (const [i, [Front, Back]] of SAMPLE.entries()) {
      await addNote(
        db,
        { noteTypeId: 'basic', deckId: deck.id, fields: { Front, Back }, tags: ['sample'] },
        now + i,
      );
    }
    return deck.id;
  });
}
