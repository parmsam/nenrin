import { newSchedulingState } from '../scheduler';
import { newId, type NenrinDB } from '.';
import { DEFAULT_DECK_CONFIG, type NoteType } from './types';

export const BASIC_NOTE_TYPE: NoteType = {
  id: 'basic',
  name: 'Basic',
  kind: 'basic',
  fields: ['Front', 'Back'],
  templates: [{ name: 'Card 1', front: '{{Front}}', back: '{{FrontSide}}<hr>{{Back}}' }],
  css: '',
};

const SAMPLE: [front: string, back: string][] = [
  ['年輪 (nenrin)', 'tree rings'],
  ['木 (ki)', 'tree'],
  ['森 (mori)', 'forest'],
  ['山 (yama)', 'mountain'],
  ['木漏れ日 (komorebi)', 'sunlight filtering through leaves'],
];

/** Creates a small demo deck. Returns its id. */
export async function createSampleDeck(db: NenrinDB, now = Date.now()): Promise<string> {
  const deckId = newId();
  await db.transaction('rw', db.decks, db.noteTypes, db.notes, db.cards, async () => {
    await db.noteTypes.put(BASIC_NOTE_TYPE);
    await db.decks.add({
      id: deckId,
      name: 'Japanese: Nature',
      config: { ...DEFAULT_DECK_CONFIG },
      createdAt: now,
    });
    for (const [front, back] of SAMPLE) {
      const noteId = newId();
      await db.notes.add({
        id: noteId,
        noteTypeId: BASIC_NOTE_TYPE.id,
        fields: { Front: front, Back: back },
        tags: ['sample'],
        createdAt: now,
        updatedAt: now,
      });
      await db.cards.add({
        ...newSchedulingState(now),
        id: newId(),
        noteId,
        deckId,
        ordinal: 0,
        suspended: false,
        buried: false,
      });
    }
  });
  return deckId;
}
