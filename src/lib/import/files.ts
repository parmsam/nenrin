/** Which importer handles a chosen or dropped file, judged by its name. */

const PACKAGE = /\.(apkg|colpkg|zip|json)$/i;
const TEXT = /\.(txt|csv|tsv)$/i;

export type ImportKind = 'package' | 'text';

export function importKind(name: string): ImportKind | null {
  if (PACKAGE.test(name)) return 'package';
  if (TEXT.test(name)) return 'text';
  return null;
}

const ACCEPT =
  '.apkg,.colpkg,.zip,.json,.txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values';

/**
 * The file picker's `accept` filter. iOS maps it to known file types, and has none for
 * .apkg or .colpkg, so it greys those files out in Files and iCloud Drive. There the
 * picker shows everything and `importKind` turns away what we can't read.
 */
export function fileAccept(
  nav: { userAgent: string; maxTouchPoints: number } = navigator,
): string | undefined {
  const iOS =
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    // iPadOS asks for desktop sites and reports itself as a Mac with a touch screen.
    (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
  return iOS ? undefined : ACCEPT;
}
