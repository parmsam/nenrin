import { newId, type NenrinDB } from '.';
import { DEFAULT_DECK_CONFIG, type Deck, type DeckConfig } from './types';

export interface DeckNode extends Deck {
  depth: number;
  /** Full path, e.g. "Japanese / Vocab". */
  path: string;
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Deck name can’t be empty.');
  return trimmed;
}

export async function createDeck(
  db: NenrinDB,
  name: string,
  parentId?: string,
  now = Date.now(),
): Promise<Deck> {
  const parent = parentId ? await db.decks.get(parentId) : undefined;
  const deck: Deck = {
    id: newId(),
    name: cleanName(name),
    parentId: parent?.id,
    // Sub-decks start with their parent's settings.
    config: { ...(parent?.config ?? DEFAULT_DECK_CONFIG) },
    createdAt: now,
  };
  await db.decks.add(deck);
  return deck;
}

export async function renameDeck(db: NenrinDB, id: string, name: string): Promise<void> {
  await db.decks.update(id, { name: cleanName(name) });
}

export async function updateDeckConfig(
  db: NenrinDB,
  id: string,
  config: Partial<DeckConfig>,
): Promise<void> {
  const deck = await db.decks.get(id);
  if (!deck) throw new Error(`Deck ${id} not found`);
  await db.decks.update(id, { config: { ...deck.config, ...config } });
}

/** The deck and all of its descendants. */
export async function deckSubtreeIds(db: NenrinDB, id: string): Promise<string[]> {
  const all = await db.decks.toArray();
  const children = new Map<string, string[]>();
  for (const d of all) {
    if (d.parentId) children.set(d.parentId, [...(children.get(d.parentId) ?? []), d.id]);
  }
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    stack.push(...(children.get(cur) ?? []));
  }
  return out;
}

/** Deletes a deck, its sub-decks, their cards and review history, and notes left without cards. */
export async function deleteDeck(db: NenrinDB, id: string): Promise<void> {
  await db.transaction('rw', db.decks, db.cards, db.notes, db.reviewLogs, async () => {
    const deckIds = await deckSubtreeIds(db, id);
    const cards = await db.cards.where('deckId').anyOf(deckIds).toArray();
    const cardIds = cards.map((c) => c.id);
    const noteIds = [...new Set(cards.map((c) => c.noteId))];
    await db.reviewLogs.where('cardId').anyOf(cardIds).delete();
    await db.cards.bulkDelete(cardIds);
    for (const noteId of noteIds) {
      if ((await db.cards.where('noteId').equals(noteId).count()) === 0) {
        await db.notes.delete(noteId);
      }
    }
    await db.decks.bulkDelete(deckIds);
  });
}

/** All decks, depth-first, alphabetical within each level. */
export function deckTree(decks: Deck[]): DeckNode[] {
  const byParent = new Map<string | undefined, Deck[]>();
  const ids = new Set(decks.map((d) => d.id));
  for (const d of decks) {
    // Orphans (parent deleted elsewhere) show at the top level rather than vanishing.
    const key = d.parentId && ids.has(d.parentId) ? d.parentId : undefined;
    byParent.set(key, [...(byParent.get(key) ?? []), d]);
  }
  const out: DeckNode[] = [];
  const walk = (parentId: string | undefined, depth: number, prefix: string) => {
    const kids = (byParent.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    for (const d of kids) {
      const path = prefix ? `${prefix} / ${d.name}` : d.name;
      out.push({ ...d, depth, path });
      walk(d.id, depth + 1, path);
    }
  };
  walk(undefined, 0, '');
  return out;
}
