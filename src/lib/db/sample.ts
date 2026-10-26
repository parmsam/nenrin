import { addNote, ensureBuiltins } from '../notes';
import { createDeck } from './decks';
import type { NenrinDB } from '.';

const SAMPLE: [front: string, back: string][] = [
  ['年輪 (nenrin)', 'tree rings'],
  ['木 (ki)', 'tree'],
  ['森 (mori)', 'forest'],
  ['山 (yama)', 'mountain'],
  ['木漏れ日 (komorebi)', 'sunlight filtering through leaves'],
];

type TourCard = { cloze: string } | { front: string; back: string };

/** A deck whose cards show new users around the app as they study it. */
const TOUR: TourCard[] = [
  {
    front: 'Welcome to Nenrin! How do you see the answer to a card?',
    back: 'Press **Space** (or tap **Show answer**). Then rate how well you remembered it: **Again**, **Hard**, **Good** or **Easy**. Most of the time, choose **Good**.',
  },
  {
    front: 'Which button do you press when you forgot the answer?',
    back: '**Again** (key **1**). The card comes back in a few minutes. Honest answers make the schedule work for you.',
  },
  {
    cloze:
      'Spaced repetition shows you each card just before you would {{c1::forget}} it, so reviews get {{c2::further apart}} over time, like rings on a tree.',
  },
  {
    front: 'What is the area of a circle with radius $r$?',
    back: '$$A = \\pi r^2$$\n\nCards can hold math, written in LaTeX between dollar signs.',
  },
  {
    front: 'How does a card move through Nenrin?',
    back: '```mermaid\nflowchart LR\n  New --> Learning --> Review\n  Review -- Again --> Relearning --> Review\n```\n\nCards can hold diagrams too, written in Mermaid.',
  },
  {
    front: 'How do you make your own cards?',
    back: 'Press **A** (or **Add cards**). Type a front and a back, or switch to **Paste** to turn your notes, or an LLM’s reply, into many cards at once.',
  },
  {
    front: 'Where are your cards stored?',
    back: 'Only on this device: nothing is uploaded. Export a backup in **Settings** now and then, and install Nenrin to your home screen so the browser keeps your data.',
  },
  {
    front: 'Where can you learn more?',
    back: 'Tap the **?** in the circle at the top for **Help**, or use the command palette (**⌘K** / **Ctrl+K**). Press **?** for keyboard shortcuts. Delete this deck whenever you like.',
  },
];

/** Creates the "Nenrin tour" deck. Returns its id. */
export async function createTourDeck(db: NenrinDB, now = Date.now()): Promise<string> {
  await ensureBuiltins(db);
  return db.transaction('rw', db.decks, db.noteTypes, db.notes, db.cards, async () => {
    const deck = await createDeck(db, 'Nenrin tour', undefined, now);
    for (const [i, card] of TOUR.entries()) {
      const note: { noteTypeId: string; fields: Record<string, string> } =
        'cloze' in card
          ? { noteTypeId: 'cloze', fields: { Text: card.cloze, 'Back Extra': '' } }
          : { noteTypeId: 'basic', fields: { Front: card.front, Back: card.back } };
      await addNote(db, { ...note, deckId: deck.id, tags: ['tour'] }, now + i);
    }
    return deck.id;
  });
}

/** Creates a small demo deck. Returns its id. */
export async function createSampleDeck(db: NenrinDB, now = Date.now()): Promise<string> {
  await ensureBuiltins(db);
  return db.transaction('rw', db.decks, db.noteTypes, db.notes, db.cards, async () => {
    const deck = await createDeck(db, 'Japanese: Nature', undefined, now);
    for (const [i, [Front, Back]] of SAMPLE.entries()) {
      await addNote(
        db,
        { noteTypeId: 'basic', deckId: deck.id, fields: { Front, Back }, tags: ['sample'] },
        now + i,
      );
    }
    return deck.id;
  });
}
