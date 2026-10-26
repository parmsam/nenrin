/**
 * The home screen's tree cross-section (年輪, "tree rings"): one ring per day you studied,
 * wider for days with more reviews, the way real rings are wide in good years. The trunk
 * grows with every study day; older days darken into heartwood, and long breaks leave a
 * scar. Pure geometry here; GrowthRings.svelte draws it.
 */

/** Ring geometry in a 120×120 viewBox centered at (60, 60). */
export const CENTER = 60;
/** The pith, before the first ring. */
export const PITH = 2.5;
/** The trunk grows to this radius; today's ring sits outside it. */
export const HISTORY_MAX = 44;
/** Today's ring (the progress arc) radius. */
export const TODAY_R = 51;
/** At most this many rings are drawn one by one; older days merge into the heartwood. */
export const MAX_RINGS = 16;
/** The trunk reaches full size after this many study days. */
export const FULL_GROWN = 365;
/** A gap of at least this many days between study days leaves a scar line. */
export const BREAK_DAYS = 7;

/** A typical day's ring width before scaling, and its limits for light and heavy days. */
const TYPICAL_WIDTH = 2.2;
const MIN_WIDTH = 0.8;
const MAX_WIDTH = 4.5;
/** Rings are never scaled thinner than this, so they stay legible; the rest becomes heartwood. */
const MIN_SCALE = 0.85;
/** The heartwood, when there is one, is at least this much wider than the pith. */
const MIN_HEARTWOOD = 1.5;

export interface Ring {
  inner: number;
  outer: number;
}

export interface TreeLayout {
  /** Outer radius of the trunk (0 before the first study day). */
  radius: number;
  /** Radius of the dark core of older days, or 0 if every day has its own ring. */
  heartwood: number;
  /** Drawn rings, oldest first. */
  rings: Ring[];
  /** Radii where a long break left a scar. */
  scars: number[];
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Lays out the trunk from reviews per day (`counts`, oldest first, zeros for days off).
 * The trunk's size follows the number of study days, growing quickly at first and slowing
 * down, so a year of study looks bigger than a month. Ring width follows the day's reviews
 * against a typical (median) day, square-rooted and clamped, so one huge day doesn't make
 * the rest look thin. The newest rings are drawn outward-in; whatever doesn't fit is heartwood.
 */
export function treeLayout(counts: number[]): TreeLayout {
  const days = counts.flatMap((c, i) => (c > 0 ? [{ c, i }] : []));
  if (days.length === 0) return { radius: 0, heartwood: 0, rings: [], scars: [] };
  const grown = Math.min(1, Math.log1p(days.length) / Math.log1p(FULL_GROWN));
  const radius = PITH + (HISTORY_MAX - PITH) * grown;
  const typical = median(days.map((d) => d.c));
  const widths = days.map((d) =>
    Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, TYPICAL_WIDTH * Math.sqrt(d.c / typical))),
  );
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = Math.max(MIN_SCALE, (radius - PITH) / total);

  const rings: Ring[] = [];
  const scars: number[] = [];
  let r = radius;
  let k = days.length - 1;
  for (; k >= 0 && rings.length < MAX_RINGS; k--) {
    const inner = k === 0 ? PITH : r - widths[k] * scale;
    // Leave room for the heartwood if older days remain.
    if (k > 0 && inner < PITH + MIN_HEARTWOOD) break;
    rings.unshift({ inner: Math.max(PITH, inner), outer: r });
    if (k > 0 && days[k].i - days[k - 1].i > BREAK_DAYS) scars.push(Math.max(PITH, inner));
    r = inner;
  }
  return { radius, heartwood: k >= 0 ? r : 0, rings, scars };
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
      : `${days} ${days === 1 ? 'ring' : 'rings'}, one for each day you studied in the past year; wider rings are days with more reviews.`;
  const total = done + remaining;
  const today =
    total === 0
      ? 'Nothing due today.'
      : remaining === 0
        ? `Today's ring is complete: ${done} reviewed.`
        : `Today: ${done} of ${total} done, ${remaining} left.`;
  return `${today} ${past}`;
}
