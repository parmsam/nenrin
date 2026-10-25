<script lang="ts">
  import { liveQuery } from 'dexie';
  import CardStages from '../components/charts/CardStages.svelte';
  import Forecast from '../components/charts/Forecast.svelte';
  import Heatmap from '../components/charts/Heatmap.svelte';
  import { db } from '../lib/db';
  import { deckTree } from '../lib/db/decks';
  import { navigate, router } from '../lib/router.svelte';
  import { loadStats } from '../lib/study/stats';

  let deckId = $state(router.query.get('deck') ?? '');

  const decks = liveQuery(async () => deckTree(await db.decks.toArray()));
  // Re-reads whenever reviews or cards change; keeps the last result while recomputing.
  const stats = $derived(liveQuery(() => loadStats(db, deckId || undefined)));

  $effect(() => {
    const target = deckId ? `/stats?deck=${encodeURIComponent(deckId)}` : '/stats';
    if (location.hash.slice(1) !== target) navigate(target, { replace: true });
  });

  const pct = (p: number, t: number) => (t ? `${Math.round((p / t) * 100)}%` : '–');
  const weekFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const dayFmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
</script>

<nav class="crumbs muted"><a href="#/">← Decks</a></nav>
<h2>Stats</h2>

<div class="filters">
  <label>
    <span class="visually-hidden">Deck</span>
    <select bind:value={deckId} aria-label="Deck">
      <option value="">All decks</option>
      {#each $decks ?? [] as d (d.id)}<option value={d.id}>{d.path}</option>{/each}
    </select>
  </label>
  {#if deckId}
    <a class="button secondary" href="{import.meta.env.BASE_URL}optimize.html?deck={deckId}"
      >Optimize this deck…</a
    >
  {/if}
</div>

{#if $stats === undefined}
  <p class="muted">Loading…</p>
{:else}
  {@const s = $stats}
  <section class="tiles" aria-label="Summary">
    <div class="tile">
      <span class="label">Reviews today</span>
      <span class="value">{s.reviewsToday.toLocaleString()}</span>
      <span class="sub">{s.minutesToday} min</span>
    </div>
    <div class="tile">
      <span class="label">Streak</span>
      <span class="value">{s.streak} {s.streak === 1 ? 'day' : 'days'}</span>
      <span class="sub">Longest: {s.longestStreak}</span>
    </div>
    <div class="tile">
      <span class="label">Retention, 30 days</span>
      <span class="value">{pct(s.retention30.passed, s.retention30.total)}</span>
      <span class="sub">of {s.retention30.total.toLocaleString()} reviews of learned cards</span>
    </div>
    <div class="tile">
      <span class="label">Reviews, 30 days</span>
      <span class="value">{s.reviews30.toLocaleString()}</span>
      <span class="sub">{Math.round(s.reviews30 / 30)} a day</span>
    </div>
  </section>

  <section class="panel chart">
    <h3>Activity</h3>
    <Heatmap days={s.heatmap} />
    <details>
      <summary>Show as table</summary>
      <table>
        <thead><tr><th>Week of</th><th>Reviews</th><th>Days studied</th></tr></thead>
        <tbody>
          {#each Array.from( { length: Math.ceil(s.heatmap.length / 7) }, (_, w) => s.heatmap.slice(w * 7, w * 7 + 7) ).reverse() as week (week[0].day)}
            <tr>
              <td>{weekFmt.format(new Date(week[0].day))}</td>
              <td>{week.reduce((n, d) => n + d.count, 0)}</td>
              <td>{week.filter((d) => d.count > 0).length}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </details>
  </section>

  <section class="panel chart">
    <h3>Coming due, next 30 days</h3>
    <Forecast days={s.forecast} />
    <details>
      <summary>Show as table</summary>
      <table>
        <thead><tr><th>Day</th><th>Reviews due</th></tr></thead>
        <tbody>
          {#each s.forecast.filter((d) => d.count > 0) as d (d.day)}
            <tr><td>{dayFmt.format(new Date(d.day))}</td><td>{d.count}</td></tr>
          {/each}
        </tbody>
      </table>
    </details>
  </section>

  <section class="panel chart">
    <h3>Cards by stage</h3>
    <CardStages cards={s.cards} />
  </section>
{/if}

<style>
  .crumbs {
    font-size: 0.875rem;
  }
  h2 {
    margin: 0.25rem 0 1rem;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 1rem;
  }
  .filters select {
    width: auto;
    min-width: 12rem;
  }
  .filters .button {
    padding: 0.55rem 1rem;
    font-size: 0.9rem;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.6rem;
    margin-bottom: 1rem;
  }
  .tile {
    display: grid;
    gap: 0.1rem;
    padding: 0.85rem 1rem;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .label {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .value {
    font-size: 1.6rem;
    font-weight: 650;
  }
  .sub {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .chart {
    margin-bottom: 1rem;
  }
  .chart h3 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }
  details {
    margin-top: 0.75rem;
    font-size: 0.85rem;
  }
  summary {
    cursor: pointer;
    color: var(--muted);
  }
  table {
    margin-top: 0.5rem;
    border-collapse: collapse;
    width: 100%;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: left;
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: 600;
  }
</style>
