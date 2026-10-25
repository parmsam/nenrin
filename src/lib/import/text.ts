/**
 * Anki-compatible text import (.txt / .csv / .tsv).
 * Follows https://docs.ankiweb.net/manual/importing/text-files: separator sniffing, quoted fields,
 * `#` comment lines and `#key:value` file headers at the top of the file.
 */

export interface TextHeaders {
  separator?: string;
  html?: boolean;
  tags?: string[];
  columns?: string[];
  notetype?: string;
  deck?: string;
  /** 1-based column numbers, as in Anki. */
  notetypeColumn?: number;
  deckColumn?: number;
  tagsColumn?: number;
  guidColumn?: number;
}

export interface TextFile {
  headers: TextHeaders;
  separator: string;
  /** Whether the separator came from a header (vs. detected). */
  separatorFromHeader: boolean;
  columnCount: number;
  rows: string[][];
}

export const SEPARATOR_NAMES: Record<string, string> = {
  comma: ',',
  semicolon: ';',
  tab: '\t',
  space: ' ',
  pipe: '|',
  colon: ':',
};

export const SEPARATOR_LABELS: Record<string, string> = {
  '\t': 'Tab',
  ',': 'Comma',
  ';': 'Semicolon',
  '|': 'Pipe',
  ':': 'Colon',
  ' ': 'Space',
};

function parseSeparator(value: string): string | undefined {
  const v = value.trim();
  return SEPARATOR_NAMES[v.toLowerCase()] ?? (v.length === 1 ? v : value === ' ' ? ' ' : undefined);
}

function parseHeader(headers: TextHeaders, key: string, value: string): boolean {
  const num = () => {
    const n = Number.parseInt(value.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  switch (key.trim().toLowerCase()) {
    case 'separator':
      headers.separator = parseSeparator(value);
      return true;
    case 'html':
      headers.html = value.trim().toLowerCase() === 'true';
      return true;
    case 'tags':
      headers.tags = value.trim().split(/\s+/).filter(Boolean);
      return true;
    case 'columns':
      // Split later, once the separator is known.
      headers.columns = [value];
      return true;
    case 'notetype':
      headers.notetype = value.trim();
      return true;
    case 'deck':
      headers.deck = value.trim();
      return true;
    case 'notetype column':
      headers.notetypeColumn = num();
      return true;
    case 'deck column':
      headers.deckColumn = num();
      return true;
    case 'tags column':
      headers.tagsColumn = num();
      return true;
    case 'guid column':
      headers.guidColumn = num();
      return true;
    default:
      return false;
  }
}

/** Counts unquoted occurrences of each candidate separator in a line; the most frequent wins. */
export function sniffSeparator(line: string): string {
  const candidates = ['\t', ';', ',', '|'];
  const counts = new Map(candidates.map((c) => [c, 0]));
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  const [best, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : '\t';
}

/** RFC 4180-style parsing: quotes only open at the start of a field; "" escapes a quote. */
export function parseDelimited(body: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let atFieldStart = true;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (ch === sep) {
      row.push(field);
      field = '';
      atFieldStart = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      row.push(field);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
    } else {
      field += ch;
      atFieldStart = false;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

export function parseTextFile(text: string, separatorOverride?: string): TextFile {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const headers: TextHeaders = {};
  // Header and comment lines are only recognised at the top, so Markdown "# Heading"
  // content further down is safe.
  let start = 0;
  while (start < lines.length && (lines[start].startsWith('#') || lines[start].trim() === '')) {
    const m = lines[start].match(/^#([^:]+):(.*)$/);
    if (m) parseHeader(headers, m[1], m[2]);
    start++;
  }
  const body = lines.slice(start).join('\n');
  const separator = separatorOverride ?? headers.separator ?? sniffSeparator(lines[start] ?? '');
  if (headers.columns) headers.columns = headers.columns[0].split(separator).map((c) => c.trim());
  const parsed = parseDelimited(body, separator);
  // Like Anki: the first row decides the column count; short rows are padded, long ones cut.
  const columnCount = headers.columns?.length || parsed[0]?.length || 0;
  const rows = parsed.map((r) =>
    r.length >= columnCount
      ? r.slice(0, columnCount)
      : [...r, ...Array(columnCount - r.length).fill('')],
  );
  return {
    headers,
    separator,
    separatorFromHeader: !separatorOverride && !!headers.separator,
    columnCount,
    rows,
  };
}

/** Escapes plain text for storage as HTML, keeping line breaks. */
export function plainToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>');
}
