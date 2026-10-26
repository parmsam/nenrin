<script lang="ts">
  /**
   * 御朱印帳: a red seal on each day you finished everything due, a light mark on days you
   * studied, and milestone seals. Nothing is ever taken away; a missed day is just blank.
   */
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db';
  import { loadRewards, stampMonth } from '../lib/study/rewards';

  /** Scroll the book into view once it's drawn (linked from "Done for now"). */
  let { focus = false }: { focus?: boolean } = $props();

  const data = liveQuery(() => loadRewards(db));
  let section: HTMLElement | undefined = $state();
  $effect(() => {
    if ($data && section && focus) section.scrollIntoView({ block: 'start' });
  });
  const now = new Date();
  let month = $state(new Date(now.getFullYear(), now.getMonth(), 1));

  const weeks = $derived(
    $data
      ? stampMonth(
          month.getFullYear(),
          month.getMonth(),
          $data.stamps,
          $data.studied,
          $data.milestones,
        )
      : [],
  );
  const stampsThisMonth = $derived(weeks.flat().filter((d) => d?.kind === 'stamp').length);
  const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  const dateFmt = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + i)),
  );
  const isCurrent = $derived(
    month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth(),
  );

  const step = (by: number) => (month = new Date(month.getFullYear(), month.getMonth() + by, 1));
  const fromKey = (k: string) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  function label(d: NonNullable<(typeof weeks)[number][number]>): string {
    const parts = [dateFmt.format(fromKey(d.key))];
    if (d.kind === 'stamp') parts.push('finished everything due');
    else if (d.kind === 'studied') parts.push('studied');
    for (const m of d.seals) parts.push(`milestone: ${m.name}`);
    return parts.join(', ');
  }
</script>

<section class="panel book" id="stamp-book" aria-labelledby="stamp-book-title" bind:this={section}>
  <div class="head">
    <h3 id="stamp-book-title">Stamp book <span lang="ja" class="muted">御朱印帳</span></h3>
    <div class="row nav">
      <button class="secondary tiny" onclick={() => step(-1)} aria-label="Previous month">←</button>
      <span class="month">{monthFmt.format(month)}</span>
      <button
        class="secondary tiny"
        onclick={() => step(1)}
        disabled={isCurrent}
        aria-label="Next month">→</button
      >
    </div>
  </div>
  <p class="muted small">
    A seal for each day you finished everything due{stampsThisMonth
      ? ` (${stampsThisMonth} this month)`
      : ''}; a light mark for days you studied.
  </p>

  <table class="grid">
    <thead>
      <tr
        >{#each weekdays as w, i (i)}<th scope="col">{w}</th>{/each}</tr
      >
    </thead>
    <tbody>
      {#each weeks as week, i (i)}
        <tr>
          {#each week as day, j (j)}
            <td>
              {#if day}
                <span
                  class="day {day.kind ?? ''}"
                  class:sealed={day.seals.length > 0}
                  class:today={day.key === $data?.today}
                  aria-label={label(day)}
                  title={label(day)}
                >
                  {#if day.kind === 'stamp'}<span lang="ja" aria-hidden="true">印</span>{:else}<span
                      aria-hidden="true">{day.date}</span
                    >{/if}
                </span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  {#if $data?.milestones.length}
    <h4>Milestones <span lang="ja" class="muted">節目</span></h4>
    <ul class="milestones">
      {#each $data.milestones as m (m.id)}
        <li>
          <span lang="ja" class="seal">{m.kanji}</span>
          <span
            ><strong>{m.name}</strong>
            <span class="muted small">{dateFmt.format(fromKey(m.day))}</span><br /><span
              class="muted small">{m.description}</span
            ></span
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .book {
    margin-top: 1.5rem;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  h4 {
    margin: 1.25rem 0 0.5rem;
    font-size: 0.95rem;
  }
  .nav {
    align-items: center;
    gap: 0.4rem;
  }
  .month {
    min-width: 8.5rem;
    text-align: center;
    font-weight: 600;
  }
  .tiny {
    padding: 0.25rem 0.6rem;
    font-size: 0.85rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .grid {
    width: 100%;
    max-width: 24rem;
    border-collapse: separate;
    border-spacing: 4px;
    margin: 0.5rem 0;
  }
  th {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
  }
  td {
    text-align: center;
    padding: 0;
  }
  .day {
    display: inline-grid;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 8px;
    font-size: 0.8rem;
    color: var(--muted);
    position: relative;
  }
  .day.studied {
    background: var(--accent-soft);
    color: var(--text);
  }
  /* A vermilion temple seal, a little askew as if pressed by hand. */
  .day.stamp {
    background: var(--stamp);
    color: var(--stamp-text);
    font-weight: 700;
    font-size: 1rem;
    transform: rotate(-4deg);
  }
  .day.today {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .day.sealed::after {
    content: '';
    position: absolute;
    top: -3px;
    right: -3px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--surface);
  }
  .milestones {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.6rem;
  }
  .milestones li {
    display: flex;
    gap: 0.7rem;
    align-items: center;
  }
  .seal {
    display: inline-grid;
    place-items: center;
    min-width: 2.4rem;
    height: 2.4rem;
    padding: 0 0.3rem;
    border-radius: 50%;
    border: 2px solid var(--stamp);
    color: var(--stamp);
    font-weight: 700;
    flex: none;
  }
</style>
