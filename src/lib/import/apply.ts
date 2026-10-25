import type { NenrinDB } from '../db';
import { createDeck } from '../db/decks';
import type { Deck, Note, NoteType } from '../db/types';
import { addNote, cardOrdinals, NoCardsError, updateNote } from '../notes';
import { plainToHtml, type TextFile } from './text';

export type ColumnTarget =
  | { kind: 'field'; name: string }
  | { kind: 'tags' }
  | { kind: 'deck' }
  | { kind: 'notetype' }
  | { kind: 'guid' }
  | { kind: 'ignore' };

export type DuplicateMode = 'update' | 'skip' | 'duplicate';

export interface TextImportOptions {
  noteTypeId: string;
  deckId: string;
  mapping: ColumnTarget[];
  /** Treat field contents as HTML; otherwise they are escaped as plain text. */
  html: boolean;
  duplicates: DuplicateMode;
  tags: string[];
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/** Default column mapping: header-declared special columns, then note type fields in order. */
export function defaultMapping(file: TextFile, noteType: NoteType): ColumnTarget[] {
  const { headers } = file;
  const special = new Map<number, ColumnTarget>();
  if (headers.tagsColumn) special.set(headers.tagsColumn - 1, { kind: 'tags' });
  if (headers.deckColumn) special.set(headers.deckColumn - 1, { kind: 'deck' });
  if (headers.notetypeColumn) special.set(headers.notetypeColumn - 1, { kind: 'notetype' });
  if (headers.guidColumn) special.set(headers.guidColumn - 1, { kind: 'guid' });
  let next = 0;
  return Array.from({ length: file.columnCount }, (_, i) => {
    const s = special.get(i);
    if (s) return s;
    const name = noteType.fields[next++];
    return name ? { kind: 'field', name } : { kind: 'ignore' };
  });
}

/** Finds a deck by id or Anki-style path ("Parent::Child"), creating missing levels. */
async function resolveDeck(db: NenrinDB, decks: Deck[], ref: string): Promise<string> {
  const byId = decks.find((d) => d.id === ref);
  if (byId) return byId.id;
  let parentId: string | undefined;
  for (const name of ref
    .split('::')
    .map((s) => s.trim())
    .filter(Boolean)) {
    let deck = decks.find((d) => d.name === name && d.parentId === parentId);
    if (!deck) {
      deck = await createDeck(db, name, parentId);
      decks.push(deck);
    }
    parentId = deck.id;
  }
  if (!parentId) throw new Error('Empty deck name');
  return parentId;
}

export async function importTextFile(
  db: NenrinDB,
  file: TextFile,
  options: TextImportOptions,
  now = Date.now(),
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, errors: [] };
  await db.transaction(
    'rw',
    [db.decks, db.noteTypes, db.notes, db.cards, db.reviewLogs],
    async () => {
      const decks = await db.decks.toArray();
      const noteTypes = await db.noteTypes.toArray();
      const typeByRef = (ref: string) =>
        noteTypes.find((t) => t.id === ref || t.name.toLowerCase() === ref.toLowerCase());
      // First-field index per note type, for duplicate detection.
      const firstFieldIndex = new Map<string, Map<string, Note>>();
      const indexFor = async (type: NoteType) => {
        let index = firstFieldIndex.get(type.id);
        if (!index) {
          index = new Map();
          for (const n of await db.notes.where('noteTypeId').equals(type.id).toArray()) {
            index.set(n.fields[type.fields[0]] ?? '', n);
          }
          firstFieldIndex.set(type.id, index);
        }
        return index;
      };
      const convert = (v: string) => (options.html ? v : plainToHtml(v));
      const hasNotetypeColumn = options.mapping.some((m) => m.kind === 'notetype');

      for (const [i, row] of file.rows.entries()) {
        const rowNumber = i + 1;
        try {
          let type = typeByRef(options.noteTypeId);
          let deckId = options.deckId;
          let guid: string | undefined;
          const tags = [...(file.headers.tags ?? []), ...options.tags];
          const regular: string[] = [];
          const named: Record<string, string> = {};

          for (const [col, target] of options.mapping.entries()) {
            const value = row[col] ?? '';
            if (target.kind === 'field') {
              named[target.name] = convert(value);
              regular.push(convert(value));
            } else if (target.kind === 'tags') tags.push(...value.split(/\s+/).filter(Boolean));
            else if (target.kind === 'guid') guid = value.trim() || undefined;
            else if (target.kind === 'notetype' && value.trim()) type = typeByRef(value.trim());
            else if (target.kind === 'deck' && value.trim()) {
              deckId = await resolveDeck(db, decks, value.trim());
            }
          }
          if (!type) throw new Error('Unknown note type');
          // With a note type column, regular columns map to each type's fields by position.
          const fields: Record<string, string> = Object.fromEntries(
            type.fields.map((f, k) => [f, (hasNotetypeColumn ? regular[k] : named[f]) ?? '']),
          );
          const uniqueTags = [...new Set(tags)];
          // Check before writing: an error thrown inside addNote's nested transaction would
          // abort the whole import instead of just this row.
          if (cardOrdinals(type, fields, 'html').length === 0) throw new NoCardsError(type);

          const index = await indexFor(type);
          // Nenrin exports its own note id as the GUID when a note didn't come from Anki.
          const existing = guid
            ? ((await db.notes.where('ankiGuid').equals(guid).first()) ??
              (await db.notes.get(guid)))
            : options.duplicates !== 'duplicate'
              ? index.get(fields[type.fields[0]])
              : undefined;

          if (existing && (guid || options.duplicates !== 'duplicate')) {
            if (options.duplicates === 'skip') {
              result.skipped++;
              continue;
            }
            await updateNote(db, existing.id, { fields, tags: uniqueTags, format: 'html' }, now);
            result.updated++;
            continue;
          }
          const note = await addNote(
            db,
            {
              noteTypeId: type.id,
              deckId,
              fields,
              tags: uniqueTags,
              format: 'html',
              ankiGuid: guid,
            },
            now + i,
          );
          index.set(fields[type.fields[0]], note);
          result.added++;
        } catch (err) {
          const message =
            err instanceof NoCardsError
              ? `would make no cards: ${err.message}`
              : (err as Error).message;
          result.errors.push({ row: rowNumber, message });
        }
      }
    },
  );
  return result;
}
