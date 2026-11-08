import { describe, expect, it } from 'vitest';
import { dismissTip, parseDismissed, setTipsEnabled, tips, tipVisible } from './tips.svelte';

describe('welcome tips', () => {
  it('reads the dismissed list, ignoring junk', () => {
    expect(parseDismissed(null)).toEqual([]);
    expect(parseDismissed('not json')).toEqual([]);
    expect(parseDismissed('{"a":1}')).toEqual([]);
    expect(parseDismissed('["name", 3, "deck"]')).toEqual(['name', 'deck']);
  });

  it('closes one tip, hides all, and brings them all back', () => {
    setTipsEnabled(true);
    expect(tipVisible('name')).toBe(true);
    dismissTip('name');
    expect(tipVisible('name')).toBe(false);
    expect(tipVisible('deck')).toBe(true);
    setTipsEnabled(false);
    expect(tipVisible('deck')).toBe(false);
    setTipsEnabled(true);
    expect(tips.dismissed).toEqual([]);
    expect(tipVisible('name')).toBe(true);
  });
});
