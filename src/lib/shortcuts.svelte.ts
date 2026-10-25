/** Keyboard shortcuts, as shown in the shortcuts dialog. Keep in sync with the key handlers. */

const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');
/** The platform's command modifier: ⌘ on Apple devices, Ctrl elsewhere. */
export const MOD = isMac ? '⌘' : 'Ctrl';

export interface Shortcut {
  keys: string[][]; // alternatives, each a key combo: [['Space'], ['Enter']]
  action: string;
}

export const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: 'Everywhere',
    items: [
      { keys: [[MOD, 'K']], action: 'Command palette: jump anywhere, run anything' },
      { keys: [['?']], action: 'Show keyboard shortcuts' },
      { keys: [['Esc']], action: 'Close this dialog' },
    ],
  },
  {
    group: 'Reviewing',
    items: [
      { keys: [['Space'], ['Enter']], action: 'Show answer, then rate Good' },
      { keys: [['1']], action: 'Again' },
      { keys: [['2']], action: 'Hard' },
      { keys: [['3']], action: 'Good' },
      { keys: [['4']], action: 'Easy' },
      { keys: [['Z'], [MOD, 'Z']], action: 'Undo last rating' },
      { keys: [['R']], action: 'Replay audio' },
      { keys: [['E']], action: 'Edit current note' },
      { keys: [['Esc']], action: 'Back to deck' },
    ],
  },
  {
    group: 'Browsing',
    items: [{ keys: [['/']], action: 'Focus the search box' }],
  },
  {
    group: 'Adding and editing',
    items: [
      { keys: [[MOD, 'Enter']], action: 'Add or save' },
      { keys: [[MOD, 'Shift', 'C']], action: 'Wrap selection in a cloze' },
    ],
  },
];

/** Shared open state, so any screen can open the dialog and key handlers can stand down. */
export const shortcutsDialog = $state({ open: false });

/** True when a key event comes from a text field, where single-key shortcuts must not fire. */
export function isTyping(e: KeyboardEvent): boolean {
  return !!(e.target as HTMLElement | null)?.closest?.(
    'input, textarea, select, [contenteditable]',
  );
}
