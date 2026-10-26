/**
 * Editing note types: fields, card templates and CSS, as Anki's "Manage Note Types" does.
 *
 * The editor works on a draft and applies it in one transaction. Fields remember the name
 * they had (`from`), so renames carry note contents along; templates remember their old
 * position, so reordering or removing one moves existing cards (and their history) to the
 * right template instead of reassigning them.
 *
 * Built-in types are rewritten on every start (ensureBuiltins), so they're read-only here:
 * clone one to change it.
 */
import { newId, type NenrinDB } from '../db';
import type { Card, Note, NoteType } from '../db/types';
import { newSchedulingState } from '../scheduler';
import { BUILTIN_NOTE_TYPES } from './builtins';
import { cardOrdinals } from '.';

export interface FieldDraft {
  /** The field's name before this edit; missing for a new field. */
  from?: string;
  name: string;
}

export interface TemplateDraft {
  /** The template's index before this edit; missing for a new template. */
  from?: number;
  name: string;
  front: string;
  back: string;
}

export interface NoteTypeDraft {
  name: string;
  fields: FieldDraft[];
  templates: TemplateDraft[];
  css: string;
}

export function isBuiltin(id: string): boolean {
  return BUILTIN_NOTE_TYPES.some((t) => t.id === id);
}

export function draftFrom(type: NoteType): NoteTypeDraft {
  return {
    name: type.name,
    fields: type.fields.map((name) => ({ from: name, name })),
    templates: type.templates.map((t, i) => ({ from: i, ...t })),
    css: type.css,
  };
}

/** Names templates use for their own purposes; a field can't take them. */
const RESERVED = ['FrontSide', 'Tags', 'Type', 'Deck', 'Subdeck', 'Card', 'CardFlag'];

/** What's wrong with a draft, or null if it can be saved. */
export function draftProblem(type: NoteType, draft: NoteTypeDraft): string | null {
  if (!draft.name.trim()) return 'Give the note type a name.';
  if (!draft.fields.length) return 'A note type needs at least one field.';
  const names = draft.fields.map((f) => f.name.trim());
  for (const name of names) {
    if (!name) return 'Every field needs a name.';
    if (/[:{}"#^/]/.test(name)) return `“${name}”: field names can’t contain : { } " # ^ or /.`;
    if (RESERVED.includes(name)) return `“${name}” is a special name in templates; pick another.`;
  }
  const dupe = names.find((n, i) => names.indexOf(n) !== i);
  if (dupe) return `Two fields are called “${dupe}”.`;
  if (!draft.templates.length) return 'A note type needs at least one card type.';
  if (type.kind === 'cloze' && draft.templates.length !== 1) {
    return 'Cloze note types have exactly one card type.';
  }
  if (draft.templates.some((t) => !t.name.trim())) return 'Every card type needs a name.';
  return null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Points a template's references to a field at its new name: {{Old}}, {{#Old}}, {{/Old}},
 * {{^Old}} and filtered forms like {{text:Old}} or {{cloze:Old}}.
 */
export function renameFieldRefs(template: string, from: string, to: string): string {
  const re = new RegExp(`\\{\\{([#^/]?)((?:[^{}:]*:)*)\\s*${escapeRe(from)}\\s*\\}\\}`, 'g');
  return template.replace(re, (_, sigil: string, filters: string) => `{{${sigil}${filters}${to}}}`);
}

/** The note type a draft describes. */
export function applyDraft(type: NoteType, draft: NoteTypeDraft): NoteType {
  return {
    ...type,
    name: draft.name.trim(),
    fields: draft.fields.map((f) => f.name.trim()),
    templates: draft.templates.map(({ name, front, back }) => ({ name: name.trim(), front, back })),
    css: draft.css,
  };
}

export interface TypeChange {
  notes: number;
  addedCards: number;
  removedCards: number;
  /** Reviews that go with the removed cards. */
  removedReviews: number;
  /** Removed fields that hold text in some note, with how many notes. */
  lostFields: { name: string; notes: number }[];
}

interface Plan extends TypeChange {
  type: NoteType;
  noteUpdates: { id: string; fields: Record<string, string> }[];
  cardUpdates: { id: string; ordinal: number }[];
  removeCardIds: string[];
  addCards: Card[];
}

async function plan(
  db: NenrinDB,
  typeId: string,
  draft: NoteTypeDraft,
  now: number,
): Promise<Plan> {
  const old = await db.noteTypes.get(typeId);
  if (!old) throw new Error('This note type no longer exists.');
  const problem = draftProblem(old, draft);
  if (problem) throw new Error(problem);
  const type = applyDraft(old, draft);

  // Old template index → new one (basic types; a cloze card's ordinal is its cloze number).
  const ordinalMap = new Map<number, number>();
  draft.templates.forEach((t, i) => t.from !== undefined && ordinalMap.set(t.from, i));
  const remap = (ordinal: number) => (old.kind === 'cloze' ? ordinal : ordinalMap.get(ordinal));

  const kept = new Set(draft.fields.flatMap((f) => (f.from ? [f.from] : [])));
  const removedFields = old.fields.filter((f) => !kept.has(f));
  const lost = new Map(removedFields.map((f) => [f, 0]));

  const notes = await db.notes.where('noteTypeId').equals(typeId).toArray();
  const cards = await db.cards
    .where('noteId')
    .anyOf(notes.map((n) => n.id))
    .toArray();
  const byNote = new Map<string, Card[]>();
  for (const c of cards) byNote.set(c.noteId, [...(byNote.get(c.noteId) ?? []), c]);

  const result: Plan = {
    type,
    notes: notes.length,
    addedCards: 0,
    removedCards: 0,
    removedReviews: 0,
    lostFields: [],
    noteUpdates: [],
    cardUpdates: [],
    removeCardIds: [],
    addCards: [],
  };
  for (const note of notes) {
    for (const f of removedFields) if (note.fields[f]?.trim()) lost.set(f, lost.get(f)! + 1);
    const fields = Object.fromEntries(
      draft.fields.map((f) => [f.name.trim(), f.from ? (note.fields[f.from] ?? '') : '']),
    );
    result.noteUpdates.push({ id: note.id, fields });
    const wanted = new Set(cardOrdinals(type, fields, note.format));
    const have = new Set<number>();
    const noteCards = byNote.get(note.id) ?? [];
    for (const card of noteCards) {
      const ordinal = remap(card.ordinal);
      if (ordinal === undefined || !wanted.has(ordinal) || have.has(ordinal)) {
        result.removeCardIds.push(card.id);
        continue;
      }
      have.add(ordinal);
      if (ordinal !== card.ordinal) result.cardUpdates.push({ id: card.id, ordinal });
    }
    const deckId = noteCards[0]?.deckId;
    if (!deckId) continue;
    for (const ordinal of wanted) {
      if (have.has(ordinal)) continue;
      result.addCards.push({
        ...newSchedulingState(now),
        id: newId(),
        noteId: note.id,
        deckId,
        ordinal,
        suspended: false,
        buried: false,
      });
    }
  }
  result.addedCards = result.addCards.length;
  result.removedCards = result.removeCardIds.length;
  result.removedReviews = await db.reviewLogs.where('cardId').anyOf(result.removeCardIds).count();
  result.lostFields = [...lost].filter(([, n]) => n > 0).map(([name, n]) => ({ name, notes: n }));
  return result;
}

/** What saving a draft would do, without doing it (for the confirmation). */
export async function previewNoteTypeChange(
  db: NenrinDB,
  typeId: string,
  draft: NoteTypeDraft,
): Promise<TypeChange> {
  const { notes, addedCards, removedCards, removedReviews, lostFields } = await plan(
    db,
    typeId,
    draft,
    Date.now(),
  );
  return { notes, addedCards, removedCards, removedReviews, lostFields };
}

/** Saves a draft: the note type, every note's fields, and the cards they should have. */
export async function saveNoteType(
  db: NenrinDB,
  typeId: string,
  draft: NoteTypeDraft,
  now = Date.now(),
): Promise<TypeChange> {
  if (isBuiltin(typeId)) throw new Error('Built-in note types can’t be changed. Clone it first.');
  return db.transaction('rw', db.noteTypes, db.notes, db.cards, db.reviewLogs, async () => {
    const p = await plan(db, typeId, draft, now);
    await db.noteTypes.put(p.type);
    for (const u of p.noteUpdates) await db.notes.update(u.id, { fields: u.fields });
    if (p.removeCardIds.length) {
      await db.reviewLogs.where('cardId').anyOf(p.removeCardIds).delete();
      await db.cards.bulkDelete(p.removeCardIds);
    }
    for (const u of p.cardUpdates) await db.cards.update(u.id, { ordinal: u.ordinal });
    if (p.addCards.length) await db.cards.bulkAdd(p.addCards);
    const { notes, addedCards, removedCards, removedReviews, lostFields } = p;
    return { notes, addedCards, removedCards, removedReviews, lostFields };
  });
}

/** A copy with a new id, ready to edit. Image occlusion copies stay image occlusion. */
export async function cloneNoteType(db: NenrinDB, typeId: string, name: string): Promise<NoteType> {
  const source = await db.noteTypes.get(typeId);
  if (!source) throw new Error('This note type no longer exists.');
  const copy: NoteType = {
    ...structuredClone(source),
    id: newId(),
    name: name.trim() || `${source.name} copy`,
  };
  await db.noteTypes.add(copy);
  return copy;
}

/** Deletes a note type nobody uses. Returns false (and deletes nothing) if notes use it. */
export async function deleteNoteType(db: NenrinDB, typeId: string): Promise<boolean> {
  if (isBuiltin(typeId)) return false;
  return db.transaction('rw', db.noteTypes, db.notes, async () => {
    if (await db.notes.where('noteTypeId').equals(typeId).count()) return false;
    await db.noteTypes.delete(typeId);
    return true;
  });
}

/** A unique "Name copy" / "Name copy 2" for a clone. */
export function copyName(name: string, taken: string[]): string {
  const base = `${name} copy`;
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) if (!taken.includes(`${base} ${i}`)) return `${base} ${i}`;
}

/** Sample fields for previewing a type with no notes: each field shows its own name. */
export function sampleNote(type: NoteType): Note {
  return {
    id: 'preview',
    noteTypeId: type.id,
    fields: Object.fromEntries(
      type.fields.map((f, i) =>
        type.kind === 'cloze' && i === 0 ? [f, `{{c1::${f}}} example`] : [f, `(${f})`],
      ),
    ),
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  };
}
