<script lang="ts">
  import { liveQuery } from 'dexie';
  import { onMount } from 'svelte';
  import { db } from './lib/db';
  import { deckSummaries } from './lib/db/repo';
  import { createSampleDeck } from './lib/db/sample';

  const logo = `${import.meta.env.BASE_URL}logo.svg`;
  const decks = liveQuery(() => deckSummaries(db));
  let persisted = $state<boolean | null>(null);
  let busy = $state(false);

  const totalDue = $derived(($decks ?? []).reduce((n, d) => n + d.due, 0));

  onMount(async () => {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
  });

  async function addSample() {
    busy = true;
    try {
      await createSampleDeck(db);
      // Ask the browser not to evict our data; it may grant this silently.
      persisted = (await navigator.storage?.persist?.()) ?? persisted;
    } finally {
      busy = false;
    }
  }
</script>

<header>
  <img src={logo} alt="" width="36" height="36" />
  <h1>Nenrin</h1>
  <span class="kanji" lang="ja">年輪</span>
  <span class="badge">pre-alpha</span>
</header>

<main>
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
      <button onclick={addSample} disabled={busy}>Add a sample deck</button>
    </section>
  {:else}
    <section class="today" aria-label="Today">
      <span class="today-count">{totalDue}</span>
      <span class="muted">{totalDue === 1 ? 'card' : 'cards'} due today</span>
    </section>
    <h2 class="section-title">Decks</h2>
    <ul class="decks">
      {#each $decks as deck (deck.id)}
        <li>
          <div>
            <span class="name">{deck.name}</span>
            <span class="muted total">{deck.total} {deck.total === 1 ? 'card' : 'cards'}</span>
          </div>
          <span class="due" class:none={deck.due === 0}>{deck.due} due</span>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<footer class="muted">
  <span>Storage: {persisted === null ? 'unknown' : persisted ? 'persistent' : 'best-effort'}</span>
  ·
  <a href="https://github.com/parmsam/nenrin">Source (MIT)</a>
</footer>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 1.1rem 0 1.5rem;
  }
  h1 {
    font-size: 1.45rem;
    margin: 0;
    letter-spacing: 0.01em;
  }
  .kanji {
    color: var(--muted);
    font-size: 1rem;
    letter-spacing: 0.1em;
  }
  .badge {
    margin-left: auto;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
  }
  main {
    flex: 1;
  }
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
  .today {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    padding: 1.4rem 1.5rem;
    margin-bottom: 1.75rem;
    border-radius: 20px;
    background: var(--hero);
    color: var(--hero-text);
    box-shadow: var(--shadow);
  }
  .today .muted {
    color: inherit;
    opacity: 0.8;
  }
  .today-count {
    font-size: 2.6rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .section-title {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin: 0 0 0.6rem;
  }
  .decks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }
  .decks li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.15rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
  }
  .name {
    display: block;
    font-weight: 600;
  }
  .total {
    font-size: 0.875rem;
  }
  .due {
    font-weight: 700;
    font-size: 0.875rem;
    white-space: nowrap;
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .due.none {
    background: var(--surface-2);
    color: var(--muted);
  }
  footer {
    padding: 2rem 0 1.5rem;
    font-size: 0.85rem;
    text-align: center;
  }
</style>
