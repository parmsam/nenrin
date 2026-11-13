// Regenerates the Mac app's icons (src-tauri/icons/) from docs/brand/app-icon.svg.
// macOS icons sit inside a margin (an 824 px tile on a 1024 px canvas), so a full-bleed square
// looks oversized in the Dock. Widening the viewBox adds that margin without touching the brand file.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Must match bundle.icon in src-tauri/tauri.conf.json.
const KEEP = new Set(['32x32.png', '128x128.png', '128x128@2x.png', 'icon.icns', 'icon.png']);

const svg = readFileSync('docs/brand/app-icon.svg', 'utf8');
const padded = svg.replace('viewBox="0 0 512 512"', 'viewBox="-62 -62 636 636"');
if (padded === svg) throw new Error('app-icon.svg no longer has the expected 512 viewBox');

const dir = mkdtempSync(join(tmpdir(), 'nenrin-icon-'));
try {
  const src = join(dir, 'icon.svg');
  writeFileSync(src, padded);
  execFileSync('npx', ['tauri', 'icon', src, '-o', 'src-tauri/icons'], { stdio: 'inherit' });
  // Only the Mac build is set up; drop the Windows, Android and iOS sets the CLI also makes.
  for (const f of readdirSync('src-tauri/icons')) {
    if (!KEEP.has(f)) rmSync(join('src-tauri/icons', f), { recursive: true, force: true });
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
