import { describe, expect, it } from 'vitest';
import { fileAccept, importKind } from './files';

describe('importKind', () => {
  it('sorts files by extension, ignoring case', () => {
    expect(importKind('Japanese.apkg')).toBe('package');
    expect(importKind('collection.COLPKG')).toBe('package');
    expect(importKind('deck.json')).toBe('package');
    expect(importKind('ultimate-geography.zip')).toBe('package');
    expect(importKind('words.csv')).toBe('text');
    expect(importKind('Notes.TXT')).toBe('text');
    expect(importKind('words.tsv')).toBe('text');
  });

  it('rejects anything else', () => {
    expect(importKind('photo.jpg')).toBeNull();
    expect(importKind('apkg')).toBeNull();
    expect(importKind('deck.apkg.pdf')).toBeNull();
  });
});

describe('fileAccept', () => {
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';

  it('filters on desktop', () => {
    expect(fileAccept({ userAgent: mac, maxTouchPoints: 0 })).toContain('.apkg');
  });

  it('shows every file on iPhone and iPad', () => {
    expect(fileAccept({ userAgent: iphone, maxTouchPoints: 5 })).toBeUndefined();
    expect(fileAccept({ userAgent: mac, maxTouchPoints: 5 })).toBeUndefined();
  });
});
