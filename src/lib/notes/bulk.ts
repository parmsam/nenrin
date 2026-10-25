/** Bulk actions for the browser. Each runs in one transaction. */
import type { NenrinDB } from '../db';

export async function setSuspended(db: NenrinDB, noteIds: string[], suspended: boolean) {
  await db.cards.where('noteId').anyOf(noteIds).modify({ suspended });
}

export async function moveNotes(db: NenrinDB, noteIds: string[], deckId: string) {
  await db.cards.where('noteId').anyOf(noteIds).modify({ deckId });
}

export async function addTags(db: NenrinDB, noteIds: string[], tags: string[], now = Date.now()) {
  await db.notes
    .where('id')
    .anyOf(noteIds)
    .modify((n) => {
      n.tags = [...new Set([...n.tags, ...tags])];
      n.updatedAt = now;
    });
}

export async function removeTags(
  db: NenrinDB,
  noteIds: string[],
  tags: string[],
  now = Date.now(),
) {
  const drop = new Set(tags.map((t) => t.toLowerCase()));
  await db.notes
    .where('id')
    .anyOf(noteIds)
    .modify((n) => {
      n.tags = n.tags.filter((t) => !drop.has(t.toLowerCase()));
      n.updatedAt = now;
    });
}

/** Deletes notes with their cards and review history. */
export async function deleteNotes(db: NenrinDB, noteIds: string[]) {
  await db.transaction('rw', db.notes, db.cards, db.reviewLogs, async () => {
    const cardIds = await db.cards.where('noteId').anyOf(noteIds).primaryKeys();
    await db.reviewLogs.where('cardId').anyOf(cardIds).delete();
    await db.cards.bulkDelete(cardIds);
    await db.notes.bulkDelete(noteIds);
  });
}
