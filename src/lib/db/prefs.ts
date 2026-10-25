import type { NenrinDB } from '.';
import { DEFAULT_PREFS, type Prefs } from './types';

const KEY = 'prefs';

export async function getPrefs(db: NenrinDB): Promise<Prefs> {
  const row = await db.settings.get(KEY);
  return { ...DEFAULT_PREFS, ...(row?.value as Partial<Prefs> | undefined) };
}

export async function setPrefs(db: NenrinDB, changes: Partial<Prefs>): Promise<Prefs> {
  const next = { ...(await getPrefs(db)), ...changes };
  await db.settings.put({ key: KEY, value: next });
  return next;
}

/** A random id for this browser/device, created on first use. Tags review logs for future sync. */
export async function getDeviceId(db: NenrinDB): Promise<string> {
  const row = await db.settings.get('deviceId');
  if (typeof row?.value === 'string') return row.value;
  const id = crypto.randomUUID();
  await db.settings.put({ key: 'deviceId', value: id });
  return id;
}
