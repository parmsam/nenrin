// Generates the Nenrin logo: a cross-section of a tree trunk (年輪, "tree rings").
// Deterministic. Run `npm run brand` and commit the output.
import { mkdirSync, writeFileSync } from 'node:fs';

const C = {
  bg: '#2b2520',
  bark: '#5b3d27',
  barkEdge: '#3f2a1b',
  wood: '#ecd3a8',
  woodInner: '#f4e2c2',
  ring: '#b4804f',
  accent: '#d9773a',
};

// Pith sits off-centre, as in real trunks; rings are wider on one side.
const PITH = [250, 256];
const RINGS = [26, 54, 80, 106, 128, 150];
const ACCENT_RING = 4;

function ringPoints(r, seed, steps = 96) {
  const pts = [];
  for (let k = 0; k < steps; k++) {
    const t = (k / steps) * Math.PI * 2;
    const ecc = 1 + 0.07 * Math.cos(t - 0.6);
    const wobble =
      1 +
      0.018 * Math.sin(3 * t + seed) +
      0.012 * Math.sin(5 * t + seed * 1.7) +
      0.006 * Math.sin(9 * t + seed * 2.3);
    const rr = r * ecc * wobble;
    pts.push([PITH[0] + rr * Math.cos(t), PITH[1] + rr * Math.sin(t)]);
  }
  return pts;
}

// Closed Catmull-Rom spline through points, as cubic Béziers.
function smoothPath(pts) {
  const n = pts.length;
  const f = (v) => v.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

function mark({ background }) {
  const rings = RINGS.map((r, i) => {
    const accent = i === ACCENT_RING;
    return `<path d="${smoothPath(ringPoints(r, i * 1.3 + 0.4))}" fill="none" stroke="${accent ? C.accent : C.ring}" stroke-width="${accent ? 12 : 7}" stroke-linecap="round"/>`;
  }).join('\n    ');
  // A single radial check (crack), typical of a dried slice; adds character at large sizes.
  const crack = `<path d="M${PITH[0] + 30} ${PITH[1] - 14} L${PITH[0] + 86} ${PITH[1] - 42} L${PITH[0] + 112} ${PITH[1] - 48}" fill="none" stroke="${C.ring}" stroke-width="5" stroke-linecap="round" opacity=".5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <title>Nenrin</title>
  ${background ? `<rect width="512" height="512" rx="112" fill="${C.bg}"/>` : ''}
  <path d="${smoothPath(ringPoints(196, 9))}" fill="${C.barkEdge}"/>
  <path d="${smoothPath(ringPoints(186, 9.4))}" fill="${C.bark}"/>
  <path d="${smoothPath(ringPoints(170, 3))}" fill="${C.wood}"/>
  <circle cx="${PITH[0]}" cy="${PITH[1]}" r="112" fill="${C.woodInner}" opacity=".55"/>
  <g>
    ${rings}
  </g>
  ${crack}
  <circle cx="${PITH[0]}" cy="${PITH[1]}" r="7" fill="${C.ring}"/>
</svg>
`;
}

mkdirSync('public', { recursive: true });
mkdirSync('docs/brand', { recursive: true });
writeFileSync('public/favicon.svg', mark({ background: true }));
writeFileSync('public/logo.svg', mark({ background: false }));
writeFileSync('docs/brand/logo.svg', mark({ background: false }));
writeFileSync('docs/brand/app-icon.svg', mark({ background: true }));
console.log('Wrote public/favicon.svg, public/logo.svg, docs/brand/{logo,app-icon}.svg');
