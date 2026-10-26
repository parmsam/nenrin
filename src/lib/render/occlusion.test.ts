// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Note } from '../db/types';
import { BASIC, CLOZE, IMAGE_OCCLUSION } from '../notes/builtins';
import { renderCard } from '.';
import { isImageOcclusion, parseOcclusions, serializeOcclusions } from './occlusion';

const FIELD = [
  '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.1:oi=1}}',
  '{{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.05:oi=1}}',
  '{{c2::image-occlusion:polygon:points=.1,.6 .3,.6 .2,.8:oi=1}}',
].join('<br>');

const note = (occlusion: string, extra = ''): Note => ({
  id: 'n',
  noteTypeId: 'image-occlusion',
  fields: {
    Occlusion: occlusion,
    Image: '<img src="heart.png">',
    Header: 'The heart',
    'Back Extra': extra,
    Comments: '',
  },
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  format: 'html',
});

describe('image occlusion', () => {
  it('reads Anki’s occlusion format, grouping masks by cloze number', () => {
    const masks = parseOcclusions(FIELD);
    expect(masks.map((m) => [m.ordinal, m.shape.kind, m.hideAll])).toEqual([
      [1, 'rect', true],
      [2, 'ellipse', true],
      [2, 'polygon', true],
    ]);
    expect(masks[0].shape).toEqual({ kind: 'rect', left: 0.1, top: 0.2, width: 0.3, height: 0.1 });
    expect(masks[2].shape).toMatchObject({
      points: [
        [0.1, 0.6],
        [0.3, 0.6],
        [0.2, 0.8],
      ],
    });
  });

  it('writes the same format back', () => {
    const masks = parseOcclusions(FIELD);
    expect(serializeOcclusions(masks)).toBe(FIELD.replaceAll('<br>', '\n'));
    expect(
      serializeOcclusions([
        {
          ordinal: 3,
          hideAll: false,
          shape: { kind: 'rect', left: 0.123456, top: 0, width: 1, height: 0.5 },
        },
      ]),
    ).toBe('{{c3::image-occlusion:rect:left=.1235:top=0:width=1:height=.5:oi=0}}');
  });

  it('recognizes the built-in type and Anki’s, and nothing else', () => {
    expect(isImageOcclusion(IMAGE_OCCLUSION)).toBe(true);
    const anki = {
      ...CLOZE,
      id: 'anki-1',
      fields: ['Occlusion', 'Image', 'Header', 'Back Extra', 'Comments'],
      templates: [{ name: 'IO', front: '<script>anki.imageOcclusion.setup();</script>', back: '' }],
    };
    expect(isImageOcclusion(anki)).toBe(true);
    expect(isImageOcclusion(CLOZE)).toBe(false);
    expect(isImageOcclusion(BASIC)).toBe(false);
  });

  it('highlights this card’s masks on the front and reveals them on the back', () => {
    const card2 = renderCard(IMAGE_OCCLUSION, note(FIELD, 'Left ventricle'), 1);
    // Front: the rect (card 1) stays covered, both card-2 shapes are the question.
    expect(card2.front).toContain('<div class="io-header">The heart</div>');
    expect(card2.front).toContain('<img src="heart.png">');
    expect(card2.front).toMatch(/<rect class="io-inactive"/);
    expect(card2.front.match(/class="io-active"/g)).toHaveLength(2);
    expect(card2.front).toContain('viewBox="0 0 1 1"');
    expect(card2.front).not.toContain('Left ventricle');
    // Back: card-2 shapes become outlines; Back Extra follows.
    expect(card2.back.match(/class="io-revealed"/g)).toHaveLength(2);
    expect(card2.back).toMatch(/<rect class="io-inactive"/);
    expect(card2.back).toContain('Left ventricle');
  });

  it('leaves other masks off in hide-one mode, and marks pixel positions', () => {
    const one = renderCard(
      IMAGE_OCCLUSION,
      note(
        '{{c1::image-occlusion:rect:left=10:top=20:width=30:height=40:oi=0}}{{c2::image-occlusion:rect:left=50:top=20:width=30:height=40:oi=0}}',
      ),
      0,
    );
    expect(one.front.match(/<rect/g)).toHaveLength(1);
    expect(one.front).toContain('data-units="px"');
    expect(one.front).not.toContain('viewBox');
  });
});
