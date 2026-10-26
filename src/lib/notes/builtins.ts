import type { NoteType } from '../db/types';

const ANSWER = '<hr id="answer">';

export const BASIC: NoteType = {
  id: 'basic',
  name: 'Basic',
  kind: 'basic',
  fields: ['Front', 'Back'],
  templates: [{ name: 'Card 1', front: '{{Front}}', back: `{{FrontSide}}${ANSWER}{{Back}}` }],
  css: '',
};

export const BASIC_REVERSED: NoteType = {
  id: 'basic-reversed',
  name: 'Basic (and reversed card)',
  kind: 'basic',
  fields: ['Front', 'Back'],
  templates: [
    { name: 'Card 1', front: '{{Front}}', back: `{{FrontSide}}${ANSWER}{{Back}}` },
    { name: 'Card 2', front: '{{Back}}', back: `{{FrontSide}}${ANSWER}{{Front}}` },
  ],
  css: '',
};

/** Like Basic (and reversed card), but the reverse card is made only when "Add Reverse" has text. */
export const BASIC_OPTIONAL_REVERSED: NoteType = {
  id: 'basic-optional-reversed',
  name: 'Basic (optional reversed card)',
  kind: 'basic',
  fields: ['Front', 'Back', 'Add Reverse'],
  templates: [
    { name: 'Card 1', front: '{{Front}}', back: `{{FrontSide}}${ANSWER}{{Back}}` },
    {
      name: 'Card 2',
      front: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}',
      back: `{{FrontSide}}${ANSWER}{{Front}}`,
    },
  ],
  css: '',
};

export const BASIC_TYPE: NoteType = {
  id: 'basic-type',
  name: 'Basic (type in the answer)',
  kind: 'basic',
  fields: ['Front', 'Back'],
  templates: [
    {
      name: 'Card 1',
      front: '{{Front}}\n\n{{type:Back}}',
      back: `{{Front}}${ANSWER}{{type:Back}}`,
    },
  ],
  css: '',
};

export const CLOZE: NoteType = {
  id: 'cloze',
  name: 'Cloze',
  kind: 'cloze',
  fields: ['Text', 'Back Extra'],
  templates: [
    {
      name: 'Cloze',
      front: '{{cloze:Text}}',
      back: `{{cloze:Text}}{{#Back Extra}}${ANSWER}{{Back Extra}}{{/Back Extra}}`,
    },
  ],
  css: '',
};

/**
 * Masks over an image, one card per mask. Same fields and Occlusion format as Anki's, so
 * notes import and export cleanly. Cards are drawn by render/occlusion.ts, not the template;
 * the template is only what other apps would show.
 */
export const IMAGE_OCCLUSION: NoteType = {
  id: 'image-occlusion',
  name: 'Image Occlusion',
  kind: 'cloze',
  fields: ['Occlusion', 'Image', 'Header', 'Back Extra', 'Comments'],
  templates: [
    {
      name: 'Image Occlusion',
      // The image-occlusion class also marks clones of this type as image occlusion.
      front:
        '{{#Header}}<div>{{Header}}</div>{{/Header}}<div class="image-occlusion">{{cloze:Occlusion}}{{Image}}</div>',
      back: `{{#Header}}<div>{{Header}}</div>{{/Header}}<div class="image-occlusion">{{cloze:Occlusion}}{{Image}}</div>${ANSWER}{{Back Extra}}`,
    },
  ],
  css: '',
};

export const BUILTIN_NOTE_TYPES: readonly NoteType[] = [
  BASIC,
  BASIC_REVERSED,
  BASIC_OPTIONAL_REVERSED,
  BASIC_TYPE,
  CLOZE,
  IMAGE_OCCLUSION,
];
