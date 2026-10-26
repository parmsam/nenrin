<script lang="ts">
  import { liveQuery } from 'dexie';
  import { onMount, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { db } from '../lib/db';
  import { deckTree } from '../lib/db/decks';
  import { buildRows, search, sortRows, type SearchRow, type SortKey } from '../lib/browse/search';
  import { addTags, deleteNotes, moveNotes, removeTags, setSuspended } from '../lib/notes/bulk';
  import { parseTags } from '../lib/notes';
  import { navigate, router } from '../lib/router.svelte';
  import { isTyping } from '../lib/shortcuts.svelte';
  import { State } from '../lib/scheduler';
  import { formatInterval } from '../lib/study/day';

  const PAGE = 100;

  let query = $state(router.query.get('q') ?? '');
  let sort = $state<SortKey>('newest');
  let shown = $state(PAGE);
  const selected = new SvelteSet<string>();
  let moveTo = $state('');
  let tagInput = $state('');
  let status = $state('');
  let input: HTMLInputElement | undefined = $state();

  // Everything the search needs, rebuilt whenever the database changes.
  const data = liveQuery(async () => {
    const [notes, cards, noteTypes, decks] = await Promise.all([
      db.notes.toArray(),
      db.cards.toArray(),
      db.noteTypes.toArray(),
      db.decks.toArray(),
    ]);
    const tree = deckTree(decks);
    const paths = new Map(tree.map((d) => [d.id, d.path.replace(/ \/ /g, '::')]));
    return { rows: buildRows(notes, cards, noteTypes, paths), tree };
  });

  const results = $derived($data ? sortRows(search($data.rows, query), sort) : []);
  const visible = $derived(results.slice(0, shown));
  const allVisibleSelected = $derived(
    visible.length > 0 && visible.every((r) => selected.has(r.note.id)),
  );

  // Keep the query in the URL so Back and links (e.g. from a deck) restore the search.
  $effect(() => {
    const q = query.trim();
    const target = q ? `/browse?q=${encodeURIComponent(q)}` : '/browse';
    if (location.hash.slice(1) !== target) navigate(target, { replace: true });
  });

  onMount(() => input?.focus());

  function toggle(id: string) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }

  function toggleAll() {
    const selectAll = !allVisibleSelected;
    selected.clear();
    if (selectAll) for (const r of visible) selected.add(r.note.id);
  }

  async function act(label: string, fn: (ids: string[]) => Promise<unknown>) {
    const ids = [...selected];
    if (ids.length === 0) return;
    await fn(ids);
    status = `${label} ${ids.length} ${ids.length === 1 ? 'note' : 'notes'}.`;
  }

  async function remove() {
    const n = selected.size;
    if (
      !confirm(`Delete ${n} ${n === 1 ? 'note' : 'notes'} with their cards and review history?`)
    ) {
      return;
    }
    await act('Deleted', (ids) => deleteNotes(db, ids));
    selected.clear();
  }

  function stateLabel(row: SearchRow): { text: string; kind: string } {
    if (row.cards.length && row.cards.every((c) => c.suspended)) {
      return { text: 'Suspended', kind: 'suspended' };
    }
    const active = row.cards.filter((c) => !c.suspended);
    if (active.every((c) => c.state === State.New)) return { text: 'New', kind: 'new' };
    const next = Math.min(...active.filter((c) => c.state !== State.New).map((c) => c.due));
    const ms = next - Date.now();
    return {
      text: ms <= 0 ? 'Due' : `in ${formatInterval(ms)}`,
      kind: active.some((c) => c.state === State.Review) ? 'review' : 'learning',
    };
  }

  let list: HTMLUListElement | undefined = $state();

  /** Moves focus to the result row at `i` (its link), or back to the search box above row 0. */
  function focusRow(i: number) {
    const links = list?.querySelectorAll<HTMLAnchorElement>('a.main') ?? [];
    if (i < 0) return input?.focus();
    links[Math.min(i, links.length - 1)]?.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.key === '/' && !isTyping(e)) {
      e.preventDefault();
      input?.focus();
      input?.select();
      return;
    }
    // ↓ from the search box jumps into the results.
    if (e.target === input && e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(0);
      return;
    }
    const row = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('li[data-id]');
    if (!row || !list) return;
    const rows = [...list.querySelectorAll<HTMLElement>('li[data-id]')];
    const i = rows.indexOf(row);
    const key = e.key.toLowerCase();
    if (key === 'arrowdown' || key === 'j') {
      e.preventDefault();
      focusRow(i + 1);
    } else if (key === 'arrowup' || key === 'k') {
      e.preventDefault();
      focusRow(i - 1);
    } else if (key === 'x' || (key === ' ' && e.target instanceof HTMLAnchorElement)) {
      e.preventDefault();
      toggle(row.dataset.id!);
    } else if (key === 'escape') {
      input?.focus();
    }
  }

  async function addExample(q: string) {
    query = query.trim() ? `${query.trim()} ${q}` : q;
    await tick();
    input?.focus();
  }

  const editHref = (id: string) =>
    `#/edit/${id}?return=${encodeURIComponent(location.hash.slice(1) || '/browse')}`;
</script>

<svelte:window onkeydown={onKey} />

<nav class="crumbs muted"><a href="#/">← Decks</a></nav>
<h2>Browse</h2>

<div class="search-row">
  <input
    bind:this={input}
    bind:value={query}
    type="search"
    placeholder="Search: words, deck:Japanese, tag:verb, is:due…"
    aria-label="Search notes"
    oninput={() => {
      shown = PAGE;
      selected.clear();
    }}
  />
  <select bind:value={sort} aria-label="Sort by">
    <option value="newest">Newest</option>
    <option value="oldest">Oldest</option>
    <option value="alpha">A–Z</option>
    <option value="due">Due</option>
  </select>
</div>
<p class="examples muted">
  Try
  {#each ['is:due', 'is:new', 'is:suspended', 'added:7', '-tag:leech'] as ex (ex)}
    <button type="button" class="chip" onclick={() => addExample(ex)}>{ex}</button>
  {/each}
  · <kbd>/</kbd> to search, <kbd>↓</kbd> <kbd>↑</kbd> to move, <kbd>X</kbd> to select
</p>

{#if $data === undefined}
  <p class="muted">Loading…</p>
{:else}
  <div class="toolbar" class:active={selected.size > 0}>
    <label class="check">
      <input
        type="checkbox"
        checked={allVisibleSelected}
        onchange={toggleAll}
        aria-label="Select all shown"
      />
      {selected.size
        ? `${selected.size} selected`
        : `${results.length} ${results.length === 1 ? 'note' : 'notes'}`}
    </label>
    {#if selected.size > 0}
      <div class="actions">
        <button
          class="secondary"
          onclick={() => act('Suspended', (ids) => setSuspended(db, ids, true))}>Suspend</button
        >
        <button
          class="secondary"
          onclick={() => act('Unsuspended', (ids) => setSuspended(db, ids, false))}
          >Unsuspend</button
        >
        <select
          bind:value={moveTo}
          aria-label="Move to deck"
          onchange={async () => {
            if (moveTo) await act('Moved', (ids) => moveNotes(db, ids, moveTo));
            moveTo = '';
          }}
        >
          <option value="">Move to…</option>
          {#each $data.tree as d (d.id)}<option value={d.id}>{d.path}</option>{/each}
        </select>
        <input class="tag-input" bind:value={tagInput} placeholder="tags" aria-label="Tags" />
        <button
          class="secondary"
          disabled={!tagInput.trim()}
          onclick={() => act('Tagged', (ids) => addTags(db, ids, parseTags(tagInput)))}
          >+ Tag</button
        >
        <button
          class="secondary"
          disabled={!tagInput.trim()}
          onclick={() => act('Untagged', (ids) => removeTags(db, ids, parseTags(tagInput)))}
          >− Tag</button
        >
        <button class="danger" onclick={remove}>Delete</button>
      </div>
    {/if}
  </div>
  {#if status}<p class="ok" role="status">{status}</p>{/if}

  {#if results.length === 0}
    <p class="muted empty">No notes match.</p>
  {:else}
    <ul class="results" bind:this={list}>
      {#each visible as row (row.note.id)}
        {@const st = stateLabel(row)}
        <li class:selected={selected.has(row.note.id)} data-id={row.note.id}>
          <input
            type="checkbox"
            checked={selected.has(row.note.id)}
            onchange={() => toggle(row.note.id)}
            aria-label="Select {row.sortField || 'note'}"
          />
          <a href={editHref(row.note.id)} class="main">
            <span class="front">{row.sortField || '(empty)'}</span>
            <span class="meta muted">
              {row.decks.join(', ').replace(/::/g, ' / ')}
              {#if row.note.tags.length}· {row.note.tags.join(' ')}{/if}
              {#if row.type}· {row.type.name}{/if}
            </span>
          </a>
          <span class="state {st.kind}">{st.text}</span>
        </li>
      {/each}
    </ul>
    {#if results.length > shown}
      <button class="secondary more" onclick={() => (shown += PAGE)}>
        Show more ({results.length - shown} left)
      </button>
    {/if}
  {/if}
{/if}

<style>
  .crumbs {
    font-size: 0.875rem;
  }
  h2 {
    margin: 0.25rem 0 1rem;
  }
  .search-row {
    display: flex;
    gap: 0.5rem;
  }
  .search-row select {
    width: auto;
  }
  .examples {
    font-size: 0.8rem;
    margin: 0.5rem 0 1rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }
  .chip {
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font:
      0.75rem ui-monospace,
      monospace;
    background: var(--surface-2);
    color: var(--text);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.9rem;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .toolbar.active {
    border-color: var(--accent);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }
  .check input,
  .results input[type='checkbox'] {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: var(--accent);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .actions button,
  .actions select,
  .actions input {
    padding: 0.35rem 0.7rem;
    font-size: 0.85rem;
    width: auto;
  }
  .tag-input {
    max-width: 7rem;
  }
  .ok {
    color: var(--good);
    font-weight: 600;
    font-size: 0.9rem;
  }
  .empty {
    text-align: center;
    padding: 2rem 0;
  }
  .results {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .results li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.9rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .results li.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .main {
    flex: 1;
    min-width: 0;
    color: inherit;
    text-decoration: none;
    display: grid;
  }
  .front {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    font-size: 0.75rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .state.new {
    color: var(--new);
  }
  .state.learning {
    color: var(--learning);
  }
  .state.review {
    color: var(--review);
  }
  .state.suspended {
    color: var(--muted);
  }
  .more {
    margin: 1rem auto 0;
    display: block;
  }
</style>
