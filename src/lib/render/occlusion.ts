/**
 * Image occlusion: masks over an image, one card per mask (or group of masks).
 *
 * The data format is Anki's (23.10+), so notes move between Anki and Nenrin unchanged. The
 * Occlusion field holds one cloze per mask:
 *
 *   {{c1::image-occlusion:rect:left=.2:top=.3:width=.1:height=.05:oi=1}}
 *   {{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.05:oi=1}}
 *   {{c3::image-occlusion:polygon:points=.1,.1 .3,.1 .2,.3:oi=1}}
 *
 * Positions are fractions of the image size (Anki 23.10.0 wrote pixels; those still work).
 * `oi=1` ("occlude inactive") keeps the other masks covered too: hide all, guess one.
 *
 * Anki draws the masks with a script in its template; card scripts never run here, so Nenrin
 * renders its own SVG overlay instead (see renderCard).
 */
import type { NoteType } from '../db/types';

export type OcclusionShape =
  | { kind: 'rect'; left: number; top: number; width: number; height: number }
  | { kind: 'ellipse'; left: number; top: number; rx: number; ry: number }
  | { kind: 'polygon'; points: [number, number][] };

export interface Occlusion {
  /** Cloze number: masks with the same number make one card. */
  ordinal: number;
  shape: OcclusionShape;
  /** Hide all, guess one: other masks stay covered on this card. */
  hideAll: boolean;
}

const IO_RE = /\{\{c(\d+)::image-occlusion:(rect|ellipse|polygon)((?::[^:}]*)*)\}\}/g;

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function parseOcclusions(text: string): Occlusion[] {
  const out: Occlusion[] = [];
  for (const [, ord, kindText, rest] of text.matchAll(IO_RE)) {
    const kind = kindText as OcclusionShape['kind'];
    const props = Object.fromEntries(
      rest
        .split(':')
        .filter(Boolean)
        .map((p) => {
          const i = p.indexOf('=');
          return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
        }),
    );
    let shape: OcclusionShape;
    if (kind === 'rect') {
      shape = {
        kind,
        left: num(props.left),
        top: num(props.top),
        width: num(props.width),
        height: num(props.height),
      };
    } else if (kind === 'ellipse') {
      shape = {
        kind,
        left: num(props.left),
        top: num(props.top),
        rx: num(props.rx),
        ry: num(props.ry),
      };
    } else {
      const points = (props.points ?? '')
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(num) as [number, number])
        .filter((p) => p.length === 2);
      if (points.length < 3) continue;
      shape = { kind, points };
    }
    out.push({ ordinal: Number(ord), shape, hideAll: props.oi === '1' });
  }
  return out;
}

const fmt = (n: number) => {
  // Anki writes fractions with four decimals and no leading zero.
  const s = String(Number(n.toFixed(4)));
  return s.replace(/^0\./, '.').replace(/^-0\./, '-.');
};

export function serializeOcclusions(masks: Occlusion[]): string {
  return masks
    .map(({ ordinal, shape, hideAll }) => {
      let props: string;
      if (shape.kind === 'rect') {
        props = `left=${fmt(shape.left)}:top=${fmt(shape.top)}:width=${fmt(shape.width)}:height=${fmt(shape.height)}`;
      } else if (shape.kind === 'ellipse') {
        props = `left=${fmt(shape.left)}:top=${fmt(shape.top)}:rx=${fmt(shape.rx)}:ry=${fmt(shape.ry)}`;
      } else {
        props = `points=${shape.points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')}`;
      }
      return `{{c${ordinal}::image-occlusion:${shape.kind}:${props}:oi=${hideAll ? 1 : 0}}}`;
    })
    .join('\n');
}

/**
 * True for image occlusion note types: Nenrin's built-in one, and Anki's (whose templates
 * call its image-occlusion script). Fields are read by position, as Anki localizes the names:
 * Occlusion, Image, Header, Back Extra, Comments.
 */
export function isImageOcclusion(type: NoteType): boolean {
  return (
    type.kind === 'cloze' &&
    (type.id === 'image-occlusion' ||
      type.templates.some((t) => /image-?occlusion/i.test(t.front + t.back))) &&
    type.fields.length >= 2
  );
}

function shapeSvg(shape: OcclusionShape, cls: string): string {
  switch (shape.kind) {
    case 'rect':
      return `<rect class="${cls}" x="${shape.left}" y="${shape.top}" width="${shape.width}" height="${shape.height}"></rect>`;
    case 'ellipse':
      return `<ellipse class="${cls}" cx="${shape.left + shape.rx}" cy="${shape.top + shape.ry}" rx="${shape.rx}" ry="${shape.ry}"></ellipse>`;
    case 'polygon':
      return `<polygon class="${cls}" points="${shape.points.map((p) => p.join(',')).join(' ')}"></polygon>`;
  }
}

/** Largest coordinate, to tell pixel positions (Anki 23.10.0) from fractions. */
function extent(shape: OcclusionShape): number {
  if (shape.kind === 'rect') return Math.max(shape.left + shape.width, shape.top + shape.height);
  if (shape.kind === 'ellipse')
    return Math.max(shape.left + 2 * shape.rx, shape.top + 2 * shape.ry);
  return Math.max(...shape.points.flat());
}

/**
 * The image with its masks for one card. `imageHtml` is the Image field as HTML. On the
 * front, this card's masks are highlighted; on the back they're revealed as outlines. Other
 * masks stay covered when the note hides all, and are left out otherwise.
 */
export function renderOcclusion(
  occlusionText: string,
  imageHtml: string,
  cloze: number,
  side: 'front' | 'back',
): string {
  const masks = parseOcclusions(occlusionText);
  const pixels = masks.some((m) => extent(m.shape) > 1.5);
  const shapes = masks
    .map((m) => {
      if (m.ordinal === cloze)
        return shapeSvg(m.shape, side === 'front' ? 'io-active' : 'io-revealed');
      return m.hideAll ? shapeSvg(m.shape, 'io-inactive') : '';
    })
    .join('');
  // Pixel positions get their viewBox from the image's natural size once it loads (CardView).
  const viewBox = pixels ? '' : ' viewBox="0 0 1 1"';
  return `<div class="nenrin-io" data-units="${pixels ? 'px' : 'fraction'}">${imageHtml}<svg class="io-masks"${viewBox} preserveAspectRatio="none" aria-hidden="true">${shapes}</svg></div>`;
}
