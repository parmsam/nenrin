/**
 * Game controllers and remotes. They don't get their own review logic: each button or key
 * becomes the keyboard key the study screens already handle, so reviewing, preview and custom
 * study all work with them unchanged. Pure mapping here; controller.svelte.ts does the I/O.
 */

/** What a controller button can do while studying. */
export type PadAction =
  | 'primary'
  | 'again'
  | 'hard'
  | 'easy'
  | 'undo'
  | 'replay'
  | 'back'
  | 'prev'
  | 'next'
  | 'scrollUp'
  | 'scrollDown';

export const PAD_ACTIONS: { action: PadAction; label: string }[] = [
  { action: 'primary', label: 'Show answer, then Good' },
  { action: 'again', label: 'Again' },
  { action: 'hard', label: 'Hard' },
  { action: 'easy', label: 'Easy' },
  { action: 'undo', label: 'Undo' },
  { action: 'replay', label: 'Replay audio' },
  { action: 'back', label: 'Back to deck' },
  { action: 'prev', label: 'Previous card (preview)' },
  { action: 'next', label: 'Next card (preview)' },
  { action: 'scrollUp', label: 'Scroll up' },
  { action: 'scrollDown', label: 'Scroll down' },
];

/** Button numbers in the browser's "standard" gamepad layout (Xbox names; PlayStation alike). */
export const BUTTON_NAMES: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'View',
  9: 'Menu',
  10: 'Left stick',
  11: 'Right stick',
  12: 'D-pad ↑',
  13: 'D-pad ↓',
  14: 'D-pad ←',
  15: 'D-pad →',
  16: 'Home',
};

export const buttonName = (b: number) => BUTTON_NAMES[b] ?? `Button ${b}`;

export type PadMap = Record<PadAction, number>;

/** The face buttons follow the rating order: A Good (the usual answer), B Again, X Hard, Y Easy. */
export const DEFAULT_PAD_MAP: PadMap = {
  primary: 0,
  again: 1,
  hard: 2,
  easy: 3,
  undo: 4,
  replay: 5,
  back: 8,
  prev: 14,
  next: 15,
  scrollUp: 12,
  scrollDown: 13,
};

/** The key each action stands for on the study screens. Scrolling has no key. */
export const ACTION_KEYS: Record<PadAction, string | null> = {
  primary: ' ',
  again: '1',
  hard: '2',
  easy: '4',
  undo: 'z',
  replay: 'r',
  back: 'Escape',
  prev: 'ArrowLeft',
  next: 'ArrowRight',
  scrollUp: null,
  scrollDown: null,
};

/** The action for a button under a map, if any. */
export function actionFor(map: PadMap, button: number): PadAction | null {
  return (Object.keys(map) as PadAction[]).find((a) => map[a] === button) ?? null;
}

/** Buttons that went down since the last poll. */
export function pressedEdges(before: readonly boolean[], now: readonly boolean[]): number[] {
  return now.flatMap((down, i) => (down && !before[i] ? [i] : []));
}

/** Assigns a button to an action. A button does one thing, so an action using it gives it up. */
export function assign(map: PadMap, action: PadAction, button: number): PadMap {
  const next = { ...map };
  const taken = actionFor(map, button);
  // Swap, so the other action keeps a button instead of losing it.
  if (taken && taken !== action) next[taken] = map[action];
  next[action] = button;
  return next;
}

export type StudyScreen = 'review' | 'session';

/**
 * Keys from page turners, presentation clickers and media keys, as the key a study screen
 * understands. Their "next" shows the answer and then rates Good; their "back" is Again while
 * reviewing, and the previous card in preview and custom study.
 */
export function remoteKey(key: string, screen: StudyScreen): string | null {
  switch (key) {
    case 'PageDown':
    case 'MediaPlayPause':
    case 'MediaTrackNext':
      return ' ';
    case 'ArrowRight':
      // Preview already moves on with →; reviewing has no arrow keys of its own.
      return screen === 'review' ? ' ' : null;
    case 'PageUp':
    case 'MediaTrackPrevious':
      return screen === 'review' ? '1' : 'ArrowLeft';
    case 'ArrowLeft':
      return screen === 'review' ? '1' : null;
    default:
      return null;
  }
}

const MAP_KEY = 'nenrin:gamepad-map';

/** The saved map for this device, or the defaults. */
export function loadPadMap(): PadMap {
  try {
    const saved = JSON.parse(localStorage.getItem(MAP_KEY) ?? 'null') as Partial<PadMap> | null;
    return { ...DEFAULT_PAD_MAP, ...saved };
  } catch {
    return { ...DEFAULT_PAD_MAP };
  }
}

export function savePadMap(map: PadMap): void {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
  } catch {
    // Private mode etc.: the map lasts for this visit only.
  }
}
