/** Welcome splash preference (per device) and when to show it. See Splash.svelte. */
export const SPLASH_PREF_KEY = 'nenrin:splash';
export const SPLASH_SEEN_KEY = 'nenrin:splash-seen';

export function splashEnabled(): boolean {
  try {
    return localStorage.getItem(SPLASH_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setSplashEnabled(on: boolean): void {
  try {
    localStorage.setItem(SPLASH_PREF_KEY, String(on));
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}

/** Show on a plain launch of the home screen, once per session, if enabled. */
export function shouldShowSplash(path: string): boolean {
  if (path !== '/' || !splashEnabled()) return false;
  try {
    return !sessionStorage.getItem(SPLASH_SEEN_KEY);
  } catch {
    return true;
  }
}
