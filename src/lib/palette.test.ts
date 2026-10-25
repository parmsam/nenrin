import { describe, expect, it } from 'vitest';
import { fuzzyScore, rankCommands, type Command } from './palette.svelte';

const cmd = (id: string, label: string, keywords?: string): Command => ({
  id,
  label,
  group: 'Test',
  keywords,
  run: () => {},
});

describe('command palette matching', () => {
  it('matches subsequences and rejects missing letters', () => {
    expect(fuzzyScore('stt', 'Stats')).toBeGreaterThan(0);
    expect(fuzzyScore('xyz', 'Stats')).toBe(-1);
    expect(fuzzyScore('', 'Anything')).toBe(0);
  });

  it('prefers word starts and consecutive letters', () => {
    expect(fuzzyScore('st', 'Study Japanese')).toBeGreaterThan(fuzzyScore('st', 'Browse notes'));
    expect(fuzzyScore('exp', 'Export backup')).toBeGreaterThan(
      fuzzyScore('exp', 'Expand the deck'),
    );
  });

  it('ranks commands, using keywords too', () => {
    const commands = [
      cmd('a', 'Browse notes'),
      cmd('b', 'Theme: Dark', 'night mode'),
      cmd('c', 'Study Japanese'),
    ];
    expect(rankCommands(commands, 'stud').map((c) => c.id)).toEqual(['c']);
    expect(rankCommands(commands, 'night')[0].id).toBe('b');
    expect(rankCommands(commands, 'zzz')).toEqual([]);
  });

  it('shows recent commands first when the query is empty', () => {
    const commands = [cmd('a', 'A'), cmd('b', 'B'), cmd('c', 'C')];
    expect(rankCommands(commands, '', ['c', 'a']).map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
});
