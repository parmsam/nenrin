<script lang="ts">
  import { liveQuery } from 'dexie';
  import { onMount } from 'svelte';
  import { db } from '../lib/db';
  import {
    backupFilename,
    createBackup,
    InvalidBackupError,
    parseBackup,
    restoreBackup,
  } from '../lib/db/backup';
  import { getPrefs, setPrefs } from '../lib/db/prefs';
  import { downloadFile } from '../lib/download';
  import { exportNotesText, textExportFilename } from '../lib/export/text';
  import { loadTheme, MODES, PALETTES, saveTheme } from '../lib/theme';

  let theme = $state(loadTheme());
  $effect(() => saveTheme({ mode: theme.mode, palette: theme.palette }));

  let rolloverHour = $state(4);
  let autoplayAudio = $state(true);
  let deckStyling = $state(true);
  let persisted = $state<boolean | null>(null);
  let usage = $state('');
  let status = $state('');
  let error = $state('');

  const lastBackup = liveQuery(
    async () => (await db.settings.get('lastBackupAt'))?.value as number | undefined,
  );

  const hourLabel = (h: number) =>
    new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });

  onMount(async () => {
    const prefs = await getPrefs(db);
    rolloverHour = prefs.rolloverHour;
    autoplayAudio = prefs.autoplayAudio;
    deckStyling = prefs.deckStyling;
    await refreshStorage();
  });

  async function refreshStorage() {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
    const est = await navigator.storage?.estimate?.();
    if (est?.usage !== undefined) usage = `${(est.usage / 1024 / 1024).toFixed(1)} MB used`;
  }

  async function saveRollover() {
    await setPrefs(db, { rolloverHour: Number(rolloverHour) });
    status = 'Saved.';
  }

  async function requestPersist() {
    persisted = (await navigator.storage?.persist?.()) ?? null;
    if (!persisted) {
      status = 'The browser declined. Installing Nenrin as an app usually helps.';
    }
  }

  async function exportBackup() {
    error = '';
    downloadFile(JSON.stringify(await createBackup(db)), backupFilename(), 'application/json');
    await db.settings.put({ key: 'lastBackupAt', value: Date.now() });
    status = 'Backup downloaded.';
  }

  async function exportAllText() {
    downloadFile(await exportNotesText(db), textExportFilename(), 'text/plain;charset=utf-8');
    status = 'Notes exported.';
  }

  async function importBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    error = '';
    status = '';
    try {
      const backup = parseBackup(await file.text());
      const when = new Date(backup.exportedAt).toLocaleString();
      const n = backup.data.cards.length;
      if (
        !confirm(`Replace everything on this device with the backup from ${when} (${n} cards)?`)
      ) {
        return;
      }
      await restoreBackup(db, backup);
      rolloverHour = (await getPrefs(db)).rolloverHour;
      status = `Restored ${n} cards.`;
    } catch (err) {
      error = err instanceof InvalidBackupError ? err.message : `Restore failed: ${err}`;
    }
  }

  function ago(ts: number) {
    const days = Math.floor((Date.now() - ts) / 86_400_000);
    return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  }
</script>

<nav class="crumbs muted"><a href="#/">← Decks</a></nav>
<h2>Settings</h2>

{#if status}<p class="ok" role="status">{status}</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<h3 class="section-title">Appearance</h3>
<div class="panel stack">
  <fieldset>
    <legend>Theme</legend>
    <div class="segmented">
      {#each MODES as m (m.id)}
        <label class:checked={theme.mode === m.id}>
          <input type="radio" name="mode" value={m.id} bind:group={theme.mode} />
          {m.label}
        </label>
      {/each}
    </div>
  </fieldset>
  <fieldset>
    <legend>Accent</legend>
    <div class="swatches">
      {#each PALETTES as p (p.id)}
        <label class:checked={theme.palette === p.id} style:--swatch={p.swatch}>
          <input type="radio" name="palette" value={p.id} bind:group={theme.palette} />
          <span class="dot" aria-hidden="true"></span>
          <span>{p.label} <span class="muted" lang="ja">{p.kanji}</span></span>
        </label>
      {/each}
    </div>
  </fieldset>
</div>

<h3 class="section-title">Studying</h3>
<div class="panel stack">
  <label class="check">
    <input
      type="checkbox"
      bind:checked={autoplayAudio}
      onchange={() => setPrefs(db, { autoplayAudio })}
    />
    Play audio automatically <span class="muted small">(press R to replay)</span>
  </label>
  <label class="check">
    <input
      type="checkbox"
      bind:checked={deckStyling}
      onchange={() => setPrefs(db, { deckStyling })}
    />
    Use each deck’s own styling
    <span class="muted small">(for imported decks; kept inside the card)</span>
  </label>

  <label>
    Next day starts at
    <select bind:value={rolloverHour} onchange={saveRollover}>
      {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
        <option value={h}>{hourLabel(h)}</option>
      {/each}
    </select>
  </label>
  <p class="hint muted">
    Reviews after midnight still count toward the previous day until this hour.
  </p>
</div>

<h3 class="section-title">Backup</h3>
<div class="panel stack">
  <p>
    Your cards live only in this browser. Export a backup regularly. On iPhone, choose <em
      >Save to Files</em
    > to keep it in iCloud Drive.
  </p>
  <p class="muted">
    Last backup: {$lastBackup ? ago($lastBackup) : 'never'}
  </p>
  <div class="row">
    <button onclick={exportBackup}>Export backup</button>
    <label class="button secondary file">
      Restore from file…
      <input type="file" accept="application/json,.json" onchange={importBackup} />
    </label>
  </div>
</div>

<h3 class="section-title">Import and export</h3>
<div class="panel stack">
  <p>
    Move notes in and out as text files that Anki also reads and writes (tab-separated, with note
    type, deck, tags and GUID columns).
  </p>
  <div class="row">
    <a class="button secondary" href="#/import">Import .txt / .csv…</a>
    <button class="secondary" onclick={exportAllText}>Export all notes (.txt)</button>
  </div>
</div>

<h3 class="section-title">Storage</h3>
<div class="panel stack">
  <p>
    {#if persisted}
      ✓ Persistent storage is on. The browser won’t clear your data to free up space.
    {:else}
      Storage is <strong>best-effort</strong>: the browser may clear it if space runs low.
    {/if}
    {#if usage}<span class="muted">({usage})</span>{/if}
  </p>
  {#if !persisted}
    <div>
      <button class="secondary" onclick={requestPersist}>Ask for persistent storage</button>
    </div>
  {/if}
  <p class="muted small">
    Sync across devices (via your own Dropbox, Google Drive, or iCloud) is on the roadmap.
  </p>
</div>

<h3 class="section-title">About</h3>
<div class="panel stack">
  <p>
    <strong>Nenrin v{__APP_VERSION__}</strong> <span class="muted">(pre-alpha)</span>
  </p>
  <p class="small">
    Scheduling uses <a
      href="https://en.wikipedia.org/wiki/Spaced_repetition#Algorithms"
      target="_blank"
      rel="noreferrer">FSRS</a
    >, a modern
    <a href="https://en.wikipedia.org/wiki/Spaced_repetition" target="_blank" rel="noreferrer"
      >spaced repetition</a
    > algorithm that predicts when you'll forget each card.
  </p>
  <p class="muted small">
    Free and open source under the MIT license.
    <a
      href="https://github.com/parmsam/nenrin/blob/main/CHANGELOG.md"
      target="_blank"
      rel="noreferrer">What’s new</a
    >
    ·
    <a href="https://github.com/parmsam/nenrin" target="_blank" rel="noreferrer">Source</a>
    ·
    <a href="https://github.com/parmsam/nenrin/issues" target="_blank" rel="noreferrer"
      >Report a problem</a
    >
  </p>
</div>

<style>
  .crumbs {
    font-size: 0.875rem;
  }
  h2 {
    margin: 0.25rem 0 0.5rem;
  }
  .stack {
    display: grid;
    gap: 0.75rem;
  }
  .stack p {
    margin: 0;
  }
  .hint,
  .small {
    font-size: 0.8rem;
    margin: 0.5rem 0 0;
  }
  .check {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-weight: 600;
  }
  .check input {
    width: auto;
  }
  .ok {
    color: var(--good);
    font-weight: 600;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  legend {
    font-weight: 600;
    font-size: 0.9rem;
    padding: 0;
    margin-bottom: 0.5rem;
  }
  .segmented {
    display: inline-flex;
    padding: 3px;
    border-radius: 12px;
    background: var(--surface-2);
    width: fit-content;
  }
  .segmented label,
  .swatches label {
    position: relative;
    font-weight: 600;
    cursor: pointer;
  }
  .segmented label {
    display: block;
    padding: 0.45rem 1rem;
    border-radius: 9px;
    color: var(--muted);
  }
  .segmented label.checked {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
  }
  .segmented input,
  .swatches input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .segmented label:has(input:focus-visible),
  .swatches label:has(input:focus-visible) {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .swatches label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.8rem 0.45rem 0.55rem;
    border: 1px solid var(--border);
    border-radius: 999px;
  }
  .swatches label.checked {
    border-color: var(--swatch);
    box-shadow: inset 0 0 0 1px var(--swatch);
  }
  .dot {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    background: var(--swatch);
  }
  .file {
    display: inline-block;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.7rem 1.3rem;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--text);
  }
  .file input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
</style>
