/**
 * Reads a CrowdAnki export (the JSON format of the CrowdAnki add-on, used by shared decks
 * kept on GitHub such as Ultimate Geography) into the same AnkiPackage shape as .apkg, so
 * importAnkiPackage() handles both.
 *
 * Layout: a folder with `deck.json` and `media/`, usually zipped. deck.json is one deck tree:
 *   { name, children: [deck…], note_models: [{ crowdanki_uuid, name, type, flds, tmpls, css }],
 *     notes: [{ guid, note_model_uuid, fields: [], tags: [] }], media_files: [] }
 * Note models are listed on the root deck; each deck lists its own notes. There is no
 * scheduling: every card arrives new. Written from the format as exported, not from the
 * add-on's code.
 */
import { unzipSync } from 'fflate';
import { clozeNumbers, isEmptyFront, renderTemplate } from '../render/template';
import { InvalidPackageError } from './errors';
import type { AnkiCard, AnkiDeck, AnkiNote, AnkiNoteType, AnkiPackage } from './package';

interface CaModel {
  crowdanki_uuid?: string;
  name?: string;
  type?: number;
  css?: string;
  flds?: { name?: string; ord?: number }[];
  tmpls?: { name?: string; qfmt?: string; afmt?: string; ord?: number }[];
}

interface CaNote {
  guid?: string;
  note_model_uuid?: string;
  fields?: unknown[];
  tags?: unknown[];
}

interface CaDeck {
  name?: string;
  children?: CaDeck[];
  note_models?: CaModel[];
  notes?: CaNote[];
}

/** A stable positive integer from a string, so re-imports map to the same note type. */
function hashId(s: string): number {
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  // 21 + 31 bits: well within Number.MAX_SAFE_INTEGER.
  return ((h1 >>> 0) % 0x200000) * 0x80000000 + ((h2 >>> 0) & 0x7fffffff);
}

const byOrd = <T extends { ord?: number }>(items: T[]) =>
  [...items].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));

function convertModel(m: CaModel): AnkiNoteType {
  const uuid = m.crowdanki_uuid ?? m.name ?? 'crowdanki';
  return {
    id: hashId(`crowdanki:${uuid}`),
    name: m.name ?? 'CrowdAnki',
    kind: m.type === 1 ? 'cloze' : 'basic',
    fields: byOrd(m.flds ?? []).map((f, i) => f.name ?? `Field ${i + 1}`),
    templates: byOrd(m.tmpls ?? []).map((t, i) => ({
      name: t.name ?? `Card ${i + 1}`,
      qfmt: t.qfmt ?? '',
      afmt: t.afmt ?? '',
    })),
    css: m.css ?? '',
  };
}

/** The cards Anki would generate: non-empty fronts, or one per cloze number. */
function ordinals(type: AnkiNoteType, fields: string[]): number[] {
  if (type.kind === 'cloze') return clozeNumbers(fields.join('\n')).map((n) => n - 1);
  const named = Object.fromEntries(type.fields.map((f, i) => [f, fields[i] ?? '']));
  return type.templates.flatMap((t, i) =>
    isEmptyFront(renderTemplate(t.qfmt, named, { side: 'front' })) ? [] : [i],
  );
}

/** Converts a parsed deck.json. `now` (ms) orders notes as they appear in the file. */
export function convertCrowdAnki(
  root: CaDeck,
  media: AnkiPackage['media'] = [],
  now = Date.now(),
): AnkiPackage {
  if (!root || typeof root !== 'object' || (!root.notes && !root.children)) {
    throw new InvalidPackageError();
  }
  const models = new Map<string, AnkiNoteType>();
  const collectModels = (d: CaDeck) => {
    for (const m of d.note_models ?? []) {
      const t = convertModel(m);
      models.set(m.crowdanki_uuid ?? t.name, t);
    }
    d.children?.forEach(collectModels);
  };
  collectModels(root);

  const decks: AnkiDeck[] = [];
  const notes: AnkiNote[] = [];
  const cards: AnkiCard[] = [];
  const mod = Math.floor(now / 1000);

  const walk = (d: CaDeck, parent: string[]) => {
    // Anki names nested decks "Parent::Child"; CrowdAnki stores the full name on each.
    const path = (d.name ?? 'CrowdAnki').split('::').filter(Boolean);
    const full = path.length > 1 || parent.length === 0 ? path : [...parent, ...path];
    const deckId = decks.length + 1;
    decks.push({ id: deckId, path: full, filtered: false });
    for (const n of d.notes ?? []) {
      const type = models.get(n.note_model_uuid ?? '');
      if (!type || !n.guid) continue;
      const fields = (n.fields ?? []).map((f) => (typeof f === 'string' ? f : String(f ?? '')));
      // CrowdAnki has no note ids or times: keep the file's order as creation order.
      const id = now + notes.length;
      notes.push({
        id,
        guid: n.guid,
        mid: type.id,
        mod,
        tags: (n.tags ?? []).filter((t): t is string => typeof t === 'string'),
        fields,
      });
      for (const ord of ordinals(type, fields)) {
        cards.push({
          id: cards.length + 1,
          nid: id,
          did: deckId,
          odid: 0,
          ord,
          type: 0,
          queue: 0,
          due: 0,
          odue: 0,
          ivl: 0,
          reps: 0,
          lapses: 0,
        });
      }
    }
    for (const child of d.children ?? []) walk(child, full);
  };
  walk(root, []);

  return {
    format: 'latest',
    crt: Math.floor(now / 1000),
    noteTypes: [...new Set(models.values())],
    decks,
    notes,
    cards,
    revlog: [],
    media,
  };
}

const decoder = new TextDecoder();

/** Reads a zipped CrowdAnki folder, or a bare deck.json (then without media). */
export function readCrowdAnki(bytes: Uint8Array, now = Date.now()): AnkiPackage {
  // A bare JSON file starts with "{" (maybe after a BOM or whitespace).
  const head = decoder
    .decode(bytes.subarray(0, 64))
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (head.startsWith('{')) return convertCrowdAnki(parseJson(bytes), [], now);

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new InvalidPackageError();
  }
  // The shallowest deck.json is the deck; its folder holds media/.
  const deckPath = Object.keys(files)
    .filter((p) => /(^|\/)deck\.json$/.test(p))
    .sort((a, b) => a.split('/').length - b.split('/').length)[0];
  if (!deckPath) throw new InvalidPackageError();
  const dir = deckPath.slice(0, -'deck.json'.length);
  const media = Object.entries(files)
    .filter(([p, data]) => p.startsWith(`${dir}media/`) && !p.endsWith('/') && data.length > 0)
    .map(([p, data]) => ({ name: p.slice(`${dir}media/`.length), data }))
    .filter((m) => !m.name.includes('/'));
  return convertCrowdAnki(parseJson(files[deckPath]), media, now);
}

function parseJson(bytes: Uint8Array): CaDeck {
  try {
    return JSON.parse(decoder.decode(bytes).replace(/^\uFEFF/, ''));
  } catch {
    throw new InvalidPackageError();
  }
}

/** True for file names that look like CrowdAnki exports (.zip or deck.json). */
export const isCrowdAnkiFile = (name: string) => /\.(zip|json)$/i.test(name);
