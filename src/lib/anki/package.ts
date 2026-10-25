/**
 * Reads Anki packages (.apkg / .colpkg) into plain data. Pure: no IndexedDB, no DOM, so it
 * runs in a Web Worker and in Node tests.
 *
 * A package is a zip containing:
 *   meta                 protobuf; field 1 = format version (1 legacy, 2 legacy v2, 3 latest)
 *   collection.anki21b   latest: zstd-compressed SQLite, schema 18 (note types/decks in tables)
 *   collection.anki21    legacy: SQLite, schema 11 (note types/decks as JSON in `col`)
 *   collection.anki2     oldest; in newer exports only a stub telling old clients to upgrade
 *   media                latest: zstd protobuf list of entries; legacy: JSON {"0": "name.jpg"}
 *   0, 1, 2…             media files, named by index (zstd-compressed in the latest format)
 */
import { decompress as zstd } from 'fzstd';
import { unzipSync } from 'fflate';
import type { Database, SqlJsStatic } from 'sql.js';
import { InvalidPackageError } from './errors';
import { decode, pbMessages, pbNumber, pbString } from './protobuf';

export interface AnkiNoteType {
  id: number;
  name: string;
  kind: 'basic' | 'cloze';
  fields: string[];
  templates: { name: string; qfmt: string; afmt: string }[];
  css: string;
}

export interface AnkiDeck {
  id: number;
  /** Path segments, e.g. ["Japanese", "Vocab"]. */
  path: string[];
  filtered: boolean;
}

export interface AnkiNote {
  id: number;
  guid: string;
  mid: number;
  /** Seconds since epoch. */
  mod: number;
  tags: string[];
  fields: string[];
}

export interface AnkiCard {
  id: number;
  nid: number;
  did: number;
  /** Original deck, when the card sits in a filtered deck (else 0). */
  odid: number;
  ord: number;
  /** 0 new, 1 learning, 2 review, 3 relearning. */
  type: number;
  /** -1 suspended, -2/-3 buried, 0 new, 1 learning, 2 review, 3 day-learning, 4 preview. */
  queue: number;
  due: number;
  odue: number;
  ivl: number;
  reps: number;
  lapses: number;
  /** FSRS memory state when the collection used FSRS: s, d, and lrt (last review, seconds). */
  memory?: { s: number; d: number; lrt?: number };
}

export interface AnkiRevlog {
  /** Review time, ms since epoch. */
  id: number;
  cid: number;
  /** 1–4; 0 for manual reschedules. */
  ease: number;
  /** Days if positive, seconds if negative. */
  ivl: number;
  /** Answer time in ms. */
  time: number;
  /** 0 learn, 1 review, 2 relearn, 3 filtered, 4 manual, 5 rescheduled. */
  type: number;
}

export interface AnkiPackage {
  format: 'legacy' | 'latest';
  /** Collection creation time (seconds); review due dates count days from this. */
  crt: number;
  noteTypes: AnkiNoteType[];
  decks: AnkiDeck[];
  notes: AnkiNote[];
  cards: AnkiCard[];
  revlog: AnkiRevlog[];
  media: { name: string; data: Uint8Array }[];
}

export { InvalidPackageError } from './errors';

type Row = Record<string, unknown>;

function rows(db: Database, sql: string): Row[] {
  const [res] = db.exec(sql);
  if (!res) return [];
  return res.values.map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]])));
}

/**
 * Anki declares some text columns with its own `unicase` collation, which SQLite (and sql.js)
 * can't load. We only do full-table reads, so drop the collation from this in-memory copy.
 */
function stripCustomCollations(db: Database): void {
  const affected = rows(db, "SELECT count(*) AS n FROM sqlite_master WHERE sql LIKE '%unicase%'");
  if (!affected[0]?.n) return;
  const version = Number(rows(db, 'PRAGMA schema_version')[0].schema_version);
  db.exec('PRAGMA writable_schema = ON');
  db.exec(
    "UPDATE sqlite_master SET sql = replace(sql, ' COLLATE unicase', '') WHERE sql LIKE '%unicase%'",
  );
  db.exec(`PRAGMA schema_version = ${version + 1}`);
  db.exec('PRAGMA writable_schema = OFF');
}

const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v == null ? '' : String(v));
const blob = (v: unknown) => (v instanceof Uint8Array ? v : new Uint8Array());

function readModernTypes(db: Database): AnkiNoteType[] {
  const fields = rows(db, 'SELECT ntid, ord, name FROM fields ORDER BY ntid, ord');
  const templates = rows(db, 'SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord');
  return rows(db, 'SELECT id, name, config FROM notetypes').map((r) => {
    const config = decode(blob(r.config));
    const id = num(r.id);
    return {
      id,
      name: str(r.name),
      // Notetype.Config: 1 = kind (0 normal, 1 cloze), 3 = css.
      kind: pbNumber(config, 1) === 1 ? 'cloze' : 'basic',
      css: pbString(config, 3),
      fields: fields.filter((f) => num(f.ntid) === id).map((f) => str(f.name)),
      templates: templates
        .filter((t) => num(t.ntid) === id)
        .map((t) => {
          // Template.Config: 1 = question format, 2 = answer format.
          const c = decode(blob(t.config));
          return { name: str(t.name), qfmt: pbString(c, 1), afmt: pbString(c, 2) };
        }),
    };
  });
}

function readModernDecks(db: Database): AnkiDeck[] {
  return rows(db, 'SELECT id, name, kind FROM decks').map((r) => ({
    id: num(r.id),
    // Deck names separate levels with \x1f in schema 18.
    path: str(r.name).split('\x1f'),
    // Deck.kind: 1 = normal, 2 = filtered.
    filtered: decode(blob(r.kind)).has(2),
  }));
}

interface LegacyModel {
  id: number;
  name: string;
  type: number;
  css?: string;
  flds: { name: string; ord: number }[];
  tmpls: { name: string; ord: number; qfmt: string; afmt: string }[];
}

function readLegacyCol(db: Database): { types: AnkiNoteType[]; decks: AnkiDeck[] } {
  const col = rows(db, 'SELECT models, decks FROM col')[0];
  const models = Object.values(JSON.parse(str(col?.models) || '{}')) as LegacyModel[];
  const decks = Object.values(JSON.parse(str(col?.decks) || '{}')) as {
    id: number;
    name: string;
    dyn: number;
  }[];
  return {
    types: models.map((m) => ({
      id: Number(m.id),
      name: m.name,
      kind: m.type === 1 ? 'cloze' : 'basic',
      css: m.css ?? '',
      fields: [...m.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name),
      templates: [...m.tmpls]
        .sort((a, b) => a.ord - b.ord)
        .map((t) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt })),
    })),
    decks: decks.map((d) => ({
      id: Number(d.id),
      path: d.name.split('::'),
      filtered: d.dyn === 1,
    })),
  };
}

function parseMemory(data: string): AnkiCard['memory'] {
  try {
    const d = JSON.parse(data || '{}');
    return typeof d.s === 'number' && typeof d.d === 'number'
      ? { s: d.s, d: d.d, lrt: typeof d.lrt === 'number' ? d.lrt : undefined }
      : undefined;
  } catch {
    return undefined;
  }
}

function readMedia(
  files: Record<string, Uint8Array>,
  latest: boolean,
): { name: string; data: Uint8Array }[] {
  const manifest = files['media'];
  if (!manifest) return [];
  if (latest) {
    // MediaEntries { repeated MediaEntry entries = 1 }; MediaEntry { name = 1; size = 2;
    // sha1 = 3; legacy_zip_filename = 255 }. Zip members are named by index.
    return pbMessages(decode(zstd(manifest)), 1).flatMap((entry, i) => {
      const member = String(entry.has(255) ? pbNumber(entry, 255) : i);
      const data = files[member];
      return data ? [{ name: pbString(entry, 1), data: zstd(data) }] : [];
    });
  }
  const map = JSON.parse(new TextDecoder().decode(manifest) || '{}') as Record<string, string>;
  return Object.entries(map).flatMap(([member, name]) =>
    files[member] ? [{ name, data: files[member] }] : [],
  );
}

export function readAnkiPackage(bytes: Uint8Array, SQL: SqlJsStatic): AnkiPackage {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new InvalidPackageError();
  }
  const metaVersion = files['meta'] ? pbNumber(decode(files['meta']), 1) : 0;
  const latest = metaVersion >= 3 && !!files['collection.anki21b'];
  const sqlite = latest
    ? zstd(files['collection.anki21b'])
    : (files['collection.anki21'] ?? files['collection.anki2']);
  if (!sqlite) throw new InvalidPackageError();

  const db = new SQL.Database(sqlite);
  try {
    stripCustomCollations(db);
    const isModern = rows(db, "SELECT name FROM sqlite_master WHERE name = 'notetypes'").length > 0;
    const { types, decks } = isModern
      ? { types: readModernTypes(db), decks: readModernDecks(db) }
      : readLegacyCol(db);
    const crt = num(rows(db, 'SELECT crt FROM col')[0]?.crt);

    const notes = rows(db, 'SELECT id, guid, mid, mod, tags, flds FROM notes').map((r) => ({
      id: num(r.id),
      guid: str(r.guid),
      mid: num(r.mid),
      mod: num(r.mod),
      tags: str(r.tags).split(/\s+/).filter(Boolean),
      fields: str(r.flds).split('\x1f'),
    }));
    const cards = rows(
      db,
      'SELECT id, nid, did, odid, ord, type, queue, due, odue, ivl, reps, lapses, data FROM cards',
    ).map((r) => ({
      id: num(r.id),
      nid: num(r.nid),
      did: num(r.did),
      odid: num(r.odid),
      ord: num(r.ord),
      type: num(r.type),
      queue: num(r.queue),
      due: num(r.due),
      odue: num(r.odue),
      ivl: num(r.ivl),
      reps: num(r.reps),
      lapses: num(r.lapses),
      memory: parseMemory(str(r.data)),
    }));
    const revlog = rows(db, 'SELECT id, cid, ease, ivl, time, type FROM revlog ORDER BY id').map(
      (r) => ({
        id: num(r.id),
        cid: num(r.cid),
        ease: num(r.ease),
        ivl: num(r.ivl),
        time: num(r.time),
        type: num(r.type),
      }),
    );
    return {
      format: latest ? 'latest' : 'legacy',
      crt,
      noteTypes: types,
      decks,
      notes,
      cards,
      revlog,
      media: readMedia(files, latest),
    };
  } finally {
    db.close();
  }
}
