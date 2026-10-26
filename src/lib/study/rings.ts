/**
 * The home screen's tree cross-section (年輪, "tree rings"): one ring per day you studied,
 * wider for days with more reviews, the way real rings are wide in good years. Pure
 * geometry here; GrowthRings.svelte draws it.
 */

/** Ring geometry in a 120×120 viewBox centered at (60, 60). */
export const CENTER = 60;
/** The pith, before the first ring. */
export const PITH = 2.5;
/** Past rings fit inside this radius; today's ring sits outside it. */
export const HISTORY_MAX = 44;
/** Today's ring (the progress arc) radius. */
export const TODAY_R = 51;
/** At most this many past rings; older ones fall off the inside. */
export const MAX_RINGS = 18;

const MIN_WIDTH = 1.2;
const MAX_WIDTH = 5;

/**
 * Outer radius of each past ring, oldest first, for days with reviews (`counts`, oldest
 * first, zeros skipped). Width grows with the square root of the day's reviews, so a
 * 300-review day doesn't dwarf the rest; the whole set is scaled to fit.
 */
export function ringRadii(counts: number[]): number[] {
  const days = counts.filter((c) => c > 0).slice(-MAX_RINGS);
  if (days.length === 0) return [];
  const peak = Math.sqrt(Math.max(...days));
  const widths = days.map((c) => MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * (Math.sqrt(c) / peak));
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = Math.min(1, (HISTORY_MAX - PITH) / total);
  let r = PITH;
  return widths.map((w) => (r += w * scale));
}

/**
 * The shared wobble: real rings are neither round nor centered. Every boundary uses the same
 * shape (scaled by its radius), so rings never cross. Fixed phases keep it stable between
 * visits; about ±6% of the radius.
 */
function wobble(theta: number): number {
  return (
    1 +
    0.035 * Math.sin(theta + 0.6) +
    0.016 * Math.sin(2 * theta + 2.1) +
    0.008 * Math.sin(5 * theta + 4.4)
  );
}

/** A closed, smooth ring boundary of base radius `r`, starting at the top, going clockwise. */
export function ringPath(r: number, steps = 48): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const theta = -Math.PI / 2 + (i / steps) * 2 * Math.PI;
    const rr = r * wobble(theta);
    pts.push([CENTER + rr * Math.cos(theta), CENTER + rr * Math.sin(theta)]);
  }
  // Catmull-Rom through the points, as cubic Béziers, for a smooth organic outline.
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < steps; i++) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((k) => pts[(i + k + steps) % steps]);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return `${d}Z`;
}

/** Plain-language summary for screen readers and the tooltip. */
export function ringsDescription(counts: number[], done: number, remaining: number): string {
  const days = counts.filter((c) => c > 0).length;
  const past =
    days === 0
      ? 'No rings yet: each day you study adds one.'
      : `${days} ${days === 1 ? 'ring' : 'rings'}, one for each day you studied recently; wider rings are days with more reviews.`;
  const total = done + remaining;
  const today =
    total === 0
      ? 'Nothing due today.'
      : remaining === 0
        ? `Today's ring is complete: ${done} reviewed.`
        : `Today: ${done} of ${total} done, ${remaining} left.`;
  return `${today} ${past}`;
}
