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
      { keys: [['D']], action: 'Decks (home)' },
      { keys: [['A']], action: 'Add cards' },
      { keys: [['B']], action: 'Browse notes' },
      { keys: [['T']], action: 'Stats' },
      { keys: [['I']], action: 'Import' },
      { keys: [[MOD, ',']], action: 'Settings' },
      { keys: [['Esc']], action: 'Close this dialog' },
    ],
  },
  {
    group: 'Decks',
    items: [
      { keys: [['S']], action: 'Study (the deck you’re on, or the one with most due)' },
      { keys: [['P']], action: 'Preview every card in the deck' },
      { keys: [['C']], action: 'Custom study' },
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
      { keys: [['Z'], [MOD, 'Z']], action: 'Undo last rating, bury or suspend' },
      { keys: [['-']], action: 'Bury card until tomorrow' },
      { keys: [['=']], action: 'Bury note (all its cards) until tomorrow' },
      { keys: [['@']], action: 'Suspend card' },
      { keys: [['!']], action: 'Suspend note' },
      { keys: [['R']], action: 'Replay audio' },
      { keys: [['E']], action: 'Edit current note' },
      { keys: [['Esc']], action: 'Back to deck' },
    ],
  },
  {
    group: 'Preview and custom study',
    items: [
      { keys: [['Space'], ['Enter']], action: 'Show answer, then next card' },
      { keys: [['←'], ['→']], action: 'Previous / next card (preview)' },
      { keys: [['1']], action: 'Again: see it again later in this session' },
    ],
  },
  {
    group: 'Browsing',
    items: [
      { keys: [['/']], action: 'Focus the search box' },
      { keys: [['↓'], ['J']], action: 'Next note' },
      { keys: [['↑'], ['K']], action: 'Previous note' },
      { keys: [['Enter']], action: 'Edit the focused note' },
      { keys: [['X']], action: 'Select or unselect the focused note' },
    ],
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

/**
 * True for a plain shortcut key press: no Ctrl/Cmd/Alt, not in a text field, and no dialog
 * (shortcuts, palette, confirm) open. Shift is allowed, since keys like ? and @ need it.
 */
export function plainKey(e: KeyboardEvent): boolean {
  return (
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.defaultPrevented &&
    !isTyping(e) &&
    !document.querySelector('dialog[open]')
  );
}
