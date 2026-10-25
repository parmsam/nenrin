import type { ReviewOutcome, SchedulingState } from '../scheduler';

export interface DeckConfig {
  newPerDay: number;
  reviewsPerDay: number;
  desiredRetention: number;
  /** Personal FSRS weights from the optimizer, if trained. */
  fsrsParams?: number[];
  /** When fsrsParams were computed, and from how many reviews. */
  fsrsOptimizedAt?: number;
  fsrsOptimizedReviews?: number;
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
  /** Field markup. Notes made in Nenrin are Markdown; Anki imports are HTML. Default: markdown. */
  format?: 'markdown' | 'html';
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
  /** Which device recorded it (see docs/storage-strategy.md). Missing on very early logs. */
  deviceId?: string;
}

export interface Media {
  filename: string;
  blob: Blob;
  mime: string;
  sha1: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface Prefs {
  /** Local hour at which a new study day starts (Anki default: 4 AM). */
  rolloverHour: number;
  /** Play a card's audio when it's shown (question) and when the answer is revealed. */
  autoplayAudio: boolean;
  /** Apply each note type's own CSS (e.g. from imported Anki decks), safely scoped. */
  deckStyling: boolean;
}

export const DEFAULT_PREFS: Prefs = { rolloverHour: 4, autoplayAudio: true, deckStyling: true };

export const DEFAULT_DECK_CONFIG: DeckConfig = {
  newPerDay: 20,
  reviewsPerDay: 200,
  desiredRetention: 0.9,
};
