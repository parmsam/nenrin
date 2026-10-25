import Dexie, { type EntityTable } from 'dexie';
import type { Card, Deck, Media, Note, NoteType, ReviewLog } from './types';

export * from './types';

export class NenrinDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>;
  noteTypes!: EntityTable<NoteType, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  reviewLogs!: EntityTable<ReviewLog, 'id'>;
  media!: EntityTable<Media, 'filename'>;

  constructor(name = 'nenrin') {
    super(name);
    // Never edit a shipped version. Add db.version(n + 1) with an upgrade() and a test.
    this.version(1).stores({
      decks: 'id, name, parentId',
      noteTypes: 'id, name',
      notes: 'id, noteTypeId, *tags, ankiGuid, updatedAt',
      cards: 'id, noteId, deckId, due, [deckId+due]',
      reviewLogs: 'id, cardId, ts',
      media: 'filename, sha1',
    });
  }
}

export const db = new NenrinDB();

export const newId = (): string => crypto.randomUUID();
