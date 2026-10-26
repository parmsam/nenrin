// Compatibility check against real-world Anki decks, in real Chromium.
//
//   npm run check:decks -- ref/decks            (a folder of .apkg / .colpkg / CrowdAnki .zip files)
//
// Runs the app's own code through the Vite dev server: parses each package in the import
// worker, imports it into a fresh IndexedDB database, and renders every card with the real
// sanitizer. Reports unrendered template tags, missing media, empty fronts, errors and timing.
// (Fake DOMs are not used: jsdom and happy-dom both leak memory on large cards.)
import { spawn } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const dir = resolve(process.argv[2] ?? 'ref/decks');
const reportPath = process.argv[3];
const files = readdirSync(dir)
  .filter((f) => /\.(apkg|colpkg|zip)$/i.test(f))
  .sort();
if (files.length === 0) {
  console.error(`No .apkg/.colpkg/.zip files in ${dir}`);
  process.exit(1);
}

const port = 4190;
const base = `http://localhost:${port}`;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
  detached: true,
});
const up = () =>
  fetch(base).then(
    () => true,
    () => false,
  );

const reports = [];
try {
  for (let i = 0; i < 100 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
  const browser = await chromium.launch();
  for (const file of files) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error(`  page error: ${e.message}`));
    await page.goto(base);
    const url = `/@fs${join(dir, file)}`;
    process.stdout.write(`${file} (${(statSync(join(dir, file)).size / 1e6).toFixed(1)} MB)… `);
    const report = await page.evaluate(async (url) => {
      const { parsePackageInWorker } = await import('/src/lib/anki/parse-in-worker.ts');
      const { importAnkiPackage } = await import('/src/lib/anki/import.ts');
      const { NenrinDB } = await import('/src/lib/db/index.ts');
      const { ensureBuiltins } = await import('/src/lib/notes/index.ts');
      const { mediaRefs, renderCard, stripHtml } = await import('/src/lib/render/index.ts');
      const { studyState } = await import('/src/lib/study/queue.ts');

      const r = { leftoverTags: {}, missingMedia: [], emptyFronts: 0, errors: [], samples: [] };
      let t = performance.now();
      const blob = await (await fetch(url)).blob();
      const pkg = await parsePackageInWorker(new File([blob], url.split('/').pop()));
      r.parseMs = Math.round(performance.now() - t);
      Object.assign(r, {
        format: pkg.format,
        noteTypes: pkg.noteTypes.map((n) => `${n.name} (${n.kind}, ${n.templates.length} tpl)`),
        notes: pkg.notes.length,
        cards: pkg.cards.length,
        revlog: pkg.revlog.length,
        media: pkg.media.length,
      });

      const db = new NenrinDB(`deck-check-${crypto.randomUUID()}`);
      try {
        await ensureBuiltins(db);
        t = performance.now();
        const result = await importAnkiPackage(db, pkg, { scheduling: true });
        r.importMs = Math.round(performance.now() - t);
        r.cardsAdded = result.cardsAdded;
        const types = new Map((await db.noteTypes.toArray()).map((n) => [n.id, n]));
        const notes = new Map((await db.notes.toArray()).map((n) => [n.id, n]));
        const media = new Set(await db.media.toCollection().primaryKeys());
        const missing = new Set();
        t = performance.now();
        for (const card of await db.cards.toArray()) {
          const note = notes.get(card.noteId);
          try {
            const out = renderCard(types.get(note.noteTypeId), note, card.ordinal);
            for (const html of [out.front, out.back]) {
              for (const m of html.matchAll(/\{\{[^}]*\}\}/g)) {
                r.leftoverTags[m[0]] = (r.leftoverTags[m[0]] ?? 0) + 1;
              }
              for (const ref of mediaRefs(html)) if (!media.has(ref)) missing.add(ref);
            }
            if (!stripHtml(out.front).trim() && !/<(img|audio)/.test(out.front)) r.emptyFronts++;
            if (r.samples.length < 2) r.samples.push({ front: out.front, back: out.back });
          } catch (err) {
            if (r.errors.length < 10) r.errors.push(String(err));
          }
        }
        r.renderMs = Math.round(performance.now() - t);
        r.missingMedia = [...missing].slice(0, 20);
        r.queue = { new: 0, learning: 0, review: 0 };
        for (const root of (await db.decks.toArray()).filter((d) => !d.parentId)) {
          const { counts } = await studyState(db, root.id);
          for (const k of Object.keys(counts)) r.queue[k] += counts[k];
        }
        r.heapMB = Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6);
      } finally {
        await db.delete();
      }
      return r;
    }, url);
    reports.push({ file, ...report });
    const ok = report.errors.length === 0 && report.cardsAdded === report.cards;
    console.log(
      `${ok ? 'ok' : 'PROBLEMS'}: ${report.notes} notes, ${report.cards} cards, ${report.media} media; ` +
        `parse ${report.parseMs} ms, import ${report.importMs} ms, render ${report.renderMs} ms`,
    );
    const tags = Object.keys(report.leftoverTags);
    if (tags.length) console.log(`  leftover template tags: ${tags.slice(0, 8).join(' ')}`);
    if (report.missingMedia.length)
      console.log(`  missing media: ${report.missingMedia.slice(0, 5).join(', ')}`);
    if (report.emptyFronts) console.log(`  empty fronts: ${report.emptyFronts}`);
    for (const e of report.errors) console.log(`  error: ${e}`);
    await page.close();
  }
  await browser.close();
} finally {
  process.kill(-server.pid);
  if (reportPath) writeFileSync(reportPath, JSON.stringify(reports, null, 2));
}
console.log(`\nChecked ${reports.length} deck(s) from ${relative(process.cwd(), dir) || '.'}`);
