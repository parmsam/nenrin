<script lang="ts">
  import type { DayCount } from '../../lib/study/stats';

  /** Cards due per day, starting today (which includes overdue cards). */
  let { days }: { days: DayCount[] } = $props();

  // Drawn at the container's real width, so axis text stays at its true size on phones.
  let width = $state(600);
  const W = $derived(Math.max(280, Math.round(width)));
  const H = 180;
  const PAD = { top: 16, right: 8, bottom: 22, left: 30 };
  const plotW = $derived(W - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const slot = $derived(plotW / Math.max(1, days.length));
  const barW = $derived(Math.min(24, slot * 0.6));

  /** A "nice" axis maximum (1, 2, 5 × 10ⁿ) at or above the data. */
  function niceMax(v: number): number {
    if (v <= 4) return 4;
    const p = 10 ** Math.floor(Math.log10(v));
    return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
  }
  const max = $derived(niceMax(Math.max(...days.map((d) => d.count), 0)));
  const ticks = $derived([0, max / 2, max]);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  /** Column with a 4px rounded top and a square base on the baseline. */
  function column(i: number, count: number): string {
    const x = PAD.left + i * slot + (slot - barW) / 2;
    const top = y(count);
    const base = PAD.top + plotH;
    const r = Math.min(4, barW / 2, base - top);
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`;
  }

  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const compact = new Intl.NumberFormat(undefined, { notation: 'compact' });
  const label = (i: number) =>
    i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmt.format(new Date(days[i].day));

  let active = $state<number | null>(null);
  const total = $derived(days.reduce((n, d) => n + d.count, 0));
  const peak = $derived(days.reduce((best, d, i) => (d.count > days[best].count ? i : best), 0));

  function onKey(e: KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    active = Math.min(days.length - 1, Math.max(0, (active ?? -1) + step));
  }
</script>

<div class="forecast" bind:clientWidth={width}>
  <!-- Arrow keys/hover add a readout; the same values are in the label and the table view. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <svg
    viewBox="0 0 {W} {H}"
    role="img"
    tabindex="0"
    aria-label="Review forecast: {total} reviews due over the next {days.length} days, most on {label(
      peak,
    )} ({days[peak]?.count ?? 0}). Use arrow keys to read days."
    onkeydown={onKey}
    onblur={() => (active = null)}
  >
    {#each ticks as t (t)}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} class="grid" />
      <text x={PAD.left - 6} y={y(t) + 3} class="axis" text-anchor="end">{compact.format(t)}</text>
    {/each}
    {#each days as d, i (d.day)}
      {#if d.count > 0}
        <path d={column(i, d.count)} class="bar" class:active={active === i} />
      {/if}
      <!-- Hit target: the whole slot, not just the painted column. -->
      <rect
        x={PAD.left + i * slot}
        y={PAD.top}
        width={slot}
        height={plotH}
        class="hit"
        role="presentation"
        onpointerenter={() => (active = i)}
        onpointerleave={() => (active = null)}
      />
    {/each}
    {#if days[peak]?.count}
      <!-- Label only the peak; the axis, readout and table carry the rest. -->
      <text
        x={PAD.left + peak * slot + slot / 2}
        y={y(days[peak].count) - 4}
        class="value"
        text-anchor="middle">{days[peak].count}</text
      >
    {/if}
    {#each [0, 7, 14, 21, days.length - 1] as i (i)}
      {#if days[i]}
        <text x={PAD.left + i * slot + slot / 2} y={H - 6} class="axis" text-anchor="middle"
          >{i === 0 ? 'Today' : `+${i}d`}</text
        >
      {/if}
    {/each}
  </svg>
  <p class="tip" aria-live="polite">
    {#if active !== null}
      <strong>{days[active].count}</strong>
      {days[active].count === 1 ? 'review' : 'reviews'} · {label(active)}
    {:else}
      {total} reviews due in the next {days.length} days
    {/if}
  </p>
</div>

<style>
  svg {
    width: 100%;
    height: auto;
    display: block;
  }
  svg:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 4px;
    border-radius: 6px;
  }
  .grid {
    stroke: var(--border);
    stroke-width: 1;
  }
  .axis {
    font-size: 10px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    fill: var(--accent);
  }
  .value {
    font-size: 11px;
    font-weight: 600;
    fill: var(--text);
  }
  .bar.active {
    fill: color-mix(in oklab, var(--accent) 75%, var(--text));
  }
  .hit {
    fill: transparent;
  }
  .tip {
    margin: 0.3rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .tip strong {
    color: var(--text);
  }
</style>
