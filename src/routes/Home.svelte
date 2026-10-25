<script lang="ts">
  import { liveQuery } from 'dexie';
  import Counts from '../components/Counts.svelte';
  import { db } from '../lib/db';
  import { createDeck, deckTree } from '../lib/db/decks';
  import { createSampleDeck } from '../lib/db/sample';
  import { navigate } from '../lib/router.svelte';
  import { studyState } from '../lib/study/queue';

  const logo = `${import.meta.env.BASE_URL}logo.svg`;
  const BACKUP_NUDGE_DAYS = 14;

  const decks = liveQuery(async () => {
    const tree = deckTree(await db.decks.toArray());
    return Promise.all(tree.map(async (d) => ({ ...d, ...(await studyState(db, d.id)) })));
  });
  const backupNudge = liveQuery(async () => {
    if ((await db.cards.count()) === 0) return false;
    const last = (await db.settings.get('lastBackupAt'))?.value as number | undefined;
    return !last || Date.now() - last > BACKUP_NUDGE_DAYS * 86_400_000;
  });

  let busy = $state(false);
  let newDeckName = $state('');
  let error = $state('');

  const totalDue = $derived(
    ($decks ?? [])
      .filter((d) => d.depth === 0)
      .reduce((n, d) => n + d.counts.new + d.counts.learning + d.counts.review, 0),
  );

  async function addSample() {
    busy = true;
    try {
      await createSampleDeck(db);
      // Ask the browser not to evict our data; it may grant this silently.
      await navigator.storage?.persist?.();
    } finally {
      busy = false;
    }
  }

  async function addDeck(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    try {
      const deck = await createDeck(db, newDeckName);
      newDeckName = '';
      await navigator.storage?.persist?.();
      navigate(`/deck/${deck.id}`);
    } catch (err) {
      error = (err as Error).message;
    }
  }
</script>

{#if $decks === undefined}
  <p class="muted">Loading…</p>
{:else if $decks.length === 0}
  <section class="empty">
    <img src={logo} alt="" width="132" height="132" />
    <h2>Memory grows ring by ring</h2>
    <p class="muted">
      Free, open-source flashcards with FSRS spaced repetition. Everything stays on this device,
      works offline, and needs no account.
    </p>
    <div class="row center">
      <button onclick={addSample} disabled={busy}>Add a sample deck</button>
    </div>
    <form class="row center new-deck" onsubmit={addDeck}>
      <input
        bind:value={newDeckName}
        placeholder="Or name your first deck"
        aria-label="Deck name"
      />
      <button class="secondary" type="submit">Create</button>
    </form>
    {#if error}<p class="error">{error}</p>{/if}
  </section>
{:else}
  <section class="today" aria-label="Today">
    <span class="today-count">{totalDue}</span>
    <span class="today-label">{totalDue === 1 ? 'card' : 'cards'} to study today</span>
    <a class="button add" href="#/add">+ Add cards</a>
  </section>

  {#if $backupNudge}
    <p class="nudge">
      Your cards only live on this device. <a href="#/settings">Export a backup</a> now and then.
    </p>
  {/if}

  <h2 class="section-title">Decks</h2>
  <ul class="decks">
    {#each $decks as deck (deck.id)}
      <li style:--depth={deck.depth}>
        <a href="#/deck/{deck.id}">
          <span class="name">{deck.name}</span>
          <Counts counts={deck.counts} />
        </a>
      </li>
    {/each}
  </ul>

  <form class="row new-deck" onsubmit={addDeck}>
    <input bind:value={newDeckName} placeholder="New deck name" aria-label="New deck name" />
    <button class="secondary" type="submit">Create deck</button>
  </form>
  {#if error}<p class="error">{error}</p>{/if}
{/if}

<style>
  .empty {
    text-align: center;
    padding: 2.5rem 1.5rem 2.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 24px;
    box-shadow: var(--shadow);
  }
  .empty h2 {
    font-size: 1.5rem;
    margin: 1.25rem 0 0.5rem;
  }
  .empty p {
    max-width: 26rem;
    margin: 0 auto 1.75rem;
  }
  .center {
    justify-content: center;
  }
  .new-deck {
    margin-top: 1rem;
    flex-wrap: nowrap;
  }
  .empty .new-deck {
    max-width: 24rem;
    margin: 1.25rem auto 0;
  }
  .today {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.6rem;
    padding: 1.4rem 1.5rem;
    border-radius: 20px;
    background: var(--hero);
    color: var(--hero-text);
    box-shadow: var(--shadow);
  }
  .today-count {
    font-size: 2.6rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .today-label {
    opacity: 0.8;
  }
  .add {
    margin-left: auto;
    align-self: center;
  }
  .nudge {
    margin: 1rem 0 0;
    padding: 0.7rem 1rem;
    border-radius: 12px;
    background: var(--accent-soft);
    font-size: 0.9rem;
  }
  .decks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .decks li {
    margin-left: calc(var(--depth) * 1.25rem);
  }
  .decks a {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.15rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    color: inherit;
    text-decoration: none;
  }
  .decks a:hover {
    border-color: var(--accent);
  }
  .name {
    font-weight: 600;
  }
</style>
