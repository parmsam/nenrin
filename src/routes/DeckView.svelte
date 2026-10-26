<script lang="ts">
  import { liveQuery } from 'dexie';
  import Counts from '../components/Counts.svelte';
  import { db } from '../lib/db';
  import {
    createDeck,
    deckSubtreeIds,
    deckTree,
    deleteDeck,
    renameDeck,
    updateDeckConfig,
  } from '../lib/db/decks';
  import { downloadFile } from '../lib/download';
  import { exportNotesText, textExportFilename } from '../lib/export/text';
  import { confirmAction } from '../lib/confirm.svelte';
  import { navigate } from '../lib/router.svelte';
  import { plainKey } from '../lib/shortcuts.svelte';
  import { formatInterval } from '../lib/study/day';
  import { studyState } from '../lib/study/queue';

  let { id }: { id: string } = $props();

  const data = liveQuery(async () => {
    const deck = await db.decks.get(id);
    if (!deck) return null;
    const tree = deckTree(await db.decks.toArray());
    const node = tree.find((d) => d.id === id)!;
    const children = tree.filter((d) => d.parentId === id);
    const cardCount = await db.cards.where('deckId').equals(id).count();
    return { deck, node, children, cardCount, study: await studyState(db, id) };
  });

  let renaming = $state(false);
  let name = $state('');
  let subName = $state('');
  let error = $state('');
  let saved = $state(false);
  let config = $state({ newPerDay: 20, reviewsPerDay: 200, desiredRetention: 0.9 });

  // Load the form once per deck; later DB updates shouldn't clobber unsaved edits.
  let loadedFor = '';
  $effect(() => {
    const d = $data?.deck;
    if (d && loadedFor !== d.id) {
      loadedFor = d.id;
      config = { ...d.config };
    }
  });

  const total = $derived(
    $data ? $data.study.counts.new + $data.study.counts.learning + $data.study.counts.review : 0,
  );

  async function saveName(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    try {
      await renameDeck(db, id, name);
      renaming = false;
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function addSubdeck(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    try {
      await createDeck(db, subName, id);
      subName = '';
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function saveConfig(e: SubmitEvent) {
    e.preventDefault();
    await updateDeckConfig(db, id, {
      newPerDay: Math.max(0, Math.round(config.newPerDay)),
      reviewsPerDay: Math.max(0, Math.round(config.reviewsPerDay)),
      desiredRetention: Math.min(0.99, Math.max(0.7, config.desiredRetention)),
    });
    saved = true;
    setTimeout(() => (saved = false), 1500);
  }

  async function exportText() {
    const d = $data;
    if (!d) return;
    downloadFile(
      await exportNotesText(db, id),
      textExportFilename(d.deck.name),
      'text/plain;charset=utf-8',
    );
  }

  /** Drops personal FSRS parameters for this deck and its sub-decks. */
  async function useDefaultParams() {
    const reset = {
      fsrsParams: undefined,
      fsrsOptimizedAt: undefined,
      fsrsOptimizedReviews: undefined,
    };
    for (const deckId of await deckSubtreeIds(db, id)) await updateDeckConfig(db, deckId, reset);
  }

  /** S study, P preview, C custom study (Anki uses S and C on the deck overview too). */
  function onKey(e: KeyboardEvent) {
    if (!plainKey(e) || !$data) return;
    const to = { s: `/study/${id}`, p: `/session/${id}?kind=all`, c: `/custom/${id}` }[
      e.key.toLowerCase()
    ];
    if (to) {
      e.preventDefault();
      navigate(to);
    }
  }

  const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

  async function remove() {
    const d = $data;
    if (!d) return;
    const ids = await deckSubtreeIds(db, id);
    const cards = await db.cards.where('deckId').anyOf(ids).count();
    const subs =
      ids.length > 1 ? ` and its ${ids.length - 1} sub-deck${ids.length > 2 ? 's' : ''}` : '';
    const ok = await confirmAction({
      title: `Delete “${d.deck.name}”?`,
      message: `This deletes the deck${subs}, ${cards.toLocaleString()} ${cards === 1 ? 'card' : 'cards'} and their review history. It can’t be undone.`,
      confirmLabel: 'Delete deck',
      danger: true,
    });
    if (!ok) return;
    await deleteDeck(db, id);
    navigate('/', { replace: true });
  }
</script>

<svelte:window onkeydown={onKey} />

{#if $data === undefined}
  <p class="muted">Loading…</p>
{:else if $data === null}
  <p>This deck doesn’t exist. <a href="#/">Back to decks</a></p>
{:else}
  {@const { deck, node, children, study, cardCount } = $data}
  <nav class="crumbs muted" aria-label="Breadcrumb"><a href="#/">Decks</a> / {node.path}</nav>

  {#if renaming}
    <form class="row title-form" onsubmit={saveName}>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={name} aria-label="Deck name" autofocus />
      <button type="submit">Save</button>
      <button type="button" class="secondary" onclick={() => (renaming = false)}>Cancel</button>
    </form>
  {:else}
    <div class="row title-row">
      <h2>{deck.name}</h2>
      <button
        class="secondary small"
        onclick={() => {
          name = deck.name;
          renaming = true;
        }}>Rename</button
      >
    </div>
  {/if}
  {#if error}<p class="error">{error}</p>{/if}

  <section class="panel study">
    <div class="legend">
      <Counts counts={study.counts} />
      <span class="muted">new · learning · review</span>
    </div>
    {#if total > 0}
      <a class="button big" href="#/study/{id}" title="Study (S)">Study now</a>
    {:else if study.waitUntil}
      <p>
        Next learning card in {formatInterval(study.waitUntil - Date.now())}.
        <a href="#/study/{id}">Study</a>
      </p>
    {:else if cardCount === 0 && children.length === 0}
      <p class="muted">No cards yet.</p>
    {:else}
      <p><strong>Done for today.</strong> <span class="muted">Come back tomorrow.</span></p>
    {/if}
    <div class="row">
      <a
        class="button secondary"
        href="#/session/{id}?kind=all"
        title="Flip through every card without scheduling (P)">Preview</a
      >
      <a class="button secondary" href="#/custom/{id}" title="Custom study (C)">Custom study</a>
    </div>
    <div class="row">
      <a class="button secondary" href="#/add?deck={id}">+ Add cards</a>
      <a class="button secondary" href="#/import?deck={id}">Import</a>
      <a
        class="button secondary"
        href="#/browse?q={encodeURIComponent(`deck:"${node.path.replace(/ \/ /g, '::')}"`)}"
        >Browse notes</a
      >
      <a class="button secondary" href="#/stats?deck={id}">Stats</a>
      <button
        class="secondary"
        onclick={exportText}
        disabled={cardCount === 0 && children.length === 0}>Export notes (.txt)</button
      >
    </div>
  </section>

  <h3 class="section-title">Sub-decks</h3>
  {#if children.length}
    <ul class="subdecks">
      {#each children as child (child.id)}
        <li><a href="#/deck/{child.id}">{child.name}</a></li>
      {/each}
    </ul>
  {/if}
  <form class="row nowrap" onsubmit={addSubdeck}>
    <input bind:value={subName} placeholder="New sub-deck name" aria-label="New sub-deck name" />
    <button class="secondary" type="submit">Add</button>
  </form>

  <h3 class="section-title">Settings</h3>
  <form class="panel settings" onsubmit={saveConfig}>
    <div class="grid2">
      <label>
        New cards / day
        <input type="number" min="0" max="9999" bind:value={config.newPerDay} />
      </label>
      <label>
        Reviews / day
        <input type="number" min="0" max="99999" bind:value={config.reviewsPerDay} />
      </label>
    </div>
    <label>
      Desired retention: {Math.round(config.desiredRetention * 100)}%
      <input type="range" min="0.7" max="0.99" step="0.01" bind:value={config.desiredRetention} />
      <span class="hint muted"
        >The chance you’ll remember a card when it comes due. Higher means more reviews; 90% is a
        good default.</span
      >
    </label>
    <p class="params">
      {#if deck.config.fsrsParams}
        <strong>Personal FSRS parameters</strong>
        <span class="muted">
          {deck.config.fsrsOptimizedAt
            ? `optimized ${dateFmt.format(deck.config.fsrsOptimizedAt)}`
            : ''}{deck.config.fsrsOptimizedReviews
            ? ` from ${deck.config.fsrsOptimizedReviews.toLocaleString()} reviews`
            : ''}
        </span>
        <button type="button" class="secondary small" onclick={useDefaultParams}
          >Use defaults</button
        >
      {:else}
        <span class="muted">Default FSRS parameters.</span>
      {/if}
      <a href="{import.meta.env.BASE_URL}optimize.html?deck={id}">Optimize for my reviews…</a>
    </p>
    <div class="row">
      <button type="submit">Save settings</button>
      {#if saved}<span class="muted" role="status">Saved</span>{/if}
    </div>
  </form>

  <h3 class="section-title">Danger zone</h3>
  <button class="danger" onclick={remove}>Delete deck</button>
{/if}

<style>
  .title-row h2 {
    margin: 0;
    font-size: 1.6rem;
  }
  .title-row,
  .title-form {
    margin-bottom: 1rem;
    flex-wrap: nowrap;
  }
  button.small {
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
  }
  .study {
    display: grid;
    gap: 1rem;
    justify-items: start;
  }
  .study p {
    margin: 0;
  }
  .legend {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    font-size: 1.25rem;
  }
  .legend .muted {
    font-size: 0.85rem;
  }
  .big {
    font-size: 1.1rem;
    padding: 0.85rem 2rem;
  }
  .subdecks {
    margin: 0 0 0.75rem;
    padding-left: 1.2rem;
  }
  .nowrap {
    flex-wrap: nowrap;
  }
  .settings {
    display: grid;
    gap: 1rem;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .params {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.6rem;
    margin: 0;
    font-size: 0.875rem;
  }
  .hint {
    font-weight: 400;
    font-size: 0.8rem;
  }
</style>
