<script lang="ts">
  import type { DayCount } from '../../lib/study/stats';

  /** Reviews per study day, oldest first, starting on a Monday (see computeStats). */
  let { days }: { days: DayCount[] } = $props();

  const CELL = 12;
  const GAP = 3;
  const LEFT = 26; // weekday labels
  const TOP = 16; // month labels

  const weeks = $derived(Math.ceil(days.length / 7));
  const width = $derived(LEFT + weeks * (CELL + GAP));
  const height = TOP + 7 * (CELL + GAP);
  const max = $derived(Math.max(1, ...days.map((d) => d.count)));

  /**
   * 0 for no reviews, then four steps of one hue (sequential). Square-root scaled so a few
   * very busy days (e.g. a big import) don't wash every ordinary day out to the palest step.
   */
  function level(count: number): number {
    if (count === 0) return 0;
    return Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count / max) * 4)));
  }

  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });

  const months = $derived(
    days.flatMap((d, i) => {
      const date = new Date(d.day);
      return i % 7 === 0 && date.getDate() <= 7
        ? [{ x: LEFT + Math.floor(i / 7) * (CELL + GAP), label: monthFmt.format(date) }]
        : [];
    }),
  );

  let active = $state<number | null>(null);
  let scroller: HTMLDivElement | undefined = $state();

  // On narrow screens the grid scrolls; start at today, not at the oldest week.
  $effect(() => {
    if (scroller && days.length) scroller.scrollLeft = scroller.scrollWidth;
  });
  const activeDay = $derived(active === null ? null : days[active]);

  function onKey(e: KeyboardEvent) {
    const step = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const from = active ?? days.length - 1;
    active = Math.min(days.length - 1, Math.max(0, from + step));
  }

  const total = $derived(days.reduce((n, d) => n + d.count, 0));
  const studied = $derived(days.filter((d) => d.count > 0).length);
</script>

<div class="heatmap">
  <div class="scroll" bind:this={scroller}>
    <!-- Arrow keys/hover add a readout; the same values are in the label and the table view. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <svg
      viewBox="0 0 {width} {height}"
      role="img"
      tabindex="0"
      aria-label="Review heatmap: {total} reviews on {studied} of the last {days.length} days. Use arrow keys to read days."
      onkeydown={onKey}
      onblur={() => (active = null)}
    >
      {#each months as m (m.x)}
        <text x={m.x} y="10" class="axis">{m.label}</text>
      {/each}
      {#each [['Mon', 0], ['Wed', 2], ['Fri', 4]] as [label, row] (label)}
        <text x="0" y={TOP + Number(row) * (CELL + GAP) + CELL - 2} class="axis">{label}</text>
      {/each}
      {#each days as d, i (d.day)}
        <rect
          x={LEFT + Math.floor(i / 7) * (CELL + GAP)}
          y={TOP + (i % 7) * (CELL + GAP)}
          width={CELL}
          height={CELL}
          rx="2.5"
          class="l{level(d.count)}"
          class:active={active === i}
          role="presentation"
          onpointerenter={() => (active = i)}
          onpointerleave={() => (active = null)}
        />
      {/each}
    </svg>
  </div>
  <div class="foot">
    <span class="tip" aria-live="polite">
      {#if activeDay}
        <strong>{activeDay.count}</strong>
        {activeDay.count === 1 ? 'review' : 'reviews'} · {fmt.format(new Date(activeDay.day))}
      {:else}
        {total} reviews on {studied} days
      {/if}
    </span>
    <span class="legend" aria-hidden="true">
      Less
      {#each [0, 1, 2, 3, 4] as l (l)}<i class="l{l}"></i>{/each}
      More
    </span>
  </div>
</div>

<style>
  .scroll {
    overflow-x: auto;
  }
  svg {
    width: 100%;
    min-width: 30rem;
    height: auto;
    display: block;
  }
  svg:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 4px;
    border-radius: 6px;
  }
  .axis {
    font-size: 8px;
    fill: var(--muted);
  }
  rect.active {
    stroke: var(--text);
    stroke-width: 1.5;
  }
  .l0 {
    fill: var(--surface-2);
    background: var(--surface-2);
  }
  .l1 {
    fill: color-mix(in oklab, var(--accent) 25%, var(--surface));
    background: color-mix(in oklab, var(--accent) 25%, var(--surface));
  }
  .l2 {
    fill: color-mix(in oklab, var(--accent) 50%, var(--surface));
    background: color-mix(in oklab, var(--accent) 50%, var(--surface));
  }
  .l3 {
    fill: color-mix(in oklab, var(--accent) 75%, var(--surface));
    background: color-mix(in oklab, var(--accent) 75%, var(--surface));
  }
  .l4 {
    fill: var(--accent);
    background: var(--accent);
  }
  .foot {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.4rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .tip strong {
    color: var(--text);
  }
  .legend {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .legend i {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
</style>
