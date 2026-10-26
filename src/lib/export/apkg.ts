/**
 * Exports decks as an Anki package (.apkg), so notes, progress and media can go back to Anki.
 * This file maps Nenrin's data to Anki's numbers on the main thread (it needs IndexedDB and
 * Markdown rendering); ../anki/write.ts lays out the SQLite file and zip in a worker.
 */
import type { NenrinDB } from '../db';
import type { Card, Deck, Note, NoteType, ReviewLog } from '../db/types';
import { deckSubtreeIds } from '../db/decks';
import { getPrefs } from '../db/prefs';
import { ankiNoteTypeId } from '../anki/import';
import type { ApkgCard, ApkgInput, ApkgNote, ApkgRevlog } from '../anki/write';
import { fieldToAnkiHtml, mediaRefs, stripHtml } from '../render';
import { State } from '../scheduler';
import { dayStart, nextDayStart } from '../study/day';

const DAY_MS = 86_400_000;

export interface ApkgOptions {
  /** Export one deck and its sub-decks; all decks if omitted. */
  deckId?: string;
  /** Keep due dates, FSRS memory and review history. Off: every card is new (for sharing). */
  scheduling: boolean;
}

/**
 * A stable Anki-sized id (13 digits, like a millisecond timestamp) for a Nenrin string id, so
 * exporting again maps to the same Anki note type and deck instead of making new ones.
 */
export function stableId(key: string): number {
  // FNV-1a, 32-bit, twice with different seeds for 53 usable bits.
  const fnv = (seed: number) => {
    let h = seed;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
    return h >>> 0;
  };
  const n = (fnv(0x811c9dc5) % 0x100000) * 0x100000000 + fnv(0x01234567);
  return 1_000_000_000_000 + (n % 8_000_000_000_000);
}

/** Imported Anki note types keep their original id; others get a stable hash. */
export function noteTypeNumber(id: string): number {
  const m = /^anki-(\d+)$/.exec(id);
  return m && id === ankiNoteTypeId(Number(m[1])) ? Number(m[1]) : stableId(`notetype:${id}`);
}

/** Hands out unique ids starting near a preferred one (Anki ids are creation times in ms). */
function idAllocator() {
  const used = new Set<number>();
  return (preferred: number): number => {
    let id = Math.max(1, Math.floor(preferred));
    while (used.has(id)) id++;
    used.add(id);
    return id;
  };
}

export interface SchedContext {
  /** Collection creation (start of a study day), ms. */
  crtMs: number;
  now: number;
  rolloverHour: number;
  desiredRetention: number;
}

/** Anki's day number for a timestamp: whole study days since the collection was created. */
export function ankiDay(ms: number, ctx: SchedContext): number {
  return Math.round((dayStart(ms, ctx.rolloverHour) - ctx.crtMs) / DAY_MS);
}

/** Maps a card's FSRS state to Anki's type/queue/due/ivl. `newPos` orders new cards. */
export function toAnkiSchedule(
  card: Card,
  newPos: number,
  ctx: SchedContext,
): Omit<ApkgCard, 'id' | 'nid' | 'did' | 'ord'> {
  const base = { reps: card.reps, lapses: card.lapses, left: 0 };
  let sched: Omit<ApkgCard, 'id' | 'nid' | 'did' | 'ord' | 'reps' | 'lapses' | 'left'>;
  if (card.state === State.New) {
    sched = { type: 0, queue: 0, due: newPos, ivl: 0, factor: 0 };
  } else if (card.state === State.Review) {
    sched = {
      type: 2,
      queue: 2,
      due: ankiDay(card.due, ctx),
      ivl: Math.max(1, Math.round(card.scheduledDays)),
      factor: 2500,
    };
  } else {
    // Learning or relearning: due today counts in seconds, later days by day number.
    const today = card.due < nextDayStart(ctx.now, ctx.rolloverHour);
    const relearning = card.state === State.Relearning;
    sched = {
      type: relearning ? 3 : 1,
      queue: today ? 1 : 3,
      due: today ? Math.floor(card.due / 1000) : ankiDay(card.due, ctx),
      ivl: relearning ? Math.max(1, Math.round(card.stability)) : 0,
      factor: relearning ? 2500 : 0,
    };
    base.left = 1;
  }
  if (card.suspended) sched.queue = -1;
  else if (card.buriedUntil && card.buriedUntil > ctx.now) sched.queue = -3;
  const memory =
    card.state !== State.New && card.stability > 0
      ? {
          s: Number(card.stability.toFixed(4)),
          d: Number(card.difficulty.toFixed(4)),
          dr: ctx.desiredRetention,
          lrt: card.lastReview ? Math.floor(card.lastReview / 1000) : undefined,
        }
      : undefined;
  return { ...sched, ...base, memory };
}

/** Review log rows; `state` is the state before the review. */
export function toAnkiRevlog(logs: ReviewLog[], cardIds: Map<string, number>): ApkgRevlog[] {
  const nextId = idAllocator();
  const lastIvl = new Map<string, number>();
  return [...logs]
    .sort((a, b) => a.ts - b.ts)
    .flatMap((log) => {
      const cid = cardIds.get(log.cardId);
      if (cid === undefined) return [];
      const days = Math.round(log.scheduledDays);
      // Nenrin doesn't keep learning-step lengths; Anki only displays this, FSRS ignores it.
      const ivl = days >= 1 ? days : -600;
      const prev = lastIvl.get(log.cardId) ?? 0;
      lastIvl.set(log.cardId, ivl);
      const type =
        log.state === State.Review ? 1 : log.state === State.Relearning ? 2 : /* new, learning */ 0;
      return [
        {
          id: nextId(log.ts),
          cid,
          ease: log.rating,
          ivl,
          lastIvl: prev,
          factor: type === 0 ? 0 : 2500,
          time: Math.min(Math.max(0, Math.round(log.durationMs)), 2_000_000_000),
          type,
        },
      ];
    });
}

/** Template and CSS files an imported note type uses (Anki names them with a leading _). */
function noteTypeMedia(t: NoteType): string[] {
  const text = [t.css, ...t.templates.flatMap((tpl) => [tpl.front, tpl.back])].join('\n');
  return [...text.matchAll(/["'(]\s*(_[^"')\s]+)/g)].map((m) => m[1]);
}

/** Media files a note's (exported) fields reference. */
function fieldMedia(html: string): string[] {
  return [...mediaRefs(html), ...[...html.matchAll(/\[sound:([^\]]+)\]/g)].map((m) => m[1].trim())];
}

async function checksum(text: string): Promise<number> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  const b = new Uint8Array(digest);
  return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
}

/** Gathers what writeAnkiPackage needs from the database. */
export async function collectApkg(
  db: NenrinDB,
  options: ApkgOptions,
  now = Date.now(),
): Promise<ApkgInput> {
  const { rolloverHour } = await getPrefs(db);
  const allDecks = await db.decks.toArray();
  const byId = new Map(allDecks.map((d) => [d.id, d]));
  const deckIds = options.deckId
    ? new Set(await deckSubtreeIds(db, options.deckId))
    : new Set(allDecks.map((d) => d.id));
  const decks = allDecks.filter((d) => deckIds.has(d.id));
  const path = (d: Deck): string[] => {
    const parts: string[] = [];
    for (let x: Deck | undefined = d; x; x = x.parentId ? byId.get(x.parentId) : undefined) {
      parts.unshift(x.name);
    }
    return parts;
  };
  const deckNumber = new Map(decks.map((d) => [d.id, stableId(`deck:${d.id}`)]));

  const cards = await db.cards
    .where('deckId')
    .anyOf([...deckIds])
    .toArray();
  const notes = (await db.notes.bulkGet([...new Set(cards.map((c) => c.noteId))]))
    .filter((n): n is Note => !!n)
    .sort((a, b) => a.createdAt - b.createdAt);
  const types = (await db.noteTypes.bulkGet([...new Set(notes.map((n) => n.noteTypeId))])).filter(
    (t): t is NoteType => !!t,
  );
  const typeById = new Map(types.map((t) => [t.id, t]));

  const crtMs = dayStart(
    Math.min(now, ...notes.map((n) => n.createdAt), ...decks.map((d) => d.createdAt)),
    rolloverHour,
  );

  const noteId = idAllocator();
  const noteNumber = new Map<string, number>();
  const media = new Set(types.flatMap(noteTypeMedia));
  const apkgNotes: ApkgNote[] = [];
  for (const note of notes) {
    const type = typeById.get(note.noteTypeId);
    if (!type) continue;
    const fields = type.fields.map((f) => fieldToAnkiHtml(note.fields[f] ?? '', note.format));
    for (const f of fields) for (const m of fieldMedia(f)) media.add(m);
    const sfld = stripHtml(fields[0] ?? '').trim();
    const id = noteId(note.createdAt);
    noteNumber.set(note.id, id);
    apkgNotes.push({
      id,
      guid: note.ankiGuid ?? note.id,
      mid: noteTypeNumber(type.id),
      mod: Math.floor(note.updatedAt / 1000),
      tags: note.tags,
      fields,
      sfld,
      csum: await checksum(sfld),
    });
  }

  const cardId = idAllocator();
  const cardNumber = new Map<string, number>();
  const apkgCards: ApkgCard[] = [];
  let newPos = 0;
  const byNoteOrder = cards
    .filter((c) => noteNumber.has(c.noteId))
    .sort((a, b) => noteNumber.get(a.noteId)! - noteNumber.get(b.noteId)! || a.ordinal - b.ordinal);
  for (const card of byNoteOrder) {
    const nid = noteNumber.get(card.noteId)!;
    const id = cardId(nid + card.ordinal);
    cardNumber.set(card.id, id);
    const ctx: SchedContext = {
      crtMs,
      now,
      rolloverHour,
      desiredRetention: byId.get(card.deckId)?.config.desiredRetention ?? 0.9,
    };
    const fresh = { ...card, state: State.New, suspended: false, buriedUntil: undefined };
    const sched = options.scheduling
      ? toAnkiSchedule(card, newPos + 1, ctx)
      : { ...toAnkiSchedule(fresh, newPos + 1, ctx), reps: 0, lapses: 0 };
    if (sched.type === 0) newPos++;
    apkgCards.push({ id, nid, did: deckNumber.get(card.deckId)!, ord: card.ordinal, ...sched });
  }

  const revlog = options.scheduling
    ? toAnkiRevlog(
        await db.reviewLogs
          .where('cardId')
          .anyOf([...cardNumber.keys()])
          .toArray(),
        cardNumber,
      )
    : [];

  const files = (await db.media.bulkGet([...media])).filter((m) => !!m);
  return {
    crt: Math.floor(crtMs / 1000),
    now,
    noteTypes: types.map((t) => ({
      id: noteTypeNumber(t.id),
      name: t.name,
      kind: t.kind,
      fields: t.fields,
      templates: t.templates.map((tpl) => ({ name: tpl.name, qfmt: tpl.front, afmt: tpl.back })),
      css: t.css,
    })),
    decks: decks.map((d) => ({ id: deckNumber.get(d.id)!, path: path(d) })),
    notes: apkgNotes,
    cards: apkgCards,
    revlog,
    media: await Promise.all(
      files.map(async (m) => ({
        name: m.filename,
        data: new Uint8Array(await m.blob.arrayBuffer()),
      })),
    ),
  };
}

export function apkgFilename(name = 'nenrin', now = new Date()): string {
  const slug = name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'deck';
  return `${slug}-${now.toISOString().slice(0, 10)}.apkg`;
}
