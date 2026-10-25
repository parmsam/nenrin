import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NenrinDB } from '../db';
import { createDeck, deckTree } from '../db/decks';
import { exportNotesText } from '../export/text';
import { addNote, BASIC, ensureBuiltins } from '../notes';
import { defaultMapping, importTextFile, type TextImportOptions } from './apply';
import { parseDelimited, parseTextFile, sniffSeparator } from './text';

describe('parsing', () => {
  it('follows the examples in the Anki manual', () => {
    expect(parseTextFile('apple;banana;grape\nfirst field;second field;third field').rows).toEqual([
      ['apple', 'banana', 'grape'],
      ['first field', 'second field', 'third field'],
    ]);
    const quoted = parseTextFile(
      'hello;"this is\na two line answer"\ntwo;this is a one line field\n"this includes a ; (semicolon)";another field',
    );
    expect(quoted.rows).toEqual([
      ['hello', 'this is\na two line answer'],
      ['two', 'this is a one line field'],
      ['this includes a ; (semicolon)', 'another field'],
    ]);
    expect(parseDelimited('field one;"field two with ""escaped quotes"" inside it"', ';')).toEqual([
      ['field one', 'field two with "escaped quotes" inside it'],
    ]);
  });

  it('skips top comments, strips a BOM, and handles CRLF', () => {
    const f = parseTextFile(
      '\uFEFF# this is a comment and is ignored\r\nfoo bar;bar baz\r\nf1;f2\r\n',
    );
    expect(f.rows).toEqual([
      ['foo bar', 'bar baz'],
      ['f1', 'f2'],
    ]);
  });

  it('keeps # lines after the data starts', () => {
    expect(parseTextFile('q\ta\n# heading\tb').rows).toEqual([
      ['q', 'a'],
      ['# heading', 'b'],
    ]);
  });

  it('sniffs the separator, ignoring quoted text', () => {
    expect(sniffSeparator('a\tb\tc')).toBe('\t');
    expect(sniffSeparator('"a, b, c";d')).toBe(';');
    expect(sniffSeparator('a,b')).toBe(',');
    expect(sniffSeparator('just one column')).toBe('\t');
  });

  it('reads all file headers', () => {
    const f = parseTextFile(
      [
        '#separator:Pipe',
        '#html:true',
        '#tags:vocab n5',
        '#columns:Front|Back|Deck|Tags|Type|Id',
        '#notetype:Basic',
        '#deck:Japanese',
        '#deck column:3',
        '#tags column:4',
        '#notetype column:5',
        '#guid column:6',
        'a|b|D|t|Basic|g1',
      ].join('\n'),
    );
    expect(f.separator).toBe('|');
    expect(f.headers).toEqual({
      separator: '|',
      html: true,
      tags: ['vocab', 'n5'],
      columns: ['Front', 'Back', 'Deck', 'Tags', 'Type', 'Id'],
      notetype: 'Basic',
      deck: 'Japanese',
      deckColumn: 3,
      tagsColumn: 4,
      notetypeColumn: 5,
      guidColumn: 6,
    });
    expect(f.columnCount).toBe(6);
  });

  it('pads short rows and cuts long ones to the first row’s width', () => {
    expect(parseTextFile('a,b,c\nd\ne,f,g,h').rows).toEqual([
      ['a', 'b', 'c'],
      ['d', '', ''],
      ['e', 'f', 'g'],
    ]);
  });
});

describe('importing', () => {
  let db: NenrinDB;
  let deckId: string;

  beforeEach(async () => {
    db = new NenrinDB(`test-${crypto.randomUUID()}`);
    await ensureBuiltins(db);
    deckId = (await createDeck(db, 'Main')).id;
  });

  afterEach(async () => {
    await db.delete();
  });

  const run = (text: string, opts: Partial<TextImportOptions> = {}) => {
    const file = parseTextFile(text);
    return importTextFile(db, file, {
      noteTypeId: 'basic',
      deckId,
      mapping: defaultMapping(file, BASIC),
      html: file.headers.html ?? false,
      duplicates: 'update',
      tags: [],
      ...opts,
    });
  };

  it('adds notes, escaping plain text as HTML', async () => {
    const result = await run('2 < 3\tyes\nline\t"multi\nline"');
    expect(result).toEqual({ added: 2, updated: 0, skipped: 0, errors: [] });
    const notes = (await db.notes.toArray()).sort((a, b) => a.createdAt - b.createdAt);
    expect(notes.map((n) => n.fields)).toEqual([
      { Front: '2 &lt; 3', Back: 'yes' },
      { Front: 'line', Back: 'multi<br>line' },
    ]);
    expect(notes[0].format).toBe('html');
  });

  it('updates, skips or duplicates notes with the same first field', async () => {
    await run('q\ta1');
    expect(await run('q\ta2', { duplicates: 'skip' })).toMatchObject({ skipped: 1 });
    expect(await run('q\ta3')).toMatchObject({ updated: 1 });
    expect((await db.notes.toArray()).map((n) => n.fields.Back)).toEqual(['a3']);
    expect(await run('q\ta4', { duplicates: 'duplicate' })).toMatchObject({ added: 1 });
    expect(await db.notes.count()).toBe(2);
  });

  it('uses deck, tags, note type and GUID columns, creating nested decks', async () => {
    const text = [
      '#separator:tab',
      '#html:true',
      '#tags:imported',
      '#guid column:1',
      '#notetype column:2',
      '#deck column:3',
      '#tags column:6',
      'g1\tBasic (and reversed card)\tLang::Japanese\t<b>犬</b>\tdog\tn5 animals',
      'g2\tCloze\tLang\t{{c1::Tokyo}} is the capital\t\tgeo',
    ].join('\n');
    expect(await run(text)).toMatchObject({ added: 2, errors: [] });

    const tree = deckTree(await db.decks.toArray());
    expect(tree.map((d) => d.path)).toEqual(['Lang', 'Lang / Japanese', 'Main']);
    const dog = (await db.notes.where('ankiGuid').equals('g1').first())!;
    expect(dog.noteTypeId).toBe('basic-reversed');
    expect(dog.fields).toEqual({ Front: '<b>犬</b>', Back: 'dog' });
    expect(dog.tags).toEqual(['imported', 'n5', 'animals']);
    expect(await db.cards.where('noteId').equals(dog.id).count()).toBe(2);
    const cloze = (await db.notes.where('ankiGuid').equals('g2').first())!;
    expect(cloze.noteTypeId).toBe('cloze');

    // Same GUID again updates in place.
    expect(await run(text.replace('dog', 'hound'))).toMatchObject({ updated: 2, added: 0 });
    expect((await db.notes.where('ankiGuid').equals('g1').first())!.fields.Back).toBe('hound');
  });

  it('reports rows that would make no cards and keeps going', async () => {
    const result = await run('\tno front\nok\tfine');
    expect(result.added).toBe(1);
    expect(result.errors).toEqual([{ row: 1, message: expect.stringMatching(/no cards/) }]);
  });

  it('round-trips through its own text export without duplicating', async () => {
    const child = await createDeck(db, 'Sub', deckId);
    await addNote(db, {
      noteTypeId: 'basic',
      deckId: child.id,
      fields: { Front: '**bold** and $x^2$', Back: 'tab\there "quoted"' },
      tags: ['t1'],
    });
    const text = await exportNotesText(db);
    expect(text).toContain('#tags column:6');
    expect(text).toContain('Main::Sub');
    expect(text).toContain('<strong>bold</strong> and \\(x^2\\)');

    const file = parseTextFile(text);
    const result = await importTextFile(db, file, {
      noteTypeId: 'basic',
      deckId,
      mapping: defaultMapping(file, BASIC),
      html: true,
      duplicates: 'update',
      tags: [],
    });
    expect(result).toMatchObject({ added: 0, updated: 1, errors: [] });
    expect(await db.notes.count()).toBe(1);
    // Markdown became HTML on the way out; the text is the same, with quotes entity-escaped.
    expect((await db.notes.toArray())[0].fields.Back).toBe('tab\there &quot;quoted&quot;');
  });
});
