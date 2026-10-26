import { newSchedulingState } from '../scheduler';
import { newId, type NenrinDB } from '../db';
import type { Card, Note, NoteType } from '../db/types';
import { fieldToHtml } from '../render';
import { isImageOcclusion } from '../render/occlusion';
import { clozeNumbers, isEmptyFront, renderTemplate } from '../render/template';
import { BUILTIN_NOTE_TYPES } from './builtins';

export {
  BASIC,
  BASIC_REVERSED,
  BASIC_OPTIONAL_REVERSED,
  BASIC_TYPE,
  CLOZE,
  IMAGE_OCCLUSION,
  BUILTIN_NOTE_TYPES,
} from './builtins';

/** Writes the built-in note types. Safe to call on every start. */
export async function ensureBuiltins(db: NenrinDB): Promise<void> {
  await db.noteTypes.bulkPut([...BUILTIN_NOTE_TYPES]);
}

/** Which cards a note should have: template indices (basic) or cloze numbers − 1 (cloze). */
export function cardOrdinals(
  noteType: NoteType,
  fields: Record<string, string>,
  format?: Note['format'],
): number[] {
  if (noteType.kind === 'cloze') {
    const text = Object.values(fields).join('\n');
    return clozeNumbers(text).map((n) => n - 1);
  }
  const html = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, fieldToHtml(v, format)]),
  );
  return noteType.templates.flatMap((tpl, i) =>
    isEmptyFront(renderTemplate(tpl.front, html, { side: 'front' })) ? [] : [i],
  );
}

export interface NoteInput {
  noteTypeId: string;
  deckId: string;
  fields: Record<string, string>;
  tags?: string[];
  /** Defaults to markdown. Imports use html. */
  format?: Note['format'];
  ankiGuid?: string;
}

export class NoCardsError extends Error {
  constructor(noteType: NoteType) {
    super(
      isImageOcclusion(noteType)
        ? 'Draw at least one mask on the image.'
        : noteType.kind === 'cloze'
          ? 'Add at least one cloze, like {{c1::answer}}.'
          : `The front of the card is empty.`,
    );
  }
}

function newCard(noteId: string, deckId: string, ordinal: number, now: number): Card {
  return {
    ...newSchedulingState(now),
    id: newId(),
    noteId,
    deckId,
    ordinal,
    suspended: false,
    buried: false,
  };
}

export async function addNote(db: NenrinDB, input: NoteInput, now = Date.now()): Promise<Note> {
  return db.transaction('rw', db.noteTypes, db.notes, db.cards, async () => {
    const noteType = await db.noteTypes.get(input.noteTypeId);
    if (!noteType) throw new Error(`Unknown note type ${input.noteTypeId}`);
    const format = input.format ?? 'markdown';
    const ordinals = cardOrdinals(noteType, input.fields, format);
    if (ordinals.length === 0) throw new NoCardsError(noteType);
    const note: Note = {
      id: newId(),
      noteTypeId: noteType.id,
      fields: { ...input.fields },
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      format,
      ...(input.ankiGuid ? { ankiGuid: input.ankiGuid } : {}),
    };
    await db.notes.add(note);
    // Stagger `due` by ordinal so new cards come up in creation order.
    await db.cards.bulkAdd(ordinals.map((o) => newCard(note.id, input.deckId, o, now + o)));
    return note;
  });
}

/**
 * Saves edited fields/tags. Creates cards for new templates or clozes and deletes cards
 * whose cloze or front no longer exists (with their review history).
 */
export async function updateNote(
  db: NenrinDB,
  noteId: string,
  changes: { fields: Record<string, string>; tags?: string[]; format?: Note['format'] },
  now = Date.now(),
): Promise<{ added: number; removed: number }> {
  return db.transaction('rw', db.noteTypes, db.notes, db.cards, db.reviewLogs, async () => {
    const note = await db.notes.get(noteId);
    if (!note) throw new Error(`Note ${noteId} not found`);
    const noteType = await db.noteTypes.get(note.noteTypeId);
    if (!noteType) throw new Error(`Unknown note type ${note.noteTypeId}`);
    const format = changes.format ?? note.format;
    const wanted = new Set(cardOrdinals(noteType, changes.fields, format));
    if (wanted.size === 0) throw new NoCardsError(noteType);

    const cards = await db.cards.where('noteId').equals(noteId).toArray();
    const have = new Set(cards.map((c) => c.ordinal));
    const stale = cards.filter((c) => !wanted.has(c.ordinal)).map((c) => c.id);
    const deckId = cards[0]?.deckId;
    const missing = [...wanted].filter((o) => !have.has(o));

    await db.notes.update(noteId, {
      fields: { ...changes.fields },
      tags: changes.tags ?? note.tags,
      format,
      updatedAt: now,
    });
    if (stale.length) {
      await db.cards.bulkDelete(stale);
      await db.reviewLogs.where('cardId').anyOf(stale).delete();
    }
    if (deckId && missing.length) {
      await db.cards.bulkAdd(missing.map((o) => newCard(noteId, deckId, o, now + o)));
    }
    return { added: deckId ? missing.length : 0, removed: stale.length };
  });
}

export async function deleteNote(db: NenrinDB, noteId: string): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, db.reviewLogs, async () => {
    const cardIds = await db.cards.where('noteId').equals(noteId).primaryKeys();
    await db.reviewLogs.where('cardId').anyOf(cardIds).delete();
    await db.cards.bulkDelete(cardIds);
    await db.notes.delete(noteId);
  });
}

/** Parses a space/comma separated tag string. */
export function parseTags(input: string): string[] {
  return [...new Set(input.split(/[\s,]+/).filter(Boolean))];
}
