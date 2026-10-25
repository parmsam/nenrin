/**
 * Writes a parsed Anki package (see ./package.ts) into Nenrin's database.
 *
 * - Note types become Nenrin note types with id `anki-<id>`, keeping Anki's templates.
 * - Notes are matched by Anki GUID: newer imported notes update fields; missing cards are added.
 * - With `scheduling`, cards keep Anki's due dates and FSRS memory (or one rebuilt from review
 *   history), and review history is imported. Without it, everything arrives as new cards.
 * - `replace` (for .colpkg) clears decks, notes, cards and history first, like Anki does.
 */
import { newId, type NenrinDB } from '../db';
import { ensureDeckPath } from '../db/decks';
import type { Card, Deck, Note, NoteType, ReviewLog } from '../db/types';
import { newSchedulingState, replay, State, type Grade, type SchedulingState } from '../scheduler';
import type { AnkiCard, AnkiPackage, AnkiRevlog } from './package';

const DAY_MS = 86_400_000;

export interface AnkiImportOptions {
  /** Keep scheduling and review history. */
  scheduling: boolean;
  /** Clear existing decks/notes/cards/history first (.colpkg semantics). Media is kept. */
  replace?: boolean;
}

export interface AnkiImportResult {
  notesAdded: number;
  notesUpdated: number;
  notesUnchanged: number;
  cardsAdded: number;
  reviewsImported: number;
  mediaImported: number;
  decks: string[];
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  mp4: 'video/mp4',
};

const mimeFor = (name: string) =>
  MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

async function sha1Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', data as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Like Map.groupBy, which older Safari (iOS < 17.4) lacks. */
function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}

export const ankiNoteTypeId = (mid: number) => `anki-${mid}`;

/** Converts an Anki card's scheduling into Nenrin's FSRS state. */
export function convertScheduling(
  card: AnkiCard,
  crt: number,
  history: AnkiRevlog[],
  now: number,
): SchedulingState {
  const due = card.odid && card.odue ? card.odue : card.due;
  // Review cards (and day-learning) count due in days from collection creation;
  // intraday learning cards store an epoch timestamp in seconds.
  const dueMs = card.type === 2 || due < 1e8 ? crt * 1000 + due * DAY_MS : due * 1000;
  const graded = history
    .filter((r) => r.ease >= 1 && r.ease <= 4 && r.type <= 3)
    .map((r) => ({ ts: r.id, rating: r.ease as Grade }));
  const replayed = replay(graded);
  const lastReview =
    (card.memory?.lrt ? card.memory.lrt * 1000 : undefined) ??
    graded.at(-1)?.ts ??
    (card.ivl > 0 ? dueMs - card.ivl * DAY_MS : undefined);
  return {
    due: dueMs,
    stability: card.memory?.s ?? replayed?.stability ?? Math.max(card.ivl, 0.5),
    difficulty: card.memory?.d ?? replayed?.difficulty ?? 5,
    scheduledDays: Math.max(card.ivl, 0),
    learningSteps: 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.type === 1 ? State.Learning : card.type === 3 ? State.Relearning : State.Review,
    lastReview: lastReview ?? Math.min(now, dueMs),
  };
}

/** Anki review log entries → Nenrin logs. Manual reschedules (ease 0) are skipped. */
function convertHistory(cardId: string, history: AnkiRevlog[]): ReviewLog[] {
  const logs: ReviewLog[] = [];
  let previous: number | undefined;
  for (const r of history) {
    if (r.ease < 1 || r.ease > 4 || r.type > 3) continue;
    logs.push({
      // Deterministic ids make re-importing the same package idempotent.
      id: `anki-${r.id}-${r.cid}`,
      cardId,
      ts: r.id,
      rating: r.ease as Grade,
      state:
        previous === undefined
          ? State.New
          : r.type === 0
            ? State.Learning
            : r.type === 2
              ? State.Relearning
              : State.Review,
      elapsedDays: previous === undefined ? 0 : Math.floor((r.id - previous) / DAY_MS),
      scheduledDays: Math.max(r.ivl, 0),
      stability: 0,
      difficulty: 0,
      durationMs: r.time,
      deviceId: 'anki-import',
    });
    previous = r.id;
  }
  return logs;
}

export async function importAnkiPackage(
  db: NenrinDB,
  pkg: AnkiPackage,
  options: AnkiImportOptions,
  now = Date.now(),
): Promise<AnkiImportResult> {
  const result: AnkiImportResult = {
    notesAdded: 0,
    notesUpdated: 0,
    notesUnchanged: 0,
    cardsAdded: 0,
    reviewsImported: 0,
    mediaImported: 0,
    decks: [],
  };

  // Hash media before the transaction: awaiting non-IndexedDB work inside one commits it early.
  const media = await Promise.all(
    pkg.media.map(async (m) => ({
      filename: m.name,
      mime: mimeFor(m.name),
      sha1: await sha1Hex(m.data),
      blob: new Blob([m.data as Uint8Array<ArrayBuffer>], { type: mimeFor(m.name) }),
    })),
  );

  const typeById = new Map(pkg.noteTypes.map((t) => [t.id, t]));
  const deckById = new Map(pkg.decks.map((d) => [d.id, d]));
  const cardsByNote = groupBy(pkg.cards, (c) => c.nid);
  const historyByCard = groupBy(pkg.revlog, (r) => r.cid);

  await db.transaction(
    'rw',
    [db.decks, db.noteTypes, db.notes, db.cards, db.reviewLogs, db.media],
    async () => {
      if (options.replace) {
        await Promise.all([
          db.decks.clear(),
          db.notes.clear(),
          db.cards.clear(),
          db.reviewLogs.clear(),
        ]);
      }

      const noteTypes: NoteType[] = pkg.noteTypes.map((t) => ({
        id: ankiNoteTypeId(t.id),
        name: t.name,
        kind: t.kind,
        fields: t.fields,
        templates: t.templates.map((tpl) => ({ name: tpl.name, front: tpl.qfmt, back: tpl.afmt })),
        css: t.css,
      }));
      await db.noteTypes.bulkPut(noteTypes);

      const knownDecks: Deck[] = await db.decks.toArray();
      const deckIds = new Map<number, string>();
      const deckFor = async (card: AnkiCard): Promise<string> => {
        // Cards in a filtered deck go home to their original deck.
        const ankiId = card.odid || card.did;
        let id = deckIds.get(ankiId);
        if (!id) {
          const deck = deckById.get(ankiId);
          const path = deck && !deck.filtered ? deck.path : ['Default'];
          id = await ensureDeckPath(db, knownDecks, path, now);
          deckIds.set(ankiId, id);
          result.decks.push(path.join(' / '));
        }
        return id;
      };

      const newNotes: Note[] = [];
      const newCards: Card[] = [];
      const newLogs: ReviewLog[] = [];
      let order = 0;

      // Keep Anki's new-card order: notes in id (creation) order, cards by ordinal.
      for (const note of [...pkg.notes].sort((a, b) => a.id - b.id)) {
        const type = typeById.get(note.mid);
        if (!type) continue;
        const fields = Object.fromEntries(type.fields.map((f, i) => [f, note.fields[i] ?? '']));
        const tags = [...new Set(note.tags)];
        const mod = note.mod * 1000;
        const ankiCards = (cardsByNote.get(note.id) ?? []).sort((a, b) => a.ord - b.ord);

        let noteId: string;
        let haveOrds = new Set<number>();
        const existing = await db.notes.where('ankiGuid').equals(note.guid).first();
        if (existing) {
          noteId = existing.id;
          haveOrds = new Set(
            (await db.cards.where('noteId').equals(noteId).toArray()).map((c) => c.ordinal),
          );
          if (mod > existing.updatedAt) {
            await db.notes.update(noteId, { fields, tags, updatedAt: mod, format: 'html' });
            result.notesUpdated++;
          } else {
            result.notesUnchanged++;
          }
        } else {
          noteId = newId();
          newNotes.push({
            id: noteId,
            noteTypeId: ankiNoteTypeId(type.id),
            fields,
            tags,
            createdAt: note.id,
            updatedAt: mod,
            format: 'html',
            ankiGuid: note.guid,
          });
          result.notesAdded++;
        }

        for (const card of ankiCards) {
          if (haveOrds.has(card.ord)) continue;
          const id = newId();
          const history = historyByCard.get(card.id) ?? [];
          const scheduled = options.scheduling && card.type !== 0;
          newCards.push({
            ...(scheduled
              ? convertScheduling(card, pkg.crt, history, now)
              : newSchedulingState(now + order++)),
            id,
            noteId,
            deckId: await deckFor(card),
            ordinal: card.ord,
            suspended: options.scheduling && card.queue === -1,
            buried: false,
          });
          if (options.scheduling) newLogs.push(...convertHistory(id, history));
        }
      }

      await db.notes.bulkAdd(newNotes);
      await db.cards.bulkAdd(newCards);
      await db.reviewLogs.bulkPut(newLogs);
      await db.media.bulkPut(media);
      result.cardsAdded = newCards.length;
      result.reviewsImported = newLogs.length;
      result.mediaImported = media.length;
    },
  );
  return result;
}
