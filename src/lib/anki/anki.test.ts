// @vitest-environment jsdom
// Fixtures are real packages written by Anki 26.09 (see fixtures/generate.py).
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NenrinDB } from '../db';
import { deckTree } from '../db/decks';
import { ensureBuiltins } from '../notes';
import { renderCard } from '../render';
import { State } from '../scheduler';
import { studyState } from '../study/queue';
import { importAnkiPackage } from './import';
import { decode, pbNumber, pbString } from './protobuf';
import { InvalidPackageError, readAnkiPackage } from './package';

let SQL: SqlJsStatic;
const read = (name: string) =>
  readAnkiPackage(new Uint8Array(readFileSync(`fixtures/${name}`)), SQL);

beforeAll(async () => {
  SQL = await initSqlJs();
});

describe('protobuf', () => {
  it('decodes varints, strings and nested messages', () => {
    // field 1 = 150 (varint), field 2 = "hi", field 3 = { field 1 = 1 }
    const msg = decode(
      new Uint8Array([0x08, 0x96, 0x01, 0x12, 0x02, 0x68, 0x69, 0x1a, 0x02, 0x08, 0x01]),
    );
    expect(pbNumber(msg, 1)).toBe(150);
    expect(pbString(msg, 2)).toBe('hi');
    expect(pbNumber(decode(msg.get(3)![0] as Uint8Array), 1)).toBe(1);
  });
});

describe('reading packages', () => {
  for (const [file, format] of [
    ['modern.apkg', 'latest'],
    ['legacy.apkg', 'legacy'],
    ['collection.colpkg', 'latest'],
  ] as const) {
    it(`reads ${file}`, () => {
      const pkg = read(file);
      expect(pkg.format).toBe(format);
      expect(pkg.noteTypes.map((t) => [t.name, t.kind, t.fields])).toEqual(
        expect.arrayContaining([
          ['Basic', 'basic', ['Front', 'Back']],
          ['Basic (and reversed card)', 'basic', ['Front', 'Back']],
          ['Cloze', 'cloze', ['Text', 'Back Extra']],
        ]),
      );
      expect(pkg.decks.map((d) => d.path.join('::'))).toEqual(
        expect.arrayContaining(['Nenrin Fixture::Japanese', 'Nenrin Fixture::Geography']),
      );
      expect(pkg.notes).toHaveLength(8);
      expect(pkg.cards).toHaveLength(10);
      expect(pkg.revlog).toHaveLength(3);
      expect(pkg.media.map((m) => m.name).sort()).toEqual([
        '_fixture-font.woff2',
        'ki.mp3',
        'tree.png',
      ]);
      // PNG signature survives zip + zstd.
      expect([...pkg.media.find((m) => m.name === 'tree.png')!.data.subarray(1, 4)]).toEqual([
        0x50, 0x4e, 0x47,
      ]);
      expect(pkg.cards.filter((c) => c.memory)).toHaveLength(3);
    });
  }

  it('reads a package exported without scheduling', () => {
    const pkg = read('shared.apkg');
    expect(pkg.revlog).toHaveLength(0);
    expect(pkg.cards.every((c) => c.type === 0)).toBe(true);
  });

  it('rejects files that are not packages', () => {
    expect(() => readAnkiPackage(new TextEncoder().encode('nope'), SQL)).toThrow(
      InvalidPackageError,
    );
  });
});

describe('importing packages', () => {
  let db: NenrinDB;
  const NOW = Date.now();

  beforeEach(async () => {
    db = new NenrinDB(`test-${crypto.randomUUID()}`);
    await ensureBuiltins(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('imports decks, notes, cards, media and review history', async () => {
    const result = await importAnkiPackage(db, read('modern.apkg'), { scheduling: true }, NOW);
    expect(result).toMatchObject({
      notesAdded: 8,
      cardsAdded: 10,
      reviewsImported: 3,
      mediaImported: 3,
    });
    // Only decks with cards (and their parents); Anki's empty Default deck is skipped.
    expect(deckTree(await db.decks.toArray()).map((d) => d.path)).toEqual([
      'Nenrin Fixture',
      'Nenrin Fixture / Geography',
      'Nenrin Fixture / Japanese',
    ]);
    const cards = await db.cards.toArray();
    expect(cards.filter((c) => c.state === State.Review)).toHaveLength(1);
    expect(cards.filter((c) => c.state === State.Learning)).toHaveLength(2);
    expect(cards.filter((c) => c.suspended)).toHaveLength(1);

    // The graduated card keeps Anki's FSRS memory and a due date about a week or more out.
    const review = cards.find((c) => c.state === State.Review)!;
    expect(review.stability).toBeCloseTo(8.2956, 3);
    expect(review.difficulty).toBeCloseTo(1, 3);
    // Anki fuzzes intervals, so regenerated fixtures vary by a day or two.
    expect(review.scheduledDays).toBeGreaterThanOrEqual(7);
    expect(review.scheduledDays).toBeLessThanOrEqual(12);
    expect((review.due - review.lastReview!) / 86_400_000).toBeGreaterThan(6);

    expect(await db.media.get('tree.png')).toMatchObject({ mime: 'image/png' });
    expect(await db.reviewLogs.where('cardId').equals(review.id).count()).toBe(1);
  });

  it('renders imported notes, including media, audio and furigana templates', async () => {
    await importAnkiPackage(db, read('modern.apkg'), { scheduling: true }, NOW);
    const notes = await db.notes.toArray();
    const tree = notes.find((n) => n.fields.Front === '木')!;
    const type = (await db.noteTypes.get(tree.noteTypeId))!;
    const back = renderCard(type, tree, 0).back;
    expect(back).toContain('<img src="tree.png">');
    expect(back).toContain('<audio controls="" preload="none" src="ki.mp3"></audio>');
    expect(back).toContain('<hr id="answer">');

    const cloze = notes.find((n) => n.fields.Text?.includes('Paris'))!;
    const clozeType = (await db.noteTypes.get(cloze.noteTypeId))!;
    expect(renderCard(clozeType, cloze, 1).front).toContain(
      'Paris is the capital of <span class="cloze">[…]</span>',
    );
  });

  it('imports a shared deck as all-new cards, in Anki’s order', async () => {
    await importAnkiPackage(db, read('modern.apkg'), { scheduling: false }, NOW);
    const cards = await db.cards.toArray();
    expect(cards.every((c) => c.state === State.New && !c.suspended)).toBe(true);
    expect(await db.reviewLogs.count()).toBe(0);
    const root = (await db.decks.toArray()).find((d) => d.name === 'Nenrin Fixture')!;
    const first = (await studyState(db, root.id, NOW + 1000)).next!;
    expect((await db.notes.get(first.noteId))!.fields.Front).toBe('木');
  });

  it('re-importing the same package adds nothing', async () => {
    await importAnkiPackage(db, read('modern.apkg'), { scheduling: true }, NOW);
    const again = await importAnkiPackage(db, read('legacy.apkg'), { scheduling: true }, NOW);
    expect(again).toMatchObject({ notesAdded: 0, notesUnchanged: 8, cardsAdded: 0 });
    expect(await db.notes.count()).toBe(8);
    expect(await db.cards.count()).toBe(10);
    expect(await db.decks.count()).toBe(3);
  });

  it('a collection package replaces existing decks and cards', async () => {
    await importAnkiPackage(db, read('shared.apkg'), { scheduling: false }, NOW);
    await db.decks.add({ id: 'mine', name: 'Mine', config: {} as never, createdAt: 0 });
    await importAnkiPackage(
      db,
      read('collection.colpkg'),
      { scheduling: true, replace: true },
      NOW,
    );
    expect((await db.decks.toArray()).map((d) => d.name)).not.toContain('Mine');
    expect(await db.cards.count()).toBe(10);
    expect(await db.reviewLogs.count()).toBe(3);
  });
});
