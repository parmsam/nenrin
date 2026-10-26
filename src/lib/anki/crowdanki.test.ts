import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NenrinDB } from '../db';
import { ensureBuiltins } from '../notes';
import { convertCrowdAnki, readCrowdAnki } from './crowdanki';
import { InvalidPackageError } from './errors';
import { importAnkiPackage } from './import';

const T0 = new Date(2026, 0, 10, 12).getTime();

/** A small deck in CrowdAnki's shape, written for these tests. */
const deck = {
  __type__: 'Deck',
  name: 'Geo',
  crowdanki_uuid: 'deck-1',
  media_files: ['flag.svg'],
  note_models: [
    {
      __type__: 'NoteModel',
      crowdanki_uuid: 'model-basic',
      name: 'Country',
      type: 0,
      css: '.card { color: navy; }',
      flds: [
        { name: 'Country', ord: 0 },
        { name: 'Capital', ord: 1 },
        { name: 'Flag', ord: 2 },
      ],
      tmpls: [
        {
          name: 'Capital',
          ord: 0,
          qfmt: '{{Country}}',
          afmt: '{{FrontSide}}<hr id=answer>{{Capital}}',
        },
        { name: 'Flag', ord: 1, qfmt: '{{#Flag}}{{Flag}}{{/Flag}}', afmt: '{{Country}}' },
      ],
    },
    {
      crowdanki_uuid: 'model-cloze',
      name: 'Cloze',
      type: 1,
      flds: [
        { name: 'Text', ord: 0 },
        { name: 'Extra', ord: 1 },
      ],
      tmpls: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' }],
    },
  ],
  notes: [
    {
      guid: 'g-fr',
      note_model_uuid: 'model-basic',
      fields: ['France', 'Paris', '<img src="flag.svg">'],
      tags: ['europe'],
    },
    { guid: 'g-jp', note_model_uuid: 'model-basic', fields: ['Japan', 'Tokyo', ''], tags: [] },
  ],
  children: [
    {
      name: 'Rivers',
      notes: [
        {
          guid: 'g-nile',
          note_model_uuid: 'model-cloze',
          fields: ['The {{c1::Nile}} flows into the {{c2::Mediterranean}}.', ''],
          tags: ['africa'],
        },
      ],
      children: [],
    },
  ],
};

let db: NenrinDB;
beforeEach(async () => {
  db = new NenrinDB(`test-${crypto.randomUUID()}`);
  await ensureBuiltins(db);
});
afterEach(async () => {
  await db.delete();
});

describe('CrowdAnki', () => {
  it('converts note models, sub-decks, notes and the cards Anki would make', () => {
    const pkg = convertCrowdAnki(deck, [], T0);
    expect(pkg.noteTypes.map((t) => [t.name, t.kind, t.fields.length])).toEqual([
      ['Country', 'basic', 3],
      ['Cloze', 'cloze', 2],
    ]);
    expect(pkg.decks.map((d) => d.path)).toEqual([['Geo'], ['Geo', 'Rivers']]);
    // France: capital + flag cards; Japan has no flag, so one card; the Nile: two clozes.
    expect(pkg.cards.map((c) => c.ord)).toEqual([0, 1, 0, 0, 1]);
    expect(pkg.notes.map((n) => n.guid)).toEqual(['g-fr', 'g-jp', 'g-nile']);
    // Note type ids are stable across imports.
    expect(convertCrowdAnki(deck, [], T0 + 5).noteTypes[0].id).toBe(pkg.noteTypes[0].id);
  });

  it('reads a zipped folder with media, and a bare deck.json', () => {
    const zip = zipSync({
      Geo: {
        'deck.json': strToU8(JSON.stringify(deck)),
        media: { 'flag.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>') },
      },
    });
    const pkg = readCrowdAnki(zip, T0);
    expect(pkg.media.map((m) => m.name)).toEqual(['flag.svg']);
    expect(pkg.notes).toHaveLength(3);

    const bare = readCrowdAnki(strToU8(`\uFEFF  ${JSON.stringify(deck)}`), T0);
    expect(bare.media).toEqual([]);
    expect(bare.notes).toHaveLength(3);
  });

  it('rejects files that aren’t CrowdAnki decks', () => {
    expect(() => readCrowdAnki(strToU8('not a zip'), T0)).toThrow(InvalidPackageError);
    expect(() => readCrowdAnki(zipSync({ 'x.txt': strToU8('hi') }), T0)).toThrow(
      InvalidPackageError,
    );
    expect(() => readCrowdAnki(strToU8('{"hello": 1}'), T0)).toThrow(InvalidPackageError);
  });

  it('imports as new cards, and re-imports update notes instead of duplicating', async () => {
    const result = await importAnkiPackage(db, convertCrowdAnki(deck, [], T0), {
      scheduling: false,
    });
    expect(result).toMatchObject({ notesAdded: 3, cardsAdded: 5 });
    expect(result.decks.sort()).toEqual(['Geo', 'Geo / Rivers']);

    const edited = structuredClone(deck);
    edited.notes[1].fields[2] = '<img src="jp.svg">'; // Japan gains a flag: one more card.
    const again = await importAnkiPackage(db, convertCrowdAnki(edited, [], T0 + 60_000), {
      scheduling: false,
    });
    expect(again).toMatchObject({ notesAdded: 0, notesUpdated: 3, cardsAdded: 1 });
    expect(await db.notes.count()).toBe(3);
  });
});
