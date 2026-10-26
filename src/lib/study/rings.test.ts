import { describe, expect, it } from 'vitest';
import {
  HISTORY_MAX,
  MAX_RINGS,
  PITH,
  ringPath,
  ringsDescription,
  treeLayout,
  type TreeLayout,
} from './rings';

const widths = (t: TreeLayout) => t.rings.map((r) => r.outer - r.inner);
const daily = (n: number, reviews = 20) => Array.from({ length: n }, () => reviews);

describe('growth rings', () => {
  it('makes one ring per study day, wider for busier days', () => {
    const tree = treeLayout([10, 0, 40, 10]);
    expect(tree.rings).toHaveLength(3);
    const [a, b, c] = widths(tree);
    expect(b).toBeGreaterThan(a);
    expect(a).toBeCloseTo(c);
    expect(tree.rings[0].inner).toBe(PITH);
    expect(tree.rings.at(-1)!.outer).toBe(tree.radius);
  });

  it('keeps growing with more study days, up to the full size', () => {
    const sizes = [14, 30, 90, 365, 400].map((n) => treeLayout(daily(n)).radius);
    for (let i = 1; i < 4; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1] + 2);
    expect(sizes[3]).toBeCloseTo(HISTORY_MAX);
    expect(sizes[4]).toBeCloseTo(HISTORY_MAX);
  });

  it('merges older days into the heartwood, keeping recent rings legible', () => {
    const tree = treeLayout(daily(200));
    expect(tree.rings.length).toBeLessThanOrEqual(MAX_RINGS);
    expect(tree.heartwood).toBeGreaterThan(PITH);
    expect(tree.rings[0].inner).toBeCloseTo(tree.heartwood);
    for (const w of widths(tree)) expect(w).toBeGreaterThan(1);
  });

  it("doesn't let one huge day thin out the rest", () => {
    const steady = treeLayout(daily(8, 12));
    const withBigDay = treeLayout([12, 12, 12, 300, 12, 12, 12, 12]);
    expect(withBigDay.radius).toBe(steady.radius);
    const w = widths(withBigDay);
    expect(w[3]).toBeLessThan(w[0] * 2.5);
    expect(w[0]).toBeGreaterThan(widths(steady)[0] * 0.75);
  });

  it('leaves a scar after a long break', () => {
    const tree = treeLayout([...daily(5), ...daily(20, 0), ...daily(3)]);
    expect(tree.scars).toEqual([tree.rings[5].inner]);
    expect(treeLayout([...daily(5), ...daily(3, 0), ...daily(3)]).scars).toEqual([]);
  });

  it('has no rings before the first study day', () => {
    expect(treeLayout([])).toEqual({ radius: 0, heartwood: 0, rings: [], scars: [] });
    expect(treeLayout([0, 0]).rings).toEqual([]);
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
