<script lang="ts">
  import { liveQuery } from 'dexie';
  import Counts from '../components/Counts.svelte';
  import TodayRing from '../components/TodayRing.svelte';
  import { db } from '../lib/db';
  import { createDeck, deckTree } from '../lib/db/decks';
  import { createSampleDeck } from '../lib/db/sample';
  import { navigate } from '../lib/router.svelte';
  import { studyState } from '../lib/study/queue';
  import { todaySummary } from '../lib/study/stats';

  const logo = `${import.meta.env.BASE_URL}logo.svg`;
  const BACKUP_NUDGE_DAYS = 14;

  const decks = liveQuery(async () => {
    const tree = deckTree(await db.decks.toArray());
    return Promise.all(tree.map(async (d) => ({ ...d, ...(await studyState(db, d.id)) })));
  });
  const today = liveQuery(() => todaySummary(db));
  const backupNudge = liveQuery(async () => {
    if ((await db.cards.count()) === 0) return false;
    const last = (await db.settings.get('lastBackupAt'))?.value as number | undefined;
    return !last || Date.now() - last > BACKUP_NUDGE_DAYS * 86_400_000;
  });

  let busy = $state(false);
  let newDeckName = $state('');
  let error = $state('');

  const dueOf = (d: { counts: { new: number; learning: number; review: number } }) =>
    d.counts.new + d.counts.learning + d.counts.review;
  const topLevel = $derived(($decks ?? []).filter((d) => d.depth === 0));
  const totalDue = $derived(topLevel.reduce((n, d) => n + dueOf(d), 0));
  /** "Study now" opens the top-level deck with the most cards due. */
  const nextDeck = $derived(
    topLevel.filter((d) => dueOf(d) > 0).sort((a, b) => dueOf(b) - dueOf(a))[0],
  );
  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  });
  let showNewDeck = $state(false);

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
      <a class="button secondary" href="#/import">Import a file</a>
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
    <TodayRing done={$today?.reviewedToday ?? 0} remaining={totalDue} />
    <div class="today-text">
      <p class="eyebrow">{greeting}</p>
      <h2>
        {totalDue > 0
          ? `${totalDue} ${totalDue === 1 ? 'card' : 'cards'} to study`
          : 'All done for today'}
      </h2>
      <p class="sub">
        {$today?.reviewedToday ?? 0} reviewed today
        {#if $today?.streak}· {$today.streak}-day streak{/if}
      </p>
      {#if nextDeck}
        <p class="next">
          <a class="button study-now" href="#/study/{nextDeck.id}" aria-describedby="next-deck"
            >Study now</a
          >
          <span id="next-deck" class="next-deck">{nextDeck.name}</span>
        </p>
      {:else}
        <p class="sub">Another ring on the tree. Come back tomorrow.</p>
      {/if}
    </div>
  </section>

  <nav class="quick" aria-label="Quick actions">
    <a href="#/add">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      Add cards
    </a>
    <a href="#/import">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" /></svg
      >
      Import
    </a>
    <a href="#/browse">
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5" /></svg
      >
      Browse
    </a>
  </nav>

  {#if $backupNudge}
    <p class="nudge">
      Your cards only live on this device. <a href="#/settings">Export a backup</a> now and then.
    </p>
  {/if}

  <div class="decks-head">
    <h2 class="section-title">Decks</h2>
    <button class="secondary small" onclick={() => (showNewDeck = !showNewDeck)}
      >{showNewDeck ? 'Cancel' : '+ New deck'}</button
    >
  </div>
  {#if showNewDeck}
    <form class="row new-deck" onsubmit={addDeck}>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={newDeckName}
        placeholder="Deck name"
        aria-label="New deck name"
        autofocus
      />
      <button type="submit">Create</button>
    </form>
    {#if error}<p class="error">{error}</p>{/if}
  {/if}
  <ul class="decks">
    {#each $decks as deck (deck.id)}
      <li style:--depth={deck.depth} class:done={dueOf(deck) === 0}>
        <a class="deck-link" href="#/deck/{deck.id}">
          <span class="name" id="deck-{deck.id}">{deck.name}</span>
          <Counts counts={deck.counts} />
        </a>
        {#if dueOf(deck) > 0}
          <a class="study" href="#/study/{deck.id}" aria-describedby="deck-{deck.id}">Study</a>
        {/if}
      </li>
    {/each}
  </ul>
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
    align-items: center;
    gap: 1.4rem;
    padding: 1.4rem 1.5rem;
    border-radius: 22px;
    background: var(--hero);
    color: var(--hero-text);
    box-shadow: var(--shadow);
  }
  .today-text {
    min-width: 0;
  }
  .today p,
  .today h2 {
    margin: 0;
  }
  .eyebrow {
    font-size: 0.8rem;
    opacity: 0.75;
  }
  .today h2 {
    font-size: 1.45rem;
    line-height: 1.25;
    margin: 0.15rem 0 0.25rem;
  }
  .sub {
    font-size: 0.875rem;
    opacity: 0.8;
  }
  .next {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.85rem !important;
  }
  .study-now {
    background: var(--hero-accent);
    color: var(--hero);
  }
  .next-deck {
    font-size: 0.85rem;
    opacity: 0.8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 420px) {
    .today {
      flex-direction: column;
      text-align: center;
    }
    .next {
      justify-content: center;
    }
  }
  .quick {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin-top: 0.9rem;
  }
  .quick a {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.75rem 0.5rem;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    font-weight: 600;
    font-size: 0.9rem;
    text-decoration: none;
  }
  .quick a:hover {
    border-color: var(--accent);
  }
  .quick svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .decks-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .decks-head .small {
    padding: 0.3rem 0.7rem;
    font-size: 0.8rem;
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
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
  }
  .decks li.done .name {
    color: var(--muted);
  }
  .study {
    display: grid;
    place-items: center;
    padding: 0 1rem;
    border-radius: 16px;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
    font-size: 0.9rem;
    text-decoration: none;
  }
  .decks .deck-link {
    flex: 1;
    min-width: 0;
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
  .decks .deck-link:hover {
    border-color: var(--accent);
  }
  .name {
    font-weight: 600;
  }
</style>
