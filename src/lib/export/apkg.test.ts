import 'fake-indexeddb/auto';
import { unzipSync } from 'fflate';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NenrinDB } from '../db';
import { createDeck } from '../db/decks';
import { recordReview } from '../db/repo';
import { importAnkiPackage } from '../anki/import';
import { readAnkiPackage } from '../anki/package';
import { writeAnkiPackage } from '../anki/write';
import { addNote, ensureBuiltins } from '../notes';
import { Rating, State } from '../scheduler';
import { dayStart } from '../study/day';
import { ankiDay, collectApkg, noteTypeNumber, stableId, toAnkiSchedule } from './apkg';

const NOW = new Date(2026, 9, 26, 12).getTime();
const DAY = 86_400_000;
let SQL: SqlJsStatic;
let db: NenrinDB;

beforeAll(async () => {
  SQL = await initSqlJs();
});
beforeEach(async () => {
  db = new NenrinDB(`test-${crypto.randomUUID()}`);
  await ensureBuiltins(db);
});
afterEach(async () => {
  await db.delete();
});

const exportPkg = async (options: Parameters<typeof collectApkg>[1]) =>
  readAnkiPackage(writeAnkiPackage(await collectApkg(db, options, NOW), SQL), SQL);

describe('apkg export', () => {
  it('gives stable Anki ids, keeping imported note type ids', () => {
    expect(stableId('deck:x')).toBe(stableId('deck:x'));
    expect(stableId('deck:x')).not.toBe(stableId('deck:y'));
    expect(Number.isSafeInteger(stableId('deck:x'))).toBe(true);
    expect(stableId('deck:x')).toBeGreaterThan(1e12);
    expect(noteTypeNumber('anki-1700000000000')).toBe(1700000000000);
    expect(noteTypeNumber('basic')).toBe(stableId('notetype:basic'));
  });

  it('writes notes, note types, decks, tags and media that Anki-format readers understand', async () => {
    const parent = await createDeck(db, 'Japanese', undefined, NOW - 10 * DAY);
    const child = await createDeck(db, 'Vocab', parent.id, NOW - 10 * DAY);
    await addNote(
      db,
      {
        noteTypeId: 'basic-reversed',
        deckId: child.id,
        fields: { Front: '**年輪** $x^2$', Back: '![ring](ring.png)' },
        tags: ['jp', 'tree'],
      },
      NOW - 5 * DAY,
    );
    await addNote(
      db,
      { noteTypeId: 'cloze', deckId: parent.id, fields: { Text: '{{c1::a}} {{c2::b}}' } },
      NOW - 4 * DAY,
    );
    await db.media.put({
      filename: 'ring.png',
      blob: new Blob([new Uint8Array([1, 2, 3])]),
      mime: 'image/png',
      sha1: 'x',
    });
    await db.media.put({
      filename: 'unused.png',
      blob: new Blob([new Uint8Array([9])]),
      mime: 'image/png',
      sha1: 'y',
    });

    const pkg = await exportPkg({ scheduling: true });
    expect(pkg.decks.map((d) => d.path.join('::')).sort()).toEqual([
      'Default',
      'Japanese',
      'Japanese::Vocab',
    ]);
    const basic = pkg.notes.find((n) => n.tags.includes('jp'))!;
    expect(basic.tags).toEqual(['jp', 'tree']);
    expect(basic.fields[0]).toBe('<strong>年輪</strong> \\(x^2\\)');
    expect(basic.fields[1]).toBe('<img src="ring.png" alt="ring">');
    const reversed = pkg.noteTypes.find((t) => t.name === 'Basic (and reversed card)')!;
    expect(reversed.templates.map((t) => t.qfmt)).toEqual(['{{Front}}', '{{Back}}']);
    expect(pkg.noteTypes.find((t) => t.name === 'Cloze')!.kind).toBe('cloze');
    expect(pkg.cards).toHaveLength(4);
    expect(pkg.cards.filter((c) => c.nid === basic.id).map((c) => c.ord)).toEqual([0, 1]);
    expect(new Set(pkg.cards.map((c) => c.id)).size).toBe(4);
    expect(pkg.media.map((m) => m.name)).toEqual(['ring.png']);
    expect([...pkg.media[0].data]).toEqual([1, 2, 3]);
  });

  it('exports one deck with its sub-decks only', async () => {
    const a = await createDeck(db, 'A', undefined, NOW);
    const b = await createDeck(db, 'B', a.id, NOW);
    const other = await createDeck(db, 'Other', undefined, NOW);
    await addNote(
      db,
      { noteTypeId: 'basic', deckId: b.id, fields: { Front: 'in', Back: '' } },
      NOW,
    );
    await addNote(
      db,
      { noteTypeId: 'basic', deckId: other.id, fields: { Front: 'out', Back: '' } },
      NOW,
    );
    const pkg = await exportPkg({ deckId: a.id, scheduling: true });
    expect(pkg.notes.map((n) => n.fields[0])).toEqual(['in']);
    expect(pkg.decks.map((d) => d.path.join('::')).sort()).toEqual(['A', 'A::B', 'Default']);
  });

  it('keeps progress, and round-trips it through the importer', async () => {
    const deck = await createDeck(db, 'D', undefined, NOW - 30 * DAY);
    const note = await addNote(
      db,
      { noteTypeId: 'basic', deckId: deck.id, fields: { Front: 'q', Back: 'a' } },
      NOW - 30 * DAY,
    );
    const [card] = await db.cards.where('noteId').equals(note.id).toArray();
    await recordReview(db, card.id, Rating.Good, { now: NOW - 20 * DAY, durationMs: 4000 });
    await recordReview(db, card.id, Rating.Good, { now: NOW - 19 * DAY, durationMs: 3000 });
    await recordReview(db, card.id, Rating.Good, { now: NOW - 10 * DAY, durationMs: 2000 });
    const before = (await db.cards.get(card.id))!;
    expect(before.state).toBe(State.Review);

    const pkg = await exportPkg({ scheduling: true });
    const [c] = pkg.cards;
    expect(c.type).toBe(2);
    expect(c.queue).toBe(2);
    expect(c.reps).toBe(3);
    expect(c.memory?.s).toBeCloseTo(before.stability, 3);
    expect(c.memory?.d).toBeCloseTo(before.difficulty, 3);
    expect(pkg.revlog.map((r) => r.ease)).toEqual([3, 3, 3]);
    expect(pkg.revlog.map((r) => r.time)).toEqual([4000, 3000, 2000]);
    expect(pkg.revlog.map((r) => r.type)).toEqual([0, 0, 1]);
    // Due day counts from crt, which is the start of a study day.
    expect(pkg.crt * 1000).toBe(dayStart(pkg.crt * 1000, 4));
    // Anki counts days as 24 h, so a DST change in between may shift the time by an hour.
    const nearDay = (ms: number) => Math.abs(ms - dayStart(before.due, 4)) <= 3_600_000;
    expect(nearDay(pkg.crt * 1000 + c.due * DAY)).toBe(true);

    const back = new NenrinDB(`test-${crypto.randomUUID()}`);
    try {
      await ensureBuiltins(back);
      await importAnkiPackage(back, pkg, { scheduling: true }, NOW);
      const [imported] = await back.cards.toArray();
      expect(imported.state).toBe(State.Review);
      expect(imported.stability).toBeCloseTo(before.stability, 3);
      expect(nearDay(imported.due)).toBe(true);
      expect(await back.reviewLogs.count()).toBe(3);
      const [importedNote] = await back.notes.toArray();
      expect(importedNote.ankiGuid).toBe(note.id);
    } finally {
      await back.delete();
    }
  });

  it('without progress, every card is new and no history is included', async () => {
    const deck = await createDeck(db, 'D', undefined, NOW);
    const note = await addNote(
      db,
      { noteTypeId: 'basic', deckId: deck.id, fields: { Front: 'q', Back: 'a' } },
      NOW,
    );
    const [card] = await db.cards.where('noteId').equals(note.id).toArray();
    await recordReview(db, card.id, Rating.Good, { now: NOW });
    await db.cards.update(card.id, { suspended: true });
    const pkg = await exportPkg({ scheduling: false });
    expect(pkg.cards[0]).toMatchObject({
      type: 0,
      queue: 0,
      reps: 0,
      lapses: 0,
      memory: undefined,
    });
    expect(pkg.revlog).toEqual([]);
  });

  it('exports image occlusion notes as Anki’s own image occlusion type', async () => {
    const deck = await createDeck(db, 'IO', undefined, NOW);
    await addNote(
      db,
      {
        noteTypeId: 'image-occlusion',
        deckId: deck.id,
        fields: {
          Occlusion: '{{c1::image-occlusion:rect:left=.1:top=.1:width=.2:height=.2:oi=1}}',
          Image: '<img src="heart.png">',
        },
      },
      NOW,
    );
    const zip = unzipSync(writeAnkiPackage(await collectApkg(db, { scheduling: true }, NOW), SQL));
    const col = new SQL.Database(zip['collection.anki21']);
    const models = JSON.parse(String(col.exec('SELECT models FROM col')[0].values[0][0]));
    col.close();
    const io = Object.values(models as Record<string, Record<string, unknown>>).find(
      (m) => m.name === 'Image Occlusion',
    )!;
    expect(io.originalStockKind).toBe(6);
    expect(JSON.stringify(io.tmpls)).toContain('anki.imageOcclusion.setup()');
    // The Occlusion field goes out unchanged, in Anki's format.
    const pkg = readAnkiPackage(
      writeAnkiPackage(await collectApkg(db, { scheduling: true }, NOW), SQL),
      SQL,
    );
    expect(pkg.notes[0].fields[0]).toBe(
      '{{c1::image-occlusion:rect:left=.1:top=.1:width=.2:height=.2:oi=1}}',
    );
  });

  it('maps learning, suspended and buried cards to Anki queues', () => {
    const ctx = {
      crtMs: dayStart(NOW - 5 * DAY, 4),
      now: NOW,
      rolloverHour: 4,
      desiredRetention: 0.9,
    };
    const base = {
      id: 'c',
      noteId: 'n',
      deckId: 'd',
      ordinal: 0,
      suspended: false,
      buried: false,
      stability: 2,
      difficulty: 5,
      scheduledDays: 0,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      lastReview: NOW - 60_000,
    };
    const soon = toAnkiSchedule({ ...base, state: State.Learning, due: NOW + 600_000 }, 1, ctx);
    expect(soon).toMatchObject({ type: 1, queue: 1, due: Math.floor((NOW + 600_000) / 1000) });
    const later = toAnkiSchedule({ ...base, state: State.Relearning, due: NOW + 2 * DAY }, 1, ctx);
    expect(later).toMatchObject({ type: 3, queue: 3, due: ankiDay(NOW + 2 * DAY, ctx) });
    const suspended = toAnkiSchedule(
      { ...base, state: State.Review, due: NOW, suspended: true },
      1,
      ctx,
    );
    expect(suspended.queue).toBe(-1);
    const buried = toAnkiSchedule(
      { ...base, state: State.Review, due: NOW, buriedUntil: NOW + DAY },
      1,
      ctx,
    );
    expect(buried.queue).toBe(-3);
    expect(ankiDay(NOW, ctx)).toBe(5);
  });
});
