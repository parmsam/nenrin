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

  let rolloverHour = $state(4);
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
    rolloverHour = (await getPrefs(db)).rolloverHour;
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
    const blob = new Blob([JSON.stringify(await createBackup(db))], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = backupFilename();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    await db.settings.put({ key: 'lastBackupAt', value: Date.now() });
    status = 'Backup downloaded.';
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

<h3 class="section-title">Study day</h3>
<div class="panel">
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
  .ok {
    color: var(--good);
    font-weight: 600;
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
