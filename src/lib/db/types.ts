import type { ReviewOutcome, SchedulingState } from '../scheduler';

export interface DeckConfig {
  newPerDay: number;
  reviewsPerDay: number;
  desiredRetention: number;
  /** Personal FSRS weights from the optimizer, if trained. */
  fsrsParams?: number[];
}

export interface Deck {
  id: string;
  name: string;
  parentId?: string;
  config: DeckConfig;
  createdAt: number;
}

export interface CardTemplate {
  name: string;
  /** Mustache-style template, e.g. `{{Front}}`; same syntax as Anki for clean imports. */
  front: string;
  back: string;
}

export interface NoteType {
  id: string;
  name: string;
  kind: 'basic' | 'cloze';
  fields: string[];
  templates: CardTemplate[];
  css: string;
}

export interface Note {
  id: string;
  noteTypeId: string;
  fields: Record<string, string>;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  /** Anki note GUID, kept so re-importing a deck updates instead of duplicating. */
  ankiGuid?: string;
}

/** One reviewable card. FSRS state is flattened in so `[deckId+due]` can be indexed. */
export interface Card extends SchedulingState {
  id: string;
  noteId: string;
  deckId: string;
  /** Which template of the note type produced this card. */
  ordinal: number;
  suspended: boolean;
  buried: boolean;
}

/** Append-only. Kept complete so FSRS parameters can be re-optimized later. */
export interface ReviewLog extends ReviewOutcome {
  id: string;
  cardId: string;
  durationMs: number;
}

export interface Media {
  filename: string;
  blob: Blob;
  mime: string;
  sha1: string;
}

export const DEFAULT_DECK_CONFIG: DeckConfig = {
  newPerDay: 20,
  reviewsPerDay: 200,
  desiredRetention: 0.9,
};
