<script lang="ts">
  import { onMount } from 'svelte';
  import CardView from '../components/CardView.svelte';
  import { db, type Note, type NoteType } from '../lib/db';
  import { confirmAction } from '../lib/confirm.svelte';
  import {
    applyDraft,
    cloneNoteType,
    copyName,
    deleteNoteType,
    draftFrom,
    draftProblem,
    isBuiltin,
    previewNoteTypeChange,
    renameFieldRefs,
    sampleNote,
    saveNoteType,
    type NoteTypeDraft,
  } from '../lib/notes/notetypes';
  import { renderCard } from '../lib/render';
  import { isImageOcclusion } from '../lib/render/occlusion';
  import { navigate } from '../lib/router.svelte';

  /** Edit this note type; list them all when empty. */
  let { id = '' }: { id?: string } = $props();

  let types = $state.raw<NoteType[]>([]);
  let counts = $state.raw<Record<string, number>>({});
  let type = $state.raw<NoteType | null>(null);
  let draft = $state<NoteTypeDraft | null>(null);
  let example = $state.raw<Note | null>(null);
  let newField = $state('');
  let tab = $state(0);
  let side = $state<'front' | 'back'>('front');
  let message = $state('');
  let error = $state('');
  let busy = $state(false);

  async function load() {
    types = (await db.noteTypes.toArray()).sort((a, b) => a.name.localeCompare(b.name));
    counts = Object.fromEntries(
      await Promise.all(
        types.map(async (t) => [t.id, await db.notes.where('noteTypeId').equals(t.id).count()]),
      ),
    );
    type = id ? (types.find((t) => t.id === id) ?? null) : null;
    draft = type ? draftFrom(type) : null;
    example = type ? ((await db.notes.where('noteTypeId').equals(type.id).first()) ?? null) : null;
    tab = 0;
  }

  onMount(load);

  const readOnly = $derived(!!type && isBuiltin(type.id));
  const problem = $derived(type && draft ? draftProblem(type, draft) : null);
  const dirty = $derived(
    !!type && !!draft && JSON.stringify(draftFrom(type)) !== JSON.stringify($state.snapshot(draft)),
  );

  /** The current draft rendered with a real note of this type (or field-name samples). */
  const preview = $derived.by(() => {
    if (!type || !draft || problem) return null;
    const next = applyDraft(type, $state.snapshot(draft));
    const note: Note = example
      ? {
          ...example,
          fields: Object.fromEntries(
            draft.fields.map((f) => [f.name.trim(), f.from ? (example!.fields[f.from] ?? '') : '']),
          ),
        }
      : sampleNote(next);
    const ordinal = next.kind === 'cloze' ? 0 : Math.min(tab, next.templates.length - 1);
    try {
      return { html: renderCard(next, note, ordinal), css: next.css };
    } catch {
      return null;
    }
  });

  function renameField(i: number, name: string) {
    if (!draft) return;
    const old = draft.fields[i].name;
    draft.fields[i].name = name;
    // Keep templates pointing at the field as you type its new name.
    if (old.trim() && name.trim() && old !== name) {
      for (const t of draft.templates) {
        t.front = renameFieldRefs(t.front, old.trim(), name.trim());
        t.back = renameFieldRefs(t.back, old.trim(), name.trim());
      }
    }
  }

  function moveField(i: number, by: number) {
    if (!draft) return;
    const j = i + by;
    if (j < 0 || j >= draft.fields.length) return;
    [draft.fields[i], draft.fields[j]] = [draft.fields[j], draft.fields[i]];
  }

  function addField(e: SubmitEvent) {
    e.preventDefault();
    if (!draft || !newField.trim()) return;
    draft.fields.push({ name: newField.trim() });
    newField = '';
  }

  function addTemplate() {
    if (!draft || !type) return;
    const [a, b] = [draft.fields[0]?.name ?? '', draft.fields[1]?.name ?? draft.fields[0]?.name];
    draft.templates.push({
      name: `Card ${draft.templates.length + 1}`,
      front: `{{${b}}}`,
      back: `{{FrontSide}}\n\n<hr id="answer">\n\n{{${a}}}`,
    });
    tab = draft.templates.length - 1;
  }

  function moveTemplate(by: number) {
    if (!draft) return;
    const j = tab + by;
    if (j < 0 || j >= draft.templates.length) return;
    [draft.templates[tab], draft.templates[j]] = [draft.templates[j], draft.templates[tab]];
    tab = j;
  }

  function removeTemplate() {
    if (!draft) return;
    draft.templates.splice(tab, 1);
    tab = Math.max(0, tab - 1);
  }

  async function save() {
    if (!type || !draft || problem) return;
    error = '';
    busy = true;
    try {
      const snapshot = $state.snapshot(draft);
      const change = await previewNoteTypeChange(db, type.id, snapshot);
      const losses = [
        change.removedCards &&
          `${change.removedCards} card${change.removedCards === 1 ? '' : 's'}${change.removedReviews ? ` and ${change.removedReviews} review${change.removedReviews === 1 ? '' : 's'} of history` : ''}`,
        ...change.lostFields.map(
          (f) => `the “${f.name}” field in ${f.notes} note${f.notes === 1 ? '' : 's'}`,
        ),
      ].filter(Boolean);
      if (losses.length) {
        const ok = await confirmAction({
          title: 'Delete cards or text?',
          message: `Saving deletes ${losses.join(', and ')}. This can’t be undone; a backup first is a good idea.`,
          confirmLabel: 'Save and delete',
          danger: true,
        });
        if (!ok) return;
      }
      const done = await saveNoteType(db, type.id, snapshot);
      message = [
        'Saved.',
        done.addedCards && `${done.addedCards} new card${done.addedCards === 1 ? '' : 's'}.`,
        done.removedCards && `${done.removedCards} removed.`,
      ]
        .filter(Boolean)
        .join(' ');
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function clone(source: NoteType) {
    const copy = await cloneNoteType(
      db,
      source.id,
      copyName(
        source.name,
        types.map((t) => t.name),
      ),
    );
    navigate(`/note-types/${encodeURIComponent(copy.id)}`);
  }

  async function remove(t: NoteType) {
    const ok = await confirmAction({
      title: `Delete “${t.name}”?`,
      message: 'No notes use this note type. You can’t undo this.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    if (!(await deleteNoteType(db, t.id))) error = 'Notes use this note type now; it was kept.';
    if (id) navigate('/note-types');
    else await load();
  }
</script>

<nav class="crumbs muted" aria-label="Breadcrumb">
  <a href="#/settings">Settings</a> /
  {#if id}
    <a href="#/note-types">Note types</a> / <span aria-current="page">{type?.name ?? ''}</span>
  {:else}
    <span aria-current="page">Note types</span>
  {/if}
</nav>

{#if !id}
  <h2>Note types</h2>
  <p class="muted">
    A note type sets a note’s fields and the cards made from it. Built-in types can’t be changed:
    clone one to make your own.
  </p>
  <ul class="types panel">
    {#each types as t (t.id)}
      <li>
        <div>
          <a href="#/note-types/{encodeURIComponent(t.id)}"><strong>{t.name}</strong></a>
          <span class="muted small"
            >{t.fields.length} field{t.fields.length === 1 ? '' : 's'} · {t.kind === 'cloze'
              ? 'cloze'
              : `${t.templates.length} card type${t.templates.length === 1 ? '' : 's'}`} · {counts[
              t.id
            ] ?? 0} note{counts[t.id] === 1 ? '' : 's'}{isBuiltin(t.id) ? ' · built-in' : ''}</span
          >
        </div>
        <div class="row">
          <button class="secondary tiny" onclick={() => clone(t)}>Clone</button>
          {#if !isBuiltin(t.id) && !counts[t.id]}
            <button class="secondary tiny" onclick={() => remove(t)}>Delete</button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
{:else if !type || !draft}
  <p>This note type doesn’t exist. <a href="#/note-types">See all note types</a></p>
{:else}
  <h2>{type.name}</h2>
  {#if readOnly}
    <p class="notice">
      Built-in note types can’t be changed.
      <button class="link" onclick={() => clone(type!)}>Clone it</button> to make your own version.
    </p>
  {/if}

  <fieldset class="stack" disabled={readOnly}>
    <label>
      Name
      <input bind:value={draft.name} />
    </label>

    <h3 class="section-title">Fields</h3>
    <ol class="fields panel">
      {#each draft.fields as field, i (i)}
        <li>
          <input
            value={field.name}
            oninput={(e) => renameField(i, e.currentTarget.value)}
            aria-label="Field {i + 1} name"
          />
          <button
            class="secondary tiny"
            onclick={() => moveField(i, -1)}
            disabled={i === 0}
            aria-label="Move {field.name} up">↑</button
          >
          <button
            class="secondary tiny"
            onclick={() => moveField(i, 1)}
            disabled={i === draft.fields.length - 1}
            aria-label="Move {field.name} down">↓</button
          >
          <button
            class="secondary tiny"
            onclick={() => draft!.fields.splice(i, 1)}
            disabled={draft.fields.length === 1}
            aria-label="Remove {field.name}">Remove</button
          >
        </li>
      {/each}
    </ol>
    <form class="row" onsubmit={addField}>
      <input bind:value={newField} placeholder="New field name" aria-label="New field name" />
      <button class="secondary" type="submit" disabled={!newField.trim()}>Add field</button>
    </form>

    <h3 class="section-title">Cards</h3>
    {#if isImageOcclusion(type)}
      <p class="muted small">
        Nenrin draws image occlusion cards itself; these templates are only what other apps show.
      </p>
    {/if}
    {#if type.kind !== 'cloze'}
      <div class="row tabs" role="tablist" aria-label="Card types">
        {#each draft.templates as t, i (i)}
          <button
            role="tab"
            class="secondary tiny"
            class:active={tab === i}
            aria-selected={tab === i}
            onclick={() => (tab = i)}>{t.name || `Card ${i + 1}`}</button
          >
        {/each}
        <button class="secondary tiny" onclick={addTemplate}>+ Card type</button>
      </div>
    {/if}
    {#if draft.templates[tab]}
      {@const t = draft.templates[tab]}
      <div class="panel stack">
        {#if type.kind !== 'cloze'}
          <label>
            Card type name
            <input bind:value={t.name} />
          </label>
          <div class="row">
            <button class="secondary tiny" onclick={() => moveTemplate(-1)} disabled={tab === 0}
              >← Move</button
            >
            <button
              class="secondary tiny"
              onclick={() => moveTemplate(1)}
              disabled={tab === draft.templates.length - 1}>Move →</button
            >
            <button
              class="secondary tiny"
              onclick={removeTemplate}
              disabled={draft.templates.length === 1}>Remove card type</button
            >
          </div>
        {/if}
        <label>
          Front template
          <textarea class="code" rows="4" bind:value={t.front} spellcheck="false"></textarea>
        </label>
        <label>
          Back template
          <textarea class="code" rows="4" bind:value={t.back} spellcheck="false"></textarea>
        </label>
      </div>
    {/if}
    <p class="hint muted small">
      Fields go in double braces, like <code>{'{{Front}}'}</code>. Also
      <code>{'{{FrontSide}}'}</code>, <code>{'{{#Field}}…{{/Field}}'}</code> to show something only
      when a field has text, and filters such as <code>{'{{cloze:Text}}'}</code>,
      <code>{'{{type:Back}}'}</code>, <code>{'{{furigana:Reading}}'}</code> and
      <code>{'{{hint:Extra}}'}</code>.
    </p>

    <label>
      Styling (CSS)
      <textarea class="code" rows="5" bind:value={draft.css} spellcheck="false"></textarea>
    </label>
  </fieldset>

  <h3 class="section-title">
    Preview
    <span class="muted small">{example ? 'with your first note' : 'with sample text'}</span>
  </h3>
  <div class="row">
    <button class="secondary tiny" class:active={side === 'front'} onclick={() => (side = 'front')}
      >Front</button
    >
    <button class="secondary tiny" class:active={side === 'back'} onclick={() => (side = 'back')}
      >Back</button
    >
  </div>
  <section class="card panel preview" aria-label="Preview">
    {#if preview}
      <CardView
        html={side === 'front' ? preview.html.front : preview.html.back}
        css={preview.css}
        side={side === 'front' ? 'question' : 'answer'}
      />
    {:else if problem}
      <p class="muted">{problem}</p>
    {/if}
  </section>

  {#if !readOnly}
    <div class="row actions">
      <button onclick={save} disabled={!dirty || !!problem || busy}>Save</button>
      <button class="secondary" onclick={() => load()} disabled={!dirty || busy}
        >Discard changes</button
      >
      {#if !counts[type.id]}
        <button class="danger" onclick={() => remove(type!)}>Delete note type</button>
      {/if}
      {#if message}<span class="ok" role="status">{message}</span>{/if}
      {#if error}<span class="error" role="alert">{error}</span>{/if}
    </div>
  {/if}
{/if}

<style>
  .types {
    list-style: none;
    padding: 0;
    margin: 1rem 0;
  }
  .types li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 0.9rem;
    border-bottom: 1px solid var(--border);
  }
  .types li:last-child {
    border-bottom: 0;
  }
  .types a {
    text-decoration: none;
  }
  .types .small {
    display: block;
  }
  .small {
    font-size: 0.85rem;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
  }
  .fields {
    margin: 0;
    padding: 0.5rem;
    list-style: none;
    display: grid;
    gap: 0.4rem;
  }
  .fields li {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .fields input {
    flex: 1;
  }
  .row input {
    flex: 1;
  }
  .tiny {
    padding: 0.25rem 0.6rem;
    font-size: 0.8rem;
  }
  .tabs {
    flex-wrap: wrap;
  }
  .active {
    background: var(--accent);
    color: var(--accent-text);
  }
  .code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
    resize: vertical;
  }
  .notice {
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: var(--surface-2);
  }
  .preview {
    min-height: 8rem;
    margin-top: 0.5rem;
  }
  .actions {
    margin-top: 1rem;
  }
  .ok {
    color: var(--good);
  }
  .error {
    color: var(--again);
  }
</style>
