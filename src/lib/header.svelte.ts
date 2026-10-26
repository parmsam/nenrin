/** Header buttons the user can hide (per device). Reactive, so Settings updates the header live. */
const HELP_KEY = 'nenrin:help-button';

function read(): boolean {
  try {
    return localStorage.getItem(HELP_KEY) !== 'false';
  } catch {
    return true;
  }
}

export const headerPrefs = $state({ helpButton: read() });

export function setHelpButton(on: boolean): void {
  headerPrefs.helpButton = on;
  try {
    localStorage.setItem(HELP_KEY, String(on));
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}
