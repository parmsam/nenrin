<script lang="ts">
  /** Today's progress as a growth ring: faint inner rings, and an arc for reviews done. */
  let { done, remaining }: { done: number; remaining: number } = $props();

  const R = 52;
  const C = 2 * Math.PI * R;
  const total = $derived(done + remaining);
  const fraction = $derived(total === 0 ? 0 : done / total);
</script>

<div
  class="ring"
  role="img"
  aria-label={total === 0
    ? 'Nothing due today'
    : `${done} of ${total} done today, ${remaining} left`}
>
  <svg viewBox="0 0 120 120" aria-hidden="true">
    {#each [16, 26, 36] as r (r)}
      <circle cx="60" cy="60" {r} class="inner" />
    {/each}
    <circle cx="60" cy="60" r={R} class="track" />
    <circle
      cx="60"
      cy="60"
      r={R}
      class="arc"
      stroke-dasharray={C}
      stroke-dashoffset={C * (1 - fraction)}
      transform="rotate(-90 60 60)"
    />
  </svg>
  <div class="label">
    {#if remaining > 0}
      <span class="big">{remaining}</span>
      <span class="small">left</span>
    {:else if done > 0}
      <span class="big">✓</span>
      <span class="small">done</span>
    {:else}
      <span class="small">rest day</span>
    {/if}
  </div>
</div>

<style>
  .ring {
    position: relative;
    width: 7.5rem;
    height: 7.5rem;
    flex: none;
  }
  svg {
    width: 100%;
    height: 100%;
  }
  circle {
    fill: none;
  }
  .inner {
    stroke: currentColor;
    stroke-width: 1.5;
    opacity: 0.18;
  }
  .track {
    stroke: currentColor;
    stroke-width: 8;
    opacity: 0.15;
  }
  .arc {
    stroke: var(--hero-accent);
    stroke-width: 8;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.6s ease;
  }
  .label {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
    line-height: 1.1;
  }
  .big {
    font-size: 1.9rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .small {
    font-size: 0.75rem;
    opacity: 0.75;
  }
</style>
