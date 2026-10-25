import type { NenrinDB } from '../db';
import { deckSubtreeIds } from '../db/decks';
import { fieldToAnkiHtml } from '../render';

/** Quotes a field when it contains the separator, a quote or a line break (RFC 4180). */
function quote(value: string): string {
  return /[\t"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Exports notes as Anki "Notes in Plain Text": tab-separated, HTML fields, with file headers
 * so Anki (2.1.54+) and Nenrin re-import them into the right note type and deck, and update
 * in place via the GUID column. Pass a deck id to export that deck and its sub-decks.
 */
export async function exportNotesText(db: NenrinDB, deckId?: string): Promise<string> {
  const decks = await db.decks.toArray();
  const byId = new Map(decks.map((d) => [d.id, d]));
  const ankiPath = (id: string): string => {
    const parts: string[] = [];
    for (let d = byId.get(id); d; d = d.parentId ? byId.get(d.parentId) : undefined) {
      parts.unshift(d.name);
    }
    return parts.join('::');
  };
  const deckIds = deckId ? new Set(await deckSubtreeIds(db, deckId)) : undefined;
  const cards = await db.cards.toArray();
  const noteDeck = new Map<string, string>();
  for (const c of cards.sort((a, b) => a.ordinal - b.ordinal)) {
    if (!noteDeck.has(c.noteId) && (!deckIds || deckIds.has(c.deckId))) {
      noteDeck.set(c.noteId, c.deckId);
    }
  }
  const types = new Map((await db.noteTypes.toArray()).map((t) => [t.id, t]));
  const notes = (await db.notes.bulkGet([...noteDeck.keys()]))
    .filter((n) => !!n)
    .sort((a, b) => a.createdAt - b.createdAt);
  const maxFields = Math.max(0, ...notes.map((n) => types.get(n.noteTypeId)?.fields.length ?? 0));

  const lines = [
    '#separator:tab',
    '#html:true',
    '#guid column:1',
    '#notetype column:2',
    '#deck column:3',
    `#tags column:${4 + maxFields}`,
  ];
  for (const note of notes) {
    const type = types.get(note.noteTypeId);
    if (!type) continue;
    const fields = type.fields.map((f) => fieldToAnkiHtml(note.fields[f] ?? '', note.format));
    const padded = [...fields, ...Array(maxFields - fields.length).fill('')];
    const row = [
      note.ankiGuid ?? note.id,
      type.name,
      ankiPath(noteDeck.get(note.id)!),
      ...padded,
      note.tags.join(' '),
    ];
    lines.push(row.map(quote).join('\t'));
  }
  return lines.join('\n') + '\n';
}

export function textExportFilename(name = 'nenrin', now = new Date()): string {
  const slug = name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'notes';
  return `${slug}-${now.toISOString().slice(0, 10)}.txt`;
}
