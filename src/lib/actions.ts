/** App actions shared by screens and the command palette. */
import { db } from './db';
import { backupFilename, createBackup } from './db/backup';
import { downloadFile } from './download';

/** Downloads a full JSON backup and records when it happened (for the reminder). */
export async function exportBackup(): Promise<void> {
  downloadFile(JSON.stringify(await createBackup(db)), backupFilename(), 'application/json');
  await db.settings.put({ key: 'lastBackupAt', value: Date.now() });
}
