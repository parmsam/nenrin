import { describe, expect, it } from 'vitest';
import {
  ACTION_KEYS,
  actionFor,
  assign,
  buttonName,
  DEFAULT_PAD_MAP,
  PAD_ACTIONS,
  pressedEdges,
  remoteKey,
} from './controls';

describe('controller and remote mapping', () => {
  it('maps the face buttons to the ratings, and every action to a different button', () => {
    expect(actionFor(DEFAULT_PAD_MAP, 0)).toBe('primary');
    expect(actionFor(DEFAULT_PAD_MAP, 1)).toBe('again');
    expect(ACTION_KEYS.again).toBe('1');
    expect(new Set(Object.values(DEFAULT_PAD_MAP)).size).toBe(PAD_ACTIONS.length);
    expect(buttonName(0)).toBe('A');
    expect(buttonName(42)).toBe('Button 42');
  });

  it('acts once per press, not while a button is held', () => {
    expect(pressedEdges([], [true, false])).toEqual([0]);
    expect(pressedEdges([true, false], [true, true])).toEqual([1]);
    expect(pressedEdges([true, true], [false, true])).toEqual([]);
  });

  it('swaps buttons when one is reassigned, so no action is left without one', () => {
    const map = assign(DEFAULT_PAD_MAP, 'again', 0);
    expect(map.again).toBe(0);
    expect(map.primary).toBe(1);
    expect(new Set(Object.values(map)).size).toBe(PAD_ACTIONS.length);
    expect(assign(DEFAULT_PAD_MAP, 'again', 7).again).toBe(7);
  });

  it('turns page turner, clicker and media keys into study keys', () => {
    expect(remoteKey('PageDown', 'review')).toBe(' ');
    expect(remoteKey('MediaPlayPause', 'review')).toBe(' ');
    expect(remoteKey('PageUp', 'review')).toBe('1');
    expect(remoteKey('PageUp', 'session')).toBe('ArrowLeft');
    expect(remoteKey('ArrowRight', 'review')).toBe(' ');
    // Preview already uses the arrows.
    expect(remoteKey('ArrowRight', 'session')).toBeNull();
    expect(remoteKey('a', 'review')).toBeNull();
  });
});
