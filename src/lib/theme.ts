/**
 * Appearance: light/dark/system mode and an accent palette, stored per device in localStorage.
 * index.html applies the same key before first paint to avoid a flash; keep the two in sync.
 */
export type ThemeMode = 'system' | 'light' | 'dark';
export type Palette = 'wood' | 'matcha' | 'sakura' | 'ai';

export interface Theme {
  mode: ThemeMode;
  palette: Palette;
}

export const THEME_KEY = 'nenrin:theme';
export const DEFAULT_THEME: Theme = { mode: 'system', palette: 'wood' };

export const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export const PALETTES: { id: Palette; label: string; kanji: string; swatch: string }[] = [
  { id: 'wood', label: 'Wood', kanji: '木', swatch: '#b35a24' },
  { id: 'matcha', label: 'Matcha', kanji: '抹茶', swatch: '#4a7424' },
  { id: 'sakura', label: 'Sakura', kanji: '桜', swatch: '#b03e63' },
  { id: 'ai', label: 'Indigo', kanji: '藍', swatch: '#2f4f8f' },
];

export function loadTheme(): Theme {
  try {
    const saved = JSON.parse(localStorage.getItem(THEME_KEY) ?? '{}') as Partial<Theme>;
    return {
      mode: MODES.some((m) => m.id === saved.mode) ? saved.mode! : DEFAULT_THEME.mode,
      palette: PALETTES.some((p) => p.id === saved.palette)
        ? saved.palette!
        : DEFAULT_THEME.palette,
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme.mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme.mode);
  if (theme.palette === 'wood') root.removeAttribute('data-palette');
  else root.setAttribute('data-palette', theme.palette);
}

export function saveTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    // Storage unavailable (private mode): the choice lasts for this session only.
  }
}
