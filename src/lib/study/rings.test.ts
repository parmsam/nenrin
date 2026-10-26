import { describe, expect, it } from 'vitest';
import { HISTORY_MAX, MAX_RINGS, PITH, ringPath, ringRadii, ringsDescription } from './rings';

describe('growth rings', () => {
  it('makes one ring per study day, wider for busier days', () => {
    const radii = ringRadii([10, 0, 40, 10]);
    expect(radii).toHaveLength(3);
    const widths = radii.map((r, i) => r - (i === 0 ? PITH : radii[i - 1]));
    expect(widths[1]).toBeGreaterThan(widths[0]);
    expect(widths[0]).toBeCloseTo(widths[2]);
  });

  it('always fits inside the history area, keeping only recent rings', () => {
    const radii = ringRadii(Array.from({ length: 60 }, (_, i) => 50 + i * 10));
    expect(radii).toHaveLength(MAX_RINGS);
    expect(radii.at(-1)!).toBeLessThanOrEqual(HISTORY_MAX + 1e-9);
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1]);
  });

  it('has no rings before the first study day', () => {
    expect(ringRadii([])).toEqual([]);
    expect(ringRadii([0, 0])).toEqual([]);
  });

  it('draws a closed, stable outline', () => {
    const d = ringPath(20);
    expect(d.startsWith('M60.')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(ringPath(20)).toBe(d);
  });

  it('describes the rings in words', () => {
    expect(ringsDescription([], 0, 5)).toBe(
      'Today: 0 of 5 done, 5 left. No rings yet: each day you study adds one.',
    );
    expect(ringsDescription([3, 0, 8], 12, 0)).toContain("Today's ring is complete: 12 reviewed.");
    expect(ringsDescription([3, 0, 8], 12, 0)).toContain('2 rings');
  });
});
