/**
 * Game controller and remote input (see controls.ts for the mapping). Started once by App.
 * Controllers are polled only while one is connected; nothing runs otherwise.
 */
import { router } from '../router.svelte';
import {
  ACTION_KEYS,
  actionFor,
  loadPadMap,
  pressedEdges,
  remoteKey,
  savePadMap,
  type PadMap,
  type StudyScreen,
} from './controls';

export const controllers = $state({
  /** Names of connected controllers. */
  connected: [] as string[],
  map: loadPadMap(),
  /** While set, the next button press goes here instead of acting (remapping in Settings). */
  capture: null as ((button: number) => void) | null,
});

export function setPadMap(map: PadMap): void {
  controllers.map = map;
  savePadMap(map);
}

function studyScreen(): StudyScreen | null {
  if (router.path.startsWith('/study/')) return 'review';
  if (router.path.startsWith('/session/')) return 'session';
  return null;
}

/** Sends a key to the app as if it were typed, so the screens' own key handlers act on it. */
function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const SCROLL_STEP = 160;
// Last frame's buttons per controller: internal to the poll loop, never shown, so not reactive.
let previous = new Map<number, boolean[]>();
let polling = false;

function onButton(pad: Gamepad, button: number) {
  if (controllers.capture) {
    const done = controllers.capture;
    controllers.capture = null;
    done(button);
    return;
  }
  // Something else has the focus (a dialog, the palette): leave it be.
  if (document.querySelector('dialog[open]')) return;
  const action = actionFor(controllers.map, button);
  if (!studyScreen()) {
    // Off the study screens, the main button starts studying (the S shortcut).
    if (action === 'primary') press('s');
    return;
  }
  if (!action) return;
  if (action === 'scrollUp' || action === 'scrollDown') {
    window.scrollBy({
      top: action === 'scrollUp' ? -SCROLL_STEP : SCROLL_STEP,
      behavior: 'smooth',
    });
    return;
  }
  if (action === 'again') {
    // A short buzz says "noted" without needing to look up.
    void pad.vibrationActuator
      ?.playEffect('dual-rumble', { duration: 120, strongMagnitude: 0.5, weakMagnitude: 0.3 })
      .catch(() => {});
  }
  const key = ACTION_KEYS[action];
  if (key) press(key);
}

function poll() {
  const pads = [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p);
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- loop-internal, like `previous`
  const seen = new Map<number, boolean[]>();
  for (const pad of pads) {
    const now = pad.buttons.map((b) => b.pressed);
    for (const button of pressedEdges(previous.get(pad.index) ?? [], now)) onButton(pad, button);
    seen.set(pad.index, now);
  }
  previous = seen;
  if (pads.length) requestAnimationFrame(poll);
  else polling = false;
}

function refresh() {
  const pads = [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p);
  controllers.connected = pads.map((p) => p.id);
  if (pads.length && !polling) {
    polling = true;
    requestAnimationFrame(poll);
  }
}

/** Page turners, clickers and media keys, turned into the study screens' keys. */
function onRemoteKey(e: KeyboardEvent) {
  // Ours (from press) or a modified key: not a remote.
  if (!e.isTrusted || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  const screen = studyScreen();
  if (!screen || document.querySelector('dialog[open]')) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
  const key = remoteKey(e.key, screen);
  if (!key) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  press(key);
}

let started = false;

export function startControllers(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('gamepadconnected', refresh);
  window.addEventListener('gamepaddisconnected', refresh);
  // Capture phase, so the translation happens before the screens' own handlers see the key.
  window.addEventListener('keydown', onRemoteKey, { capture: true });
  refresh();
}
