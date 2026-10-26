<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../lib/db';
  import { deckSubtreeIds, deckTree, updateDeckConfig, type DeckNode } from '../lib/db/decks';
  import { getPrefs } from '../lib/db/prefs';
  import {
    buildTrainingSet,
    MIN_ITEMS,
    RECOMMENDED_REVIEWS,
    type TrainingSet,
  } from '../lib/study/optimize';
  import { formatInterval } from '../lib/study/day';
  import type { OptimizeRequest, OptimizeResponse } from '../workers/optimize.worker';

  const base = import.meta.env.BASE_URL;
  const logo = `${base}logo.svg`;
  const RELOAD_FLAG = 'nenrin:optimize-reloaded';

  let decks = $state<DeckNode[]>([]);
  let deckId = $state(new URLSearchParams(location.search).get('deck') ?? '');
  let training = $state.raw<TrainingSet | null>(null);
  let result = $state.raw<Extract<OptimizeResponse, { ok: true }> | null>(null);
  let current = $state<number[] | undefined>();
  let busy = $state(false);
  let saved = $state(false);
  let error = $state('');
  const isolated = globalThis.crossOriginIsolated === true;

  const deck = $derived(decks.find((d) => d.id === deckId));

  onMount(async () => {
    // First visit after the service worker installs: one reload picks up the isolation headers.
    if (!isolated && navigator.serviceWorker?.controller && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      location.reload();
      return;
    }
    sessionStorage.removeItem(RELOAD_FLAG);
    decks = deckTree(await db.decks.toArray());
    if (!decks.some((d) => d.id === deckId)) deckId = decks[0]?.id ?? '';
  });

  // Recount training data whenever the deck changes.
  $effect(() => {
    const id = deckId;
    result = null;
    saved = false;
    training = null;
    if (!id) return;
    (async () => {
      const [{ rolloverHour }, ids, d] = await Promise.all([
        getPrefs(db),
        deckSubtreeIds(db, id),
        db.decks.get(id),
      ]);
      const deckIds = new Set(ids);
      const cardIds = (await db.cards.toArray())
        .filter((c) => deckIds.has(c.deckId))
        .map((c) => c.id);
      const logs = await db.reviewLogs.where('cardId').anyOf(cardIds).toArray();
      if (id !== deckId) return;
      current = d?.config.fsrsParams;
      training = buildTrainingSet(logs, rolloverHour);
    })();
  });

  async function run() {
    if (!training) return;
    busy = true;
    error = '';
    try {
      const worker = new Worker(new URL('../workers/optimize.worker.ts', import.meta.url), {
        type: 'module',
      });
      const res = await new Promise<OptimizeResponse>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<OptimizeResponse>) => resolve(e.data);
        worker.onerror = (e) => reject(new Error(e.message || 'The optimizer crashed.'));
        const { ratings, deltaTs, lengths } = training!;
        worker.postMessage({ ratings, deltaTs, lengths } satisfies OptimizeRequest);
      });
      worker.terminate();
      if (!res.ok) throw new Error(res.error);
      result = res;
    } catch (err) {
      error = `Optimization failed: ${(err as Error).message}`;
    } finally {
      busy = false;
    }
  }

  async function save() {
    if (!result || !training) return;
    const config = {
      fsrsParams: result.params,
      fsrsOptimizedAt: Date.now(),
      fsrsOptimizedReviews: training.reviews,
    };
    // Sub-decks are studied with their own settings, so give them the parameters too.
    for (const id of await deckSubtreeIds(db, deckId)) await updateDeckConfig(db, id, config);
    current = result.params;
    saved = true;
  }

  const days = (d: number) => formatInterval(d * 86_400_000);
  const LABELS = ['Again', 'Hard', 'Good', 'Easy'];
</script>

<header class="app-header">
  <a class="brand" href="{base}#/">
    <img src={logo} alt="" width="32" height="32" />
    <span>Nenrin</span>
  </a>
</header>

<main>
  <nav class="crumbs muted">
    <a href="{base}#/{deckId ? `deck/${deckId}` : ''}">← Back to Nenrin</a>
  </nav>
  <h1>Optimize scheduling</h1>
  <p class="muted lede">
    FSRS starts with parameters fitted to millions of reviews from many people. Optimizing fits them
    to <strong>your</strong> review history instead, so intervals match how you actually remember. It
    runs on this device; nothing is uploaded.
  </p>

  {#if !isolated}
    <div class="panel warn">
      <p>
        This browser can’t run the optimizer here yet: it needs the offline version of Nenrin. Open
        Nenrin once, then come back to this page. (Safari may not support it.)
      </p>
    </div>
  {:else if decks.length === 0}
    <p>No decks yet. <a href="{base}#/">Go to Nenrin</a></p>
  {:else}
    <div class="panel stack">
      <label>
        Deck <span class="muted small">(sub-decks included)</span>
        <select bind:value={deckId}>
          {#each decks as d (d.id)}<option value={d.id}>{d.path}</option>{/each}
        </select>
      </label>
      {#if training}
        <p>
          <strong>{training.reviews.toLocaleString()}</strong> reviews ·
          <strong>{training.cards.toLocaleString()}</strong> cards with history ·
          {training.items.toLocaleString()} training samples
        </p>
        {#if training.items < MIN_ITEMS}
          <p class="warn-text">
            Not enough history yet. Keep studying; around {RECOMMENDED_REVIEWS} reviews gives reliable
            results.
          </p>
        {:else if training.reviews < RECOMMENDED_REVIEWS}
          <p class="muted small">
            That’s a small history ({RECOMMENDED_REVIEWS}+ reviews is better); results may shift as
            you study more.
          </p>
        {/if}
        <div>
          <button onclick={run} disabled={busy || training.items < MIN_ITEMS}>
            {busy ? 'Optimizing…' : 'Optimize'}
          </button>
        </div>
      {:else}
        <p class="muted">Counting reviews…</p>
      {/if}
      {#if current && !result}
        <p class="muted small">This deck already uses personal parameters.</p>
      {/if}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if result}
      <section class="panel stack" aria-live="polite">
        <h2>Your parameters</h2>
        <p class="muted small">
          How long a brand-new card stays at 90% recall after your first rating, before and after
          optimizing. ({result.ms} ms)
        </p>
        <table>
          <thead><tr><th>First rating</th><th>Default</th><th>Yours</th></tr></thead>
          <tbody>
            {#each LABELS as label, i (label)}
              <tr>
                <td>{label}</td>
                <td>{days((current ?? result.defaults)[i])}</td>
                <td><strong>{days(result.params[i])}</strong></td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="row">
          <button onclick={save} disabled={saved}
            >{saved ? 'Saved' : `Use for ${deck?.name}`}</button
          >
          {#if saved}
            <span class="ok" role="status"
              >Saved. Future reviews in this deck use your parameters.</span
            >
          {/if}
        </div>
      </section>
    {/if}
  {/if}
</main>

<style>
  .app-header {
    padding: 1.1rem 0 1rem;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: inherit;
    text-decoration: none;
    font-weight: 700;
    font-size: 1.2rem;
  }
  main {
    flex: 1;
  }
  h1 {
    font-size: 1.6rem;
    margin: 0.25rem 0 0.5rem;
  }
  h2 {
    font-size: 1.1rem;
    margin: 0;
  }
  .lede {
    margin: 0 0 1.25rem;
  }
  .stack {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .stack p {
    margin: 0;
  }
  .small {
    font-size: 0.85rem;
  }
  .warn {
    background: var(--accent-soft);
  }
  .warn-text {
    color: var(--accent);
  }
  .ok {
    color: var(--good);
    font-weight: 600;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: left;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: 600;
  }
</style>
