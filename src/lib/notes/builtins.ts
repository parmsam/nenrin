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

export const BUILTIN_NOTE_TYPES: readonly NoteType[] = [BASIC, BASIC_REVERSED, CLOZE];
