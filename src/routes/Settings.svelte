<script lang="ts">
  import { liveQuery } from 'dexie';
  import { onMount } from 'svelte';
  import { db } from '../lib/db';
  import { InvalidBackupError, parseBackup, restoreBackup } from '../lib/db/backup';
  import { getPrefs, setPrefs } from '../lib/db/prefs';
  import {
    copyCardPrompt,
    downloadCardSkill,
    exportBackup as exportBackupFile,
  } from '../lib/actions';
  import { cardPrompt } from '../lib/llm/prompt';
  import { disableTypst, enableTypst, typstEnabled } from '../lib/render/typst';
  import {
    enableNotifications,
    canNotify,
    hasBackgroundCheck,
    notifyPermission,
    reminderIcs,
    scheduleReminder,
  } from '../lib/reminder';
  import { downloadFile } from '../lib/download';
  import { exportNotesText, textExportFilename } from '../lib/export/text';
  import { headerPrefs, setHelpButton } from '../lib/header.svelte';
  import { setSplashEnabled, splashEnabled } from '../lib/splash';
  import { loadTheme, MODES, PALETTES, saveTheme } from '../lib/theme';

  let theme = $state(loadTheme());
  let showSplash = $state(splashEnabled());
  $effect(() => saveTheme({ mode: theme.mode, palette: theme.palette }));

  let rolloverHour = $state(4);
  let autoplayAudio = $state(true);
  let deckStyling = $state(true);
  let persisted = $state<boolean | null>(null);
  let usage = $state('');
  let status = $state('');
  let promptNote = $state('');
  let promptBox: HTMLTextAreaElement | undefined = $state();

  async function copyPrompt() {
    if (await copyCardPrompt()) promptNote = 'Prompt copied. Paste it into your LLM.';
    else {
      // Clipboard blocked: select the text so ⌘C / Ctrl+C works.
      promptBox?.closest('details')?.setAttribute('open', '');
      promptBox?.select();
      promptNote = 'Copy the selected text.';
    }
  }
  let error = $state('');

  const lastBackup = liveQuery(
    async () => (await db.settings.get('lastBackupAt'))?.value as number | undefined,
  );

  const hourLabel = (h: number) =>
    new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });

  let typstOn = $state(typstEnabled());
  let typstProgress = $state<number | null>(null);
  let typstNote = $state('');

  async function turnOnTypst() {
    typstNote = '';
    typstProgress = 0;
    try {
      await enableTypst((p) => (typstProgress = p));
      typstOn = true;
      typstNote = 'Typst is ready, and works offline from now on.';
    } catch (err) {
      typstNote = `Download failed: ${(err as Error).message}. Check your connection and try again.`;
    } finally {
      typstProgress = null;
    }
  }

  async function turnOffTypst() {
    await disableTypst();
    typstOn = false;
    typstNote = 'Typst removed from this device.';
  }

  let reminderTime = $state('19:00');
  let reminderNotify = $state(false);
  let reminderNote = $state('');
  let backgroundCheck = $state(false);
  const support = canNotify();

  async function saveReminder() {
    await setPrefs(db, { reminderTime, reminderNotify });
    scheduleReminder(reminderTime, reminderNotify);
  }

  async function toggleNotify() {
    if (reminderNotify && !(await enableNotifications())) {
      reminderNotify = false;
      reminderNote =
        (await notifyPermission()) === 'denied'
          ? 'Notifications are blocked for this site. Allow them in your browser’s site settings.'
          : 'Notifications weren’t allowed.';
      await saveReminder();
    } else {
      await saveReminder();
      reminderNote = reminderNotify ? 'Notifications on.' : '';
    }
  }

  function addToCalendar() {
    const url = new URL(import.meta.env.BASE_URL, location.origin).href;
    downloadFile(reminderIcs(reminderTime, url), 'nenrin-reminder.ics', 'text/calendar');
    reminderNote = 'Open the downloaded file to add the daily reminder to your calendar.';
  }

  onMount(async () => {
    const prefs = await getPrefs(db);
    rolloverHour = prefs.rolloverHour;
    autoplayAudio = prefs.autoplayAudio;
    deckStyling = prefs.deckStyling;
    reminderTime = prefs.reminderTime;
    reminderNotify = prefs.reminderNotify && support && (await notifyPermission()) === 'granted';
    backgroundCheck = await hasBackgroundCheck();
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
    await exportBackupFile();
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

<nav class="crumbs muted" aria-label="Breadcrumb">
  <a href="#/">Decks</a> / <span aria-current="page">Settings</span>
</nav>
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
  <label class="check">
    <input
      type="checkbox"
      bind:checked={showSplash}
      onchange={() => setSplashEnabled(showSplash)}
    />
    <span class="label-text">Show welcome screen when opening Nenrin</span>
  </label>
  <label class="check">
    <input
      type="checkbox"
      checked={headerPrefs.helpButton}
      onchange={(e) => setHelpButton(e.currentTarget.checked)}
    />
    <span class="label-text"
      >Show the Help button in the header
      <span class="muted small">(the guide is also in the footer and the command palette)</span
      ></span
    >
  </label>
</div>

<h3 class="section-title">Studying</h3>
<div class="panel stack">
  <label class="check">
    <input
      type="checkbox"
      bind:checked={autoplayAudio}
      onchange={() => setPrefs(db, { autoplayAudio })}
    />
    <span class="label-text"
      >Play audio automatically <span class="muted small">(press R to replay)</span></span
    >
  </label>
  <label class="check">
    <input
      type="checkbox"
      bind:checked={deckStyling}
      onchange={() => setPrefs(db, { deckStyling })}
    />
    <span class="label-text"
      >Use each deck’s own styling
      <span class="muted small">(for imported decks; kept inside the card)</span></span
    >
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

<h3 class="section-title" id="reminders">Study reminder</h3>
<div class="panel stack">
  <label class="inline">
    Remind me at
    <input type="time" bind:value={reminderTime} onchange={saveReminder} required />
  </label>
  <div class="row">
    <button class="secondary" onclick={addToCalendar}>Add to calendar</button>
  </div>
  <p class="hint muted">
    A daily event with an alert, in whatever calendar app you use. The most reliable reminder,
    especially on iPhone.
  </p>
  {#if support}
    <label class="check">
      <input type="checkbox" bind:checked={reminderNotify} onchange={toggleNotify} />
      <span class="label-text">Also notify me when cards are due and I haven’t studied yet</span>
    </label>
    <p class="hint muted">
      {backgroundCheck
        ? 'Works while Nenrin is open in the background; as an installed app, the browser may also check now and then when it’s closed.'
        : 'Works while Nenrin is open (for example in a background tab). Nenrin has no server, so it can’t wake your device when it’s closed; use the calendar for that.'}
    </p>
  {/if}
  {#if reminderNote}<p class="muted" role="status">{reminderNote}</p>{/if}
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

<h3 class="section-title" id="typst">Typst</h3>
<div class="panel stack">
  <p>
    Cards can hold <a href="https://typst.app/docs/" target="_blank" rel="noreferrer">Typst</a> in a
    <code>```typst</code> block, for math and layouts beyond what LaTeX math covers. Its compiler is large,
    so it’s off until you turn it on, per device.
  </p>
  <div class="row">
    {#if typstOn}
      <button class="secondary" onclick={turnOffTypst}>Remove Typst (frees about 32 MB)</button>
    {:else}
      <button onclick={turnOnTypst} disabled={typstProgress !== null}>
        {typstProgress === null
          ? 'Enable Typst (one-time download, about 32 MB)'
          : `Downloading… ${Math.round(typstProgress * 100)}%`}
      </button>
    {/if}
    {#if typstNote}<span class="muted" role="status">{typstNote}</span>{/if}
  </div>
</div>

<h3 class="section-title" id="llm">Make cards with an LLM</h3>
<div class="panel stack">
  <p>
    Ask ChatGPT, Claude, Gemini or any other LLM to write cards in a format Nenrin reads. Copy the
    prompt, add your notes or a topic at the end, then paste the reply into <a href="#/add"
      >Add cards → Paste</a
    >. Nenrin itself never sends anything to an AI.
  </p>
  <div class="row">
    <button onclick={copyPrompt}>Copy prompt</button>
    <button class="secondary" onclick={downloadCardSkill}>Download skill (.zip)</button>
    {#if promptNote}<span class="muted" role="status">{promptNote}</span>{/if}
  </div>
  <p class="hint muted">
    The skill holds the same instructions for tools that load
    <a href="https://agentskills.io" rel="noopener">Agent Skills</a>: upload the zip in Claude’s
    settings, or unzip it into <code>~/.claude/skills/</code> for Claude Code. Then just ask for flashcards.
  </p>
  <details>
    <summary>Show the prompt</summary>
    <textarea
      bind:this={promptBox}
      readonly
      rows="14"
      aria-label="Prompt for an LLM"
      value={cardPrompt()}></textarea>
  </details>
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

<h3 class="section-title">Help</h3>
<div class="panel stack">
  <p>
    The <a href="#/help">user guide</a> covers getting started, studying, making cards, moving from Anki,
    keyboard shortcuts and backups. It works offline.
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
  /* Checkbox, then its text; long text wraps beside the box, not under it. */
  .check {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    font-weight: 600;
  }
  .check input {
    width: auto;
    flex: none;
    transform: translateY(0.1em);
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
  .inline {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .inline input {
    width: auto;
  }
  textarea[readonly] {
    margin-top: 0.5rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
    line-height: 1.45;
  }
</style>
