import type { NenrinDB } from '.';
import { ensureBuiltins } from '../notes';
import type { Card, Deck, Note, NoteType, ReviewLog, Setting } from './types';

export interface Backup {
  app: 'nenrin';
  kind: 'backup';
  version: 1;
  exportedAt: string;
  data: {
    decks: Deck[];
    noteTypes: NoteType[];
    notes: Note[];
    cards: Card[];
    reviewLogs: ReviewLog[];
    settings: Setting[];
  };
  media: { filename: string; mime: string; sha1: string; base64: string }[];
}

const toBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (base64: string, mime: string): Blob =>
  new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: mime });

export async function createBackup(db: NenrinDB, now = new Date()): Promise<Backup> {
  return db.transaction('r', db.tables, async () => ({
    app: 'nenrin',
    kind: 'backup',
    version: 1,
    exportedAt: now.toISOString(),
    data: {
      decks: await db.decks.toArray(),
      noteTypes: await db.noteTypes.toArray(),
      notes: await db.notes.toArray(),
      cards: await db.cards.toArray(),
      reviewLogs: await db.reviewLogs.toArray(),
      settings: await db.settings.toArray(),
    },
    media: await Promise.all(
      (await db.media.toArray()).map(async (m) => ({
        filename: m.filename,
        mime: m.mime,
        sha1: m.sha1,
        base64: await toBase64(m.blob),
      })),
    ),
  }));
}

export class InvalidBackupError extends Error {
  constructor() {
    super('This file isn’t a Nenrin backup.');
  }
}

export function parseBackup(text: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidBackupError();
  }
  const b = parsed as Partial<Backup>;
  if (b?.app !== 'nenrin' || b.kind !== 'backup' || b.version !== 1 || !b.data) {
    throw new InvalidBackupError();
  }
  return b as Backup;
}

/** Replaces everything in the database with the backup's contents, atomically. */
export async function restoreBackup(db: NenrinDB, backup: Backup): Promise<void> {
  const { data } = backup;
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.decks.bulkAdd(data.decks ?? []);
    await db.noteTypes.bulkAdd(data.noteTypes ?? []);
    await db.notes.bulkAdd(data.notes ?? []);
    await db.cards.bulkAdd(data.cards ?? []);
    await db.reviewLogs.bulkAdd(data.reviewLogs ?? []);
    await db.settings.bulkAdd(data.settings ?? []);
    await db.media.bulkAdd(
      (backup.media ?? []).map((m) => ({
        filename: m.filename,
        mime: m.mime,
        sha1: m.sha1,
        blob: fromBase64(m.base64, m.mime),
      })),
    );
  });
  await ensureBuiltins(db);
}

export function backupFilename(now = new Date()): string {
  return `nenrin-backup-${now.toISOString().slice(0, 10)}.json`;
}
