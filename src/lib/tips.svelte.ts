/**
 * Welcome tips (see Tip.svelte): short notes that explain the name and each main screen.
 * Each can be closed with ×. Per device, like the splash; Settings turns them back on.
 */
export const TIPS_PREF_KEY = 'nenrin:tips';
export const TIPS_DISMISSED_KEY = 'nenrin:tips-dismissed';

export type TipId = 'name' | 'today' | 'deck' | 'review';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}

/** Reads the dismissed list, ignoring anything malformed. */
export function parseDismissed(raw: string | null | undefined): TipId[] {
  try {
    const list: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is TipId => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function read(): { on: boolean; dismissed: TipId[] } {
  try {
    const s = storage();
    return {
      on: s?.getItem(TIPS_PREF_KEY) !== 'false',
      dismissed: parseDismissed(s?.getItem(TIPS_DISMISSED_KEY)),
    };
  } catch {
    return { on: true, dismissed: [] };
  }
}

export const tips = $state(read());

export function tipVisible(id: TipId): boolean {
  return tips.on && !tips.dismissed.includes(id);
}

/** Closes one tip for good (until tips are turned back on in Settings). */
export function dismissTip(id: TipId): void {
  if (tips.dismissed.includes(id)) return;
  tips.dismissed = [...tips.dismissed, id];
  save(TIPS_DISMISSED_KEY, JSON.stringify(tips.dismissed));
}

/** Turning tips on brings back every tip, including ones closed before. */
export function setTipsEnabled(on: boolean): void {
  tips.on = on;
  save(TIPS_PREF_KEY, String(on));
  if (on) {
    tips.dismissed = [];
    save(TIPS_DISMISSED_KEY, '[]');
  }
}
