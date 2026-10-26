/** App actions shared by screens and the command palette. */
import { db } from './db';
import { backupFilename, createBackup } from './db/backup';
import { downloadFile } from './download';

/** Downloads a full JSON backup and records when it happened (for the reminder). */
export async function exportBackup(): Promise<void> {
  downloadFile(JSON.stringify(await createBackup(db)), backupFilename(), 'application/json');
  await db.settings.put({ key: 'lastBackupAt', value: Date.now() });
}

/** Copies the "make cards with an LLM" prompt. Resolves false if the clipboard is blocked. */
export async function copyCardPrompt(): Promise<boolean> {
  const { cardPrompt } = await import('./llm/prompt');
  try {
    await navigator.clipboard.writeText(cardPrompt());
    return true;
  } catch {
    return false;
  }
}

/** Downloads the Agent Skill as a zip holding `nenrin-cards/SKILL.md`, ready to upload or unzip. */
export async function downloadCardSkill(): Promise<void> {
  const [{ skillMarkdown, SKILL_NAME }, { strToU8, zipSync }] = await Promise.all([
    import('./llm/prompt'),
    import('fflate'),
  ]);
  const zip = zipSync({ [SKILL_NAME]: { 'SKILL.md': strToU8(skillMarkdown()) } });
  downloadFile(zip, `${SKILL_NAME}.zip`, 'application/zip');
}

export type ExportFormat = 'apkg' | 'txt';

/**
 * Downloads notes from one deck (and its sub-decks) or all decks: as an Anki package, built in
 * a worker, or as Anki-compatible text.
 */
export async function exportNotes(options: {
  deckId?: string;
  name?: string;
  format: ExportFormat;
  scheduling: boolean;
}): Promise<void> {
  if (options.format === 'txt') {
    const { exportNotesText, textExportFilename } = await import('./export/text');
    downloadFile(
      await exportNotesText(db, options.deckId),
      textExportFilename(options.name),
      'text/plain;charset=utf-8',
    );
    return;
  }
  const [{ collectApkg, apkgFilename }, { writePackageInWorker }] = await Promise.all([
    import('./export/apkg'),
    import('./anki/parse-in-worker'),
  ]);
  const input = await collectApkg(db, { deckId: options.deckId, scheduling: options.scheduling });
  downloadFile(
    await writePackageInWorker(input),
    apkgFilename(options.name),
    'application/octet-stream',
  );
}
