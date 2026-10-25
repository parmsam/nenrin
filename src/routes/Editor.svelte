<script lang="ts">
  import { onMount, tick } from 'svelte';
  import CardView from '../components/CardView.svelte';
  import { db, type Note, type NoteType } from '../lib/db';
  import { deckTree, type DeckNode } from '../lib/db/decks';
  import { addImage } from '../lib/db/media';
  import { addNote, cardOrdinals, deleteNote, parseTags, updateNote } from '../lib/notes';
  import { renderCard } from '../lib/render';
  import { clozeNumbers } from '../lib/render/template';
  import { navigate, router } from '../lib/router.svelte';

  /** Edit an existing note when set; otherwise add new notes. */
  let { noteId }: { noteId?: string } = $props();

  const LAST_KEY = 'nenrin:last-add';

  let noteTypes = $state<NoteType[]>([]);
  let decks = $state<DeckNode[]>([]);
  let note = $state<Note | null>(null);
  let typeId = $state('basic');
  let deckId = $state('');
  let fields = $state<Record<string, string>>({});
  let tags = $state('');
  let message = $state('');
  let error = $state('');
  let previewSide = $state<'front' | 'back'>('front');
  let loaded = $state(false);
  let textareas: HTMLTextAreaElement[] = $state([]);

  const noteType = $derived(noteTypes.find((t) => t.id === typeId));
  const returnTo = $derived(router.query.get('return'));

  const preview = $derived.by(() => {
    if (!noteType) return null;
    const ordinals = cardOrdinals(noteType, fields);
    if (ordinals.length === 0) return { count: 0, html: '' };
    const fake: Note = {
      id: '',
      noteTypeId: noteType.id,
      fields,
      tags: [],
      createdAt: 0,
      updatedAt: 0,
      format: note?.format,
    };
    const card = renderCard(noteType, fake, ordinals[0]);
    return { count: ordinals.length, html: previewSide === 'front' ? card.front : card.back };
  });

  function readLast(): { deckId?: string; typeId?: string } {
    try {
      return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  function rememberLast() {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ deckId, typeId }));
    } catch {
      // Private mode etc.: just don't remember.
    }
  }

  function resetFields(type: NoteType | undefined) {
    fields = Object.fromEntries((type?.fields ?? []).map((f) => [f, fields[f] ?? '']));
  }

  onMount(async () => {
    noteTypes = await db.noteTypes.toArray();
    decks = deckTree(await db.decks.toArray());
    if (noteId) {
      note = (await db.notes.get(noteId)) ?? null;
      if (note) {
        typeId = note.noteTypeId;
        fields = { ...note.fields };
        tags = note.tags.join(' ');
        const card = await db.cards.where('noteId').equals(note.id).first();
        deckId = card?.deckId ?? '';
      }
    } else {
      const last = readLast();
      const wanted = router.query.get('deck') ?? last.deckId;
      deckId = decks.find((d) => d.id === wanted)?.id ?? decks[0]?.id ?? '';
      typeId = noteTypes.find((t) => t.id === last.typeId)?.id ?? 'basic';
      resetFields(noteTypes.find((t) => t.id === typeId));
    }
    loaded = true;
    await tick();
    textareas[0]?.focus();
  });

  function changeType() {
    resetFields(noteType);
  }

  async function save(e?: Event) {
    e?.preventDefault();
    error = '';
    message = '';
    try {
      if (note) {
        const { added, removed } = await updateNote(db, note.id, {
          fields: { ...fields },
          tags: parseTags(tags),
        });
        const changes = [added && `${added} card(s) added`, removed && `${removed} removed`]
          .filter(Boolean)
          .join(', ');
        if (changes) alert(`Saved. ${changes}.`);
        navigate(returnTo ?? (deckId ? `/deck/${deckId}` : '/'), { replace: true });
      } else {
        await addNote(db, {
          noteTypeId: typeId,
          deckId,
          fields: { ...fields },
          tags: parseTags(tags),
        });
        rememberLast();
        const count = preview?.count ?? 1;
        message = `Added ${count} ${count === 1 ? 'card' : 'cards'}.`;
        resetFields(undefined);
        resetFields(noteType);
        await tick();
        textareas[0]?.focus();
      }
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function remove() {
    if (!note || !confirm('Delete this note and its cards, including review history?')) return;
    await deleteNote(db, note.id);
    navigate(returnTo ?? (deckId ? `/deck/${deckId}` : '/'), { replace: true });
  }

  /** Inserts text at the cursor of a field's textarea and keeps the field in sync. */
  async function insertAt(i: number, before: string, after = '') {
    const ta = textareas[i];
    const name = noteType!.fields[i];
    const value = fields[name] ?? '';
    const [s, e] = [ta.selectionStart, ta.selectionEnd];
    fields[name] = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
    await tick();
    ta.focus();
    const cursor = e === s ? s + before.length : e + before.length + after.length;
    ta.setSelectionRange(cursor, cursor);
  }

  function wrapCloze(i: number) {
    const n = Math.max(0, ...clozeNumbers(Object.values(fields).join('\n'))) + 1;
    insertAt(i, `{{c${n}::`, '}}');
  }

  async function onPaste(e: ClipboardEvent, i: number) {
    const image = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!image) return;
    e.preventDefault();
    const filename = await addImage(db, image);
    insertAt(i, `![](${filename})`);
  }

  function onKey(e: KeyboardEvent, i: number) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save(e);
    else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      wrapCloze(i);
    }
  }
</script>

{#if !loaded}
  <p class="muted">Loading…</p>
{:else if noteId && !note}
  <p>This note doesn’t exist. <a href="#/">Back to decks</a></p>
{:else if !note && decks.length === 0}
  <p>Create a deck first. <a href="#/">Go to decks</a></p>
{:else}
  <nav class="crumbs muted">
    <a href={returnTo ? `#${returnTo}` : '#/'}>← Back</a>
  </nav>
  <h2>{note ? 'Edit note' : 'Add cards'}</h2>

  <form class="editor" onsubmit={save}>
    <div class="grid2">
      <label>
        Type
        <select bind:value={typeId} onchange={changeType} disabled={!!note}>
          {#each noteTypes as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </label>
      <label>
        Deck
        <select bind:value={deckId} disabled={!!note}>
          {#each decks as d (d.id)}<option value={d.id}>{d.path}</option>{/each}
        </select>
      </label>
    </div>

    {#each noteType?.fields ?? [] as name, i (name)}
      <div class="field">
        <div class="field-head">
          <label for="field-{i}">{name}</label>
          {#if noteType?.kind === 'cloze' && i === 0}
            <button type="button" class="secondary tiny" onclick={() => wrapCloze(i)}
              >Cloze […] <kbd>⌘⇧C</kbd></button
            >
          {/if}
        </div>
        <textarea
          id="field-{i}"
          bind:this={textareas[i]}
          bind:value={fields[name]}
          rows={i === 0 ? 3 : 2}
          onpaste={(e) => onPaste(e, i)}
          onkeydown={(e) => onKey(e, i)}
          placeholder={noteType?.kind === 'cloze' && i === 0
            ? 'The {{c1::mitochondria}} is the powerhouse of the cell.'
            : ''}></textarea>
      </div>
    {/each}

    <label>
      Tags
      <input bind:value={tags} placeholder="space separated" />
    </label>

    <p class="hint muted">
      Markdown, <code>$math$</code> and pasted images work. <kbd>⌘/Ctrl</kbd>+<kbd>Enter</kbd> to save.
    </p>

    <div class="row">
      <button type="submit">{note ? 'Save' : 'Add'}</button>
      {#if note}<button type="button" class="danger" onclick={remove}>Delete note</button>{/if}
      {#if message}<span class="ok" role="status">{message}</span>{/if}
      {#if error}<span class="error" role="alert">{error}</span>{/if}
    </div>
  </form>

  <h3 class="section-title">
    Preview
    {#if preview && preview.count > 1}<span class="muted">· card 1 of {preview.count}</span>{/if}
  </h3>
  <div class="row tabs" role="tablist">
    <button
      type="button"
      role="tab"
      aria-selected={previewSide === 'front'}
      class:secondary={previewSide !== 'front'}
      onclick={() => (previewSide = 'front')}>Front</button
    >
    <button
      type="button"
      role="tab"
      aria-selected={previewSide === 'back'}
      class:secondary={previewSide !== 'back'}
      onclick={() => (previewSide = 'back')}>Back</button
    >
  </div>
  <div class="panel preview">
    {#if preview && preview.count > 0}
      <CardView html={preview.html} />
    {:else}
      <p class="muted">
        {noteType?.kind === 'cloze'
          ? 'Add a cloze like {{c1::answer}} to see a preview.'
          : 'Type a front to see a preview.'}
      </p>
    {/if}
  </div>
{/if}

<style>
  .crumbs {
    font-size: 0.875rem;
  }
  h2 {
    margin: 0.25rem 0 1rem;
  }
  .editor {
    display: grid;
    gap: 1rem;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .field {
    display: grid;
    gap: 0.35rem;
  }
  .field-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  textarea {
    resize: vertical;
    line-height: 1.5;
  }
  .tiny {
    padding: 0.2rem 0.55rem;
    font-size: 0.75rem;
  }
  .hint {
    margin: -0.25rem 0 0;
    font-size: 0.8rem;
  }
  .ok {
    color: var(--good);
    font-weight: 600;
  }
  .tabs button {
    padding: 0.35rem 0.9rem;
    font-size: 0.85rem;
  }
  .preview {
    margin-top: 0.6rem;
    min-height: 8rem;
    display: grid;
    align-content: center;
  }
  .preview p {
    text-align: center;
  }
</style>
