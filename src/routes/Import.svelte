<script lang="ts">
  import { onMount } from 'svelte';
  import PackageImport from '../components/PackageImport.svelte';
  import { db, type NoteType } from '../lib/db';
  import { createDeck, deckTree, type DeckNode } from '../lib/db/decks';
  import {
    defaultMapping,
    importTextFile,
    type ColumnTarget,
    type DuplicateMode,
    type ImportResult,
  } from '../lib/import/apply';
  import { parseTextFile, SEPARATOR_LABELS, type TextFile } from '../lib/import/text';
  import { parseTags } from '../lib/notes';
  import { router } from '../lib/router.svelte';

  let noteTypes = $state<NoteType[]>([]);
  let decks = $state<DeckNode[]>([]);
  let fileName = $state('');
  /** Packages (.apkg / .colpkg, CrowdAnki .zip / deck.json) go to PackageImport; text files are handled here. */
  let packageFile = $state.raw<File | null>(null);
  let source = '';
  let file = $state.raw<TextFile | null>(null);
  let separator = $state('');
  let typeId = $state('basic');
  let deckId = $state('');
  let html = $state(false);
  let duplicates = $state<DuplicateMode>('update');
  let extraTags = $state('');
  let mapping = $state<ColumnTarget[]>([]);
  let result = $state.raw<ImportResult | null>(null);
  let busy = $state(false);
  let error = $state('');

  const noteType = $derived(noteTypes.find((t) => t.id === typeId));
  const hasDeckColumn = $derived(mapping.some((m) => m.kind === 'deck'));
  const hasTypeColumn = $derived(mapping.some((m) => m.kind === 'notetype'));
  const missingFirstField = $derived(
    !!noteType &&
      !hasTypeColumn &&
      !mapping.some((m) => m.kind === 'field' && m.name === noteType.fields[0]),
  );

  onMount(async () => {
    noteTypes = await db.noteTypes.toArray();
    decks = deckTree(await db.decks.toArray());
    const wanted = router.query.get('deck');
    deckId = decks.find((d) => d.id === wanted)?.id ?? decks[0]?.id ?? '';
  });

  const targetKey = (t: ColumnTarget) => (t.kind === 'field' ? `field:${t.name}` : t.kind);
  const fromKey = (key: string): ColumnTarget =>
    key.startsWith('field:')
      ? { kind: 'field', name: key.slice(6) }
      : ({ kind: key } as ColumnTarget);

  function load(sep?: string) {
    error = '';
    result = null;
    const parsed = parseTextFile(source, sep);
    if (parsed.rows.length === 0) {
      error = 'No rows found in this file.';
      file = null;
      return;
    }
    file = parsed;
    separator = parsed.separator;
    const h = parsed.headers;
    const presetType = h.notetype
      ? noteTypes.find((t) => t.id === h.notetype || t.name === h.notetype)
      : undefined;
    if (presetType) typeId = presetType.id;
    const presetDeck = h.deck
      ? decks.find((d) => d.id === h.deck || d.path.replace(/ \/ /g, '::') === h.deck)
      : undefined;
    if (presetDeck) deckId = presetDeck.id;
    html = h.html ?? false;
    mapping = defaultMapping(
      parsed,
      noteTypes.find((t) => t.id === typeId)!,
    );
  }

  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    fileName = f.name;
    if (/\.(apkg|colpkg|zip|json)$/i.test(f.name)) {
      file = null;
      error = '';
      packageFile = f;
      return;
    }
    packageFile = null;
    source = await f.text();
    load();
  }

  function changeType() {
    if (file && noteType) mapping = defaultMapping(file, noteType);
  }

  async function run() {
    if (!file || !noteType) return;
    busy = true;
    error = '';
    try {
      if (!deckId && !hasDeckColumn) deckId = (await createDeck(db, 'Default')).id;
      result = await importTextFile(db, file, {
        noteTypeId: typeId,
        deckId,
        mapping: $state.snapshot(mapping),
        html,
        duplicates,
        tags: parseTags(extraTags),
      });
      decks = deckTree(await db.decks.toArray());
    } catch (err) {
      error = `Import failed: ${(err as Error).message}`;
    } finally {
      busy = false;
    }
  }

  const columnName = (i: number) => file?.headers.columns?.[i] || `Column ${i + 1}`;
</script>

<nav class="crumbs muted" aria-label="Breadcrumb">
  <a href="#/">Decks</a> / <span aria-current="page">Import</span>
</nav>
<h2>Import</h2>

<section class="panel stack">
  <p>
    Import an <strong>Anki package</strong> (<strong>.apkg</strong> deck or
    <strong>.colpkg</strong> collection) with its media and, optionally, your review history.
  </p>
  <p>
    Or a <strong>CrowdAnki</strong> deck (a <strong>.zip</strong> of its folder, or just
    <strong>deck.json</strong>), the format of shared decks kept on GitHub such as
    <a href="https://github.com/anki-geo/ultimate-geography" target="_blank" rel="noreferrer"
      >Ultimate Geography</a
    >.
  </p>
  <p>
    Or a <strong>text file</strong> (<strong>.txt</strong>, <strong>.csv</strong>,
    <strong>.tsv</strong>) with fields separated by tabs, commas, semicolons or pipes. Files
    exported from Anki (“Notes in Plain Text”) keep their note types, decks, tags and GUIDs.
    <a href="https://docs.ankiweb.net/manual/importing/text-files" target="_blank" rel="noreferrer"
      >Format details</a
    >
  </p>
  <label class="button secondary file">
    {fileName ? `Chosen: ${fileName}` : 'Choose a file…'}
    <input
      type="file"
      accept=".apkg,.colpkg,.zip,.json,.txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values"
      onchange={pick}
    />
  </label>
</section>

{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if packageFile}
  {#key packageFile}<PackageImport file={packageFile} />{/key}
{/if}

{#if file && noteType}
  <h3 class="section-title">Options</h3>
  <div class="panel stack">
    <div class="grid2">
      <label>
        Separator
        <select bind:value={separator} onchange={() => load(separator)}>
          {#each Object.entries(SEPARATOR_LABELS) as [ch, label] (ch)}
            <option value={ch}>{label}</option>
          {/each}
        </select>
      </label>
      <label>
        Note type
        <select bind:value={typeId} onchange={changeType} disabled={hasTypeColumn}>
          {#each noteTypes as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </label>
      <label>
        Deck
        <select bind:value={deckId} disabled={hasDeckColumn}>
          {#if decks.length === 0}<option value="">Default (new deck)</option>{/if}
          {#each decks as d (d.id)}<option value={d.id}>{d.path}</option>{/each}
        </select>
      </label>
      <label>
        If a note already exists
        <select bind:value={duplicates}>
          <option value="update">Update it</option>
          <option value="skip">Skip it</option>
          <option value="duplicate">Import as a new note</option>
        </select>
      </label>
    </div>
    {#if hasTypeColumn}<p class="muted small">Note types come from a column in the file.</p>{/if}
    {#if hasDeckColumn}
      <p class="muted small">Decks come from a column in the file; missing decks are created.</p>
    {/if}
    <label class="check">
      <input type="checkbox" bind:checked={html} />
      Fields contain HTML
    </label>
    <label>
      Extra tags for every note
      <input bind:value={extraTags} placeholder="space separated" />
    </label>
  </div>

  <h3 class="section-title">Columns · {file.rows.length} rows</h3>
  <div class="panel table-wrap">
    <table>
      <thead>
        <tr>
          {#each mapping as target, i (i)}
            <th>
              <span class="col-name">{columnName(i)}</span>
              <select
                aria-label="Map {columnName(i)} to"
                value={targetKey(target)}
                onchange={(e) => (mapping[i] = fromKey(e.currentTarget.value))}
              >
                {#if !hasTypeColumn}
                  {#each noteType.fields as f (f)}<option value="field:{f}">{f}</option>{/each}
                {:else}
                  <option value="field:{noteType.fields[0]}">Field (by position)</option>
                {/if}
                <option value="tags">Tags</option>
                <option value="deck">Deck</option>
                <option value="notetype">Note type</option>
                <option value="guid">GUID</option>
                <option value="ignore">Ignore</option>
              </select>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each file.rows.slice(0, 5) as row, r (r)}
          <tr>
            {#each row as cell, c (c)}<td>{cell}</td>{/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if missingFirstField}
    <p class="error small">Map a column to “{noteType.fields[0]}”: notes need a first field.</p>
  {/if}

  <div class="row actions">
    <button onclick={run} disabled={busy || missingFirstField}>
      {busy
        ? 'Importing…'
        : `Import ${file.rows.length} ${file.rows.length === 1 ? 'note' : 'notes'}`}
    </button>
  </div>

  {#if result}
    <div class="panel stack result" role="status">
      <p>
        <strong>Done.</strong>
        {[`${result.added} added`, `${result.updated} updated`, `${result.skipped} skipped`].join(
          ' · ',
        )}
        {#if result.errors.length}
          · <span class="error">{result.errors.length} failed</span>
        {/if}
      </p>
      {#if result.errors.length}
        <ul class="small">
          {#each result.errors.slice(0, 10) as e (e.row)}
            <li>Row {e.row}: {e.message}</li>
          {/each}
          {#if result.errors.length > 10}<li>…and {result.errors.length - 10} more</li>{/if}
        </ul>
      {/if}
      <div><a class="button" href="#/">Go to decks</a></div>
    </div>
  {/if}
{/if}

<style>
  h2 {
    margin: 0.25rem 0 1rem;
  }
  .stack {
    display: grid;
    gap: 0.75rem;
  }
  .stack p {
    margin: 0;
  }
  .small {
    font-size: 0.85rem;
  }
  .grid2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 1rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .check input {
    width: auto;
  }
  .file {
    position: relative;
    display: inline-block;
    width: fit-content;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.7rem 1.3rem;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--text);
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .table-wrap {
    overflow-x: auto;
    padding: 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.875rem;
  }
  th,
  td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: top;
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  th {
    background: var(--surface-2);
    font-weight: 600;
  }
  th select {
    margin-top: 0.3rem;
    padding: 0.3rem 0.4rem;
    font-size: 0.8rem;
    min-width: 8rem;
  }
  .col-name {
    display: block;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .actions {
    margin: 1rem 0;
  }
  .result ul {
    margin: 0;
    padding-left: 1.2rem;
  }
</style>
