/**
 * Writes an Anki package (.apkg) from plain data. Pure: no IndexedDB, no DOM, so it runs in a
 * Web Worker and in Node tests. The caller (../export/apkg.ts) has already mapped Nenrin's data
 * to Anki's numbers; this only lays it out.
 *
 * We write the legacy layout, which every Anki since 2.1 imports:
 *   collection.anki21   SQLite, schema 11 (note types, decks and options as JSON in `col`)
 *   media               JSON {"0": "name.jpg", …}
 *   0, 1, 2…            the media files, named by index
 * The schema below follows Anki's documented file format; nothing is copied from Anki's code.
 */
import { zipSync } from 'fflate';
import type { SqlJsStatic } from 'sql.js';
import type { AnkiNote, AnkiNoteType } from './package';

export interface ApkgDeck {
  id: number;
  /** Path segments, e.g. ["Japanese", "Vocab"]. */
  path: string[];
}

export interface ApkgNote extends AnkiNote {
  /** Sort field: the first field without HTML. */
  sfld: string;
  /** First 8 hex digits of the SHA-1 of sfld, as a number (Anki's duplicate check). */
  csum: number;
}

export interface ApkgCard {
  id: number;
  nid: number;
  did: number;
  ord: number;
  /** 0 new, 1 learning, 2 review, 3 relearning. */
  type: number;
  /** -3 buried, -1 suspended, 0 new, 1 learning (due in seconds), 2 review, 3 day-learning. */
  queue: number;
  /** New: position. Learning (queue 1): epoch seconds. Review/day-learning: days since crt. */
  due: number;
  ivl: number;
  /** Ease in permille (2500 = 250%); 0 for new cards. */
  factor: number;
  reps: number;
  lapses: number;
  /** Learning steps left today. */
  left: number;
  /** FSRS memory: stability, difficulty, desired retention, last review (seconds). */
  memory?: { s: number; d: number; dr?: number; lrt?: number };
}

export interface ApkgRevlog {
  /** Review time, ms since epoch; unique. */
  id: number;
  cid: number;
  ease: number;
  /** Days if positive, seconds if negative. */
  ivl: number;
  lastIvl: number;
  factor: number;
  /** Answer time in ms. */
  time: number;
  /** 0 learn, 1 review, 2 relearn. */
  type: number;
}

export interface ApkgInput {
  /** Collection creation: the start of a study day, in seconds. Review due days count from it. */
  crt: number;
  /** Modification time for everything written, ms. */
  now: number;
  noteTypes: AnkiNoteType[];
  decks: ApkgDeck[];
  notes: ApkgNote[];
  cards: ApkgCard[];
  revlog: ApkgRevlog[];
  media: { name: string; data: Uint8Array }[];
}

const SCHEMA = `
CREATE TABLE col (
  id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL, scm integer NOT NULL,
  ver integer NOT NULL, dty integer NOT NULL, usn integer NOT NULL, ls integer NOT NULL,
  conf text NOT NULL, models text NOT NULL, decks text NOT NULL, dconf text NOT NULL,
  tags text NOT NULL
);
CREATE TABLE notes (
  id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL, mod integer NOT NULL,
  usn integer NOT NULL, tags text NOT NULL, flds text NOT NULL, sfld text NOT NULL,
  csum integer NOT NULL, flags integer NOT NULL, data text NOT NULL
);
CREATE TABLE cards (
  id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL, ord integer NOT NULL,
  mod integer NOT NULL, usn integer NOT NULL, type integer NOT NULL, queue integer NOT NULL,
  due integer NOT NULL, ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL,
  lapses integer NOT NULL, left integer NOT NULL, odue integer NOT NULL, odid integer NOT NULL,
  flags integer NOT NULL, data text NOT NULL
);
CREATE TABLE revlog (
  id integer PRIMARY KEY, cid integer NOT NULL, usn integer NOT NULL, ease integer NOT NULL,
  ivl integer NOT NULL, lastIvl integer NOT NULL, factor integer NOT NULL, time integer NOT NULL,
  type integer NOT NULL
);
CREATE TABLE graves (usn integer NOT NULL, oid integer NOT NULL, type integer NOT NULL);
CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_cards_usn ON cards (usn);
CREATE INDEX ix_revlog_usn ON revlog (usn);
CREATE INDEX ix_cards_nid ON cards (nid);
CREATE INDEX ix_cards_sched ON cards (did, queue, due);
CREATE INDEX ix_revlog_cid ON revlog (cid);
CREATE INDEX ix_notes_csum ON notes (csum);
`;

const DEFAULT_CSS = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
`;

/** Anki's usual look for cloze deletions, for cloze types that bring no CSS. */
const CLOZE_CSS = `
.cloze {
  font-weight: bold;
  color: blue;
}
.nightMode .cloze {
  color: lightblue;
}
`;

function modelJson(t: AnkiNoteType, mod: number) {
  return {
    id: t.id,
    name: t.name,
    type: t.kind === 'cloze' ? 1 : 0,
    mod,
    usn: -1,
    sortf: 0,
    did: null,
    tmpls: t.templates.map((tpl, ord) => ({
      name: tpl.name,
      ord,
      qfmt: tpl.qfmt,
      afmt: tpl.afmt,
      bqfmt: '',
      bafmt: '',
      did: null,
      bfont: '',
      bsize: 0,
    })),
    flds: t.fields.map((name, ord) => ({
      name,
      ord,
      sticky: false,
      rtl: false,
      font: 'Arial',
      size: 20,
      description: '',
    })),
    css: t.css || DEFAULT_CSS + (t.kind === 'cloze' ? CLOZE_CSS : ''),
    latexPre:
      '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexPost: '\\end{document}',
    latexsvg: false,
    req: t.kind === 'cloze' ? [[0, 'any', [0]]] : t.templates.map((_, ord) => [ord, 'any', [0]]),
    tags: [],
    vers: [],
  };
}

function deckJson(id: number, name: string, mod: number) {
  return {
    id,
    name,
    mod,
    usn: -1,
    lrnToday: [0, 0],
    revToday: [0, 0],
    newToday: [0, 0],
    timeToday: [0, 0],
    collapsed: false,
    browserCollapsed: false,
    desc: '',
    dyn: 0,
    conf: 1,
    extendNew: 0,
    extendRev: 0,
  };
}

const DECK_CONF = {
  id: 1,
  name: 'Default',
  mod: 0,
  usn: 0,
  maxTaken: 60,
  autoplay: true,
  timer: 0,
  replayq: true,
  dyn: false,
  new: {
    bury: false,
    delays: [1, 10],
    initialFactor: 2500,
    ints: [1, 4, 0],
    order: 1,
    perDay: 20,
  },
  lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
  rev: { perDay: 200, ease4: 1.3, maxIvl: 36500, hardFactor: 1.2, bury: false },
};

/** Builds the .apkg bytes. */
export function writeAnkiPackage(input: ApkgInput, SQL: SqlJsStatic): Uint8Array {
  const modSecs = Math.floor(input.now / 1000);
  const db = new SQL.Database();
  try {
    db.run(SCHEMA);
    const models = Object.fromEntries(
      input.noteTypes.map((t) => [String(t.id), modelJson(t, modSecs)]),
    );
    // Anki expects deck 1 ("Default") to exist.
    const decks: Record<string, ReturnType<typeof deckJson>> = {
      '1': deckJson(1, 'Default', modSecs),
    };
    for (const d of input.decks) decks[String(d.id)] = deckJson(d.id, d.path.join('::'), modSecs);
    const conf = {
      activeDecks: [1],
      curDeck: input.decks[0]?.id ?? 1,
      curModel: input.noteTypes[0]?.id ?? null,
      nextPos: input.cards.filter((c) => c.type === 0).length + 1,
      schedVer: 2,
      sortType: 'noteFld',
      sortBackwards: false,
      addToCur: true,
      newSpread: 0,
      dueCounts: true,
      estTimes: true,
      collapseTime: 1200,
      timeLim: 0,
    };
    db.run('INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)', [
      input.crt,
      input.now,
      input.now,
      JSON.stringify(conf),
      JSON.stringify(models),
      JSON.stringify(decks),
      JSON.stringify({ '1': DECK_CONF }),
      '{}',
    ]);

    const note = db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, ?)');
    for (const n of input.notes) {
      // Tags are space-separated with a space at each end.
      const tags = n.tags.length ? ` ${n.tags.join(' ')} ` : '';
      note.run([n.id, n.guid, n.mid, n.mod, tags, n.fields.join('\x1f'), n.sfld, n.csum, '']);
    }
    note.free();

    const card = db.prepare(
      'INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)',
    );
    for (const c of input.cards) {
      card.run([
        c.id,
        c.nid,
        c.did,
        c.ord,
        modSecs,
        c.type,
        c.queue,
        c.due,
        c.ivl,
        c.factor,
        c.reps,
        c.lapses,
        c.left,
        c.memory ? JSON.stringify(c.memory) : '',
      ]);
    }
    card.free();

    const rev = db.prepare('INSERT INTO revlog VALUES (?, ?, -1, ?, ?, ?, ?, ?, ?)');
    for (const r of input.revlog) {
      rev.run([r.id, r.cid, r.ease, r.ivl, r.lastIvl, r.factor, r.time, r.type]);
    }
    rev.free();

    const files: Record<string, Uint8Array> = { 'collection.anki21': db.export() };
    const manifest: Record<string, string> = {};
    input.media.forEach((m, i) => {
      manifest[String(i)] = m.name;
      files[String(i)] = m.data;
    });
    files['media'] = new TextEncoder().encode(JSON.stringify(manifest));
    return zipSync(files);
  } finally {
    db.close();
  }
}
