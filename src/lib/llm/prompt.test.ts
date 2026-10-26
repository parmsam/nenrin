import { describe, expect, it } from 'vitest';
import { parsePastedCards } from '../notes/paste';
import { cardPrompt, CARD_RULES, skillMarkdown } from './prompt';

/** The example blocks in the rules, exactly as an LLM would copy them. */
const examples = [...CARD_RULES.matchAll(/^````markdown\n[\s\S]*?\n````$/gm)].map((m) => m[0]);

describe('LLM prompt', () => {
  it('shows examples that the paste parser reads as promised', () => {
    expect(examples).toHaveLength(2);
    const qa = parsePastedCards(examples[0]);
    expect(qa.map((c) => [c.kind, c.front, c.tags])).toEqual([
      ['basic', 'What does FSRS stand for?', ['memory', 'fsrs']],
      ['basic', 'Why do spaced reviews beat cramming?', ['memory', 'fsrs']],
    ]);
    const cloze = parsePastedCards(examples[1]);
    expect(cloze).toHaveLength(2);
    expect(cloze.every((c) => c.kind === 'cloze')).toBe(true);
    expect(cloze[0].tags).toEqual(['biology', 'geography']);
  });

  it('builds a prompt and a skill with valid front matter', () => {
    expect(cardPrompt()).toContain('[Paste your notes');
    const skill = skillMarkdown();
    expect(skill).toMatch(/^---\nname: nenrin-cards\ndescription: .+\n---\n/);
    expect(skill).toContain('Q: What does FSRS stand for?');
  });
});
