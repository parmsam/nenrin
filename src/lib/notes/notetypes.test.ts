import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NenrinDB } from '../db';
import { createDeck } from '../db/decks';
import { recordReview } from '../db/repo';
import { isImageOcclusion } from '../render/occlusion';
import { Rating } from '../scheduler';
import { addNote, ensureBuiltins } from '.';
import {
  cloneNoteType,
  copyName,
  deleteNoteType,
  draftFrom,
  draftProblem,
  previewNoteTypeChange,
  renameFieldRefs,
  saveNoteType,
} from './notetypes';

let db: NenrinDB;
let deckId: string;

beforeEach(async () => {
  db = new NenrinDB(`test-${crypto.randomUUID()}`);
  await ensureBuiltins(db);
  deckId = (await createDeck(db, 'D')).id;
});
afterEach(async () => {
  await db.delete();
});

const cardsOf = async (noteId: string) =>
  (await db.cards.where('noteId').equals(noteId).toArray()).sort((a, b) => a.ordinal - b.ordinal);

describe('note type editor', () => {
  it('renames field references in templates, filters and sections included', () => {
    const t = '{{Front}} {{#Front}}x{{/Front}} {{^Front}}y{{/Front}} {{text:Front}} {{Fronts}}';
    expect(renameFieldRefs(t, 'Front', 'Question')).toBe(
      '{{Question}} {{#Question}}x{{/Question}} {{^Question}}y{{/Question}} {{text:Question}} {{Fronts}}',
    );
  });

  it('checks drafts', async () => {
    const basic = (await db.noteTypes.get('basic'))!;
    const draft = draftFrom(basic);
    expect(draftProblem(basic, draft)).toBeNull();
    expect(draftProblem(basic, { ...draft, fields: [...draft.fields, { name: 'Front' }] })).toMatch(
      /Two fields/,
    );
    expect(draftProblem(basic, { ...draft, fields: [{ name: 'Tags' }] })).toMatch(/special name/);
    expect(draftProblem(basic, { ...draft, fields: [{ name: 'a:b' }] })).toMatch(/can’t contain/);
    expect(draftProblem(basic, { ...draft, templates: [] })).toMatch(/at least one card type/);
    const cloze = (await db.noteTypes.get('cloze'))!;
    const c = draftFrom(cloze);
    expect(draftProblem(cloze, { ...c, templates: [...c.templates, c.templates[0]] })).toMatch(
      /exactly one/,
    );
  });

  it('clones, and keeps built-ins read-only', async () => {
    const copy = await cloneNoteType(db, 'basic', 'My basic');
    expect(copy).toMatchObject({ name: 'My basic', fields: ['Front', 'Back'] });
    expect(copy.id).not.toBe('basic');
    await expect(saveNoteType(db, 'basic', draftFrom(copy))).rejects.toThrow(/Clone it first/);
    const io = await cloneNoteType(db, 'image-occlusion', 'Maps');
    expect(isImageOcclusion(io)).toBe(true);
    expect(copyName('Basic', ['Basic copy'])).toBe('Basic copy 2');
  });

  it('renames, adds and reorders fields, carrying note contents along', async () => {
    const type = await cloneNoteType(db, 'basic', 'Vocab');
    const note = await addNote(db, {
      noteTypeId: type.id,
      deckId,
      fields: { Front: 'ki', Back: 'tree' },
    });
    const draft = draftFrom(type);
    draft.fields = [
      { from: 'Back', name: 'Meaning' },
      { from: 'Front', name: 'Word' },
      { name: 'Notes' },
    ];
    draft.templates[0].front = renameFieldRefs(draft.templates[0].front, 'Front', 'Word');
    draft.templates[0].back = renameFieldRefs(
      renameFieldRefs(draft.templates[0].back, 'Front', 'Word'),
      'Back',
      'Meaning',
    );
    const change = await saveNoteType(db, type.id, draft);
    expect(change).toMatchObject({ notes: 1, addedCards: 0, removedCards: 0, lostFields: [] });
    expect((await db.noteTypes.get(type.id))!.fields).toEqual(['Meaning', 'Word', 'Notes']);
    expect((await db.notes.get(note.id))!.fields).toEqual({
      Meaning: 'tree',
      Word: 'ki',
      Notes: '',
    });
    expect((await db.noteTypes.get(type.id))!.templates[0].front).toBe('{{Word}}');
  });

  it('adds cards for a new card type, and keeps history when card types are reordered', async () => {
    const type = await cloneNoteType(db, 'basic', 'Two way');
    const note = await addNote(db, {
      noteTypeId: type.id,
      deckId,
      fields: { Front: 'ki', Back: 'tree' },
    });
    const [first] = await cardsOf(note.id);
    await recordReview(db, first.id, Rating.Good);

    const draft = draftFrom(type);
    draft.templates = [
      { name: 'Reverse', front: '{{Back}}', back: '{{FrontSide}}<hr id="answer">{{Front}}' },
      ...draft.templates,
    ];
    expect(await previewNoteTypeChange(db, type.id, draft)).toMatchObject({
      addedCards: 1,
      removedCards: 0,
    });
    await saveNoteType(db, type.id, draft);
    const cards = await cardsOf(note.id);
    expect(cards.map((c) => c.ordinal)).toEqual([0, 1]);
    // The reviewed card moved to its template's new position, history and all.
    expect(cards[1].id).toBe(first.id);
    expect(cards[1].reps).toBe(1);
  });

  it('reports what removing a card type or a field would lose, then removes it', async () => {
    const type = await cloneNoteType(db, 'basic-reversed', 'Rev');
    const note = await addNote(db, {
      noteTypeId: type.id,
      deckId,
      fields: { Front: 'ki', Back: 'tree' },
    });
    const reverse = (await cardsOf(note.id))[1];
    await recordReview(db, reverse.id, Rating.Again);

    const draft = draftFrom(type);
    draft.templates = [draft.templates[0]];
    draft.fields = [...draft.fields, { name: 'Extra' }];
    const change = await previewNoteTypeChange(db, type.id, draft);
    expect(change).toMatchObject({ removedCards: 1, removedReviews: 1, lostFields: [] });
    await saveNoteType(db, type.id, draft);
    expect((await cardsOf(note.id)).map((c) => c.id)).not.toContain(reverse.id);
    expect(await db.reviewLogs.where('cardId').equals(reverse.id).count()).toBe(0);

    const drop = draftFrom((await db.noteTypes.get(type.id))!);
    drop.fields = drop.fields.filter((f) => f.name !== 'Back');
    drop.templates[0].back = '{{FrontSide}}';
    expect((await previewNoteTypeChange(db, type.id, drop)).lostFields).toEqual([
      { name: 'Back', notes: 1 },
    ]);
  });

  it('deletes a note type only when no notes use it', async () => {
    const type = await cloneNoteType(db, 'basic', 'Temp');
    const note = await addNote(db, {
      noteTypeId: type.id,
      deckId,
      fields: { Front: 'a', Back: 'b' },
    });
    expect(await deleteNoteType(db, type.id)).toBe(false);
    await db.notes.delete(note.id);
    expect(await deleteNoteType(db, type.id)).toBe(true);
    expect(await deleteNoteType(db, 'basic')).toBe(false);
  });
});
