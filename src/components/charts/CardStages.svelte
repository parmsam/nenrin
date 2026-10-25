<script lang="ts">
  import type { CardBreakdown } from '../../lib/study/stats';

  let { cards }: { cards: CardBreakdown } = $props();

  // Fixed order and colors (validated in light and dark); suspended is de-emphasis gray.
  const STAGES = [
    { key: 'new', label: 'New', color: 'var(--chart-new)' },
    { key: 'learning', label: 'Learning', color: 'var(--chart-learning)' },
    { key: 'young', label: 'Young', hint: 'interval under 21 days', color: 'var(--chart-young)' },
    { key: 'mature', label: 'Mature', hint: '21 days or more', color: 'var(--chart-mature)' },
    { key: 'suspended', label: 'Suspended', color: 'var(--chart-muted)' },
  ] as const;

  const total = $derived(STAGES.reduce((n, s) => n + cards[s.key], 0));
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  let active = $state<string | null>(null);
</script>

{#if total === 0}
  <p class="muted">No cards yet.</p>
{:else}
  <div
    class="bar"
    role="img"
    aria-label="Cards by stage: {STAGES.map((s) => `${cards[s.key]} ${s.label.toLowerCase()}`).join(
      ', ',
    )}"
  >
    {#each STAGES as s (s.key)}
      {#if cards[s.key] > 0}
        <!-- Hover only highlights; values are in the legend below. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="segment"
          class:dim={active !== null && active !== s.key}
          style:flex-grow={cards[s.key]}
          style:background={s.color}
          title="{s.label}: {cards[s.key]} ({pct(cards[s.key])}%)"
          onpointerenter={() => (active = s.key)}
          onpointerleave={() => (active = null)}
        ></span>
      {/if}
    {/each}
  </div>
  <ul class="legend">
    {#each STAGES as s (s.key)}
      <li
        class:dim={active !== null && active !== s.key}
        onpointerenter={() => (active = s.key)}
        onpointerleave={() => (active = null)}
      >
        <i style:background={s.color} aria-hidden="true"></i>
        <span class="name">{s.label}</span>
        <strong>{cards[s.key].toLocaleString()}</strong>
        <span class="muted">{pct(cards[s.key])}%</span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .bar {
    display: flex;
    gap: 2px; /* surface gap between segments */
    height: 1.25rem;
  }
  .segment {
    flex-basis: 0;
    min-width: 4px;
    transition: opacity 0.15s;
  }
  .segment:first-child {
    border-radius: 4px 0 0 4px;
  }
  .segment:last-child {
    border-radius: 0 4px 4px 0;
  }
  .segment:only-child {
    border-radius: 4px;
  }
  .dim {
    opacity: 0.35;
  }
  .legend {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.35rem 1rem;
    font-size: 0.875rem;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition: opacity 0.15s;
  }
  .legend i {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 2px;
    flex: none;
  }
  .name {
    flex: 1;
  }
  strong {
    font-variant-numeric: tabular-nums;
  }
</style>
