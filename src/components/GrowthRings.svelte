<script lang="ts">
  /**
   * 年輪: a tree cross-section of your studying. Each past ring is a day you studied (wider for
   * more reviews); the outer arc is today's ring, closing as you finish today's cards.
   */
  import { CENTER, PITH, TODAY_R, ringPath, ringRadii, ringsDescription } from '../lib/study/rings';

  let {
    done,
    remaining,
    growth = [],
  }: {
    done: number;
    remaining: number;
    /** Reviews per day before today, oldest first. */
    growth?: number[];
  } = $props();

  const radii = $derived(ringRadii(growth));
  const total = $derived(done + remaining);
  const fraction = $derived(total === 0 ? 0 : done / total);
  const complete = $derived(total > 0 && remaining === 0);
  const description = $derived(ringsDescription(growth, done, remaining));
  const todayPath = ringPath(TODAY_R);
</script>

<div class="rings" role="img" aria-label={description} title={description}>
  <svg viewBox="0 0 120 120" aria-hidden="true">
    <!-- Each band is its own annulus (outer outline minus inner), so tones don't stack. -->
    {#each radii as r, i (i)}
      <g class="ring" style="--i: {i}">
        <path
          d="{ringPath(r)} {ringPath(i === 0 ? PITH : radii[i - 1])}"
          fill-rule="evenodd"
          class="band"
          class:late={i % 2 === 1}
        />
        <path d={ringPath(r)} class="line" />
      </g>
    {/each}
    <circle cx={CENTER} cy={CENTER} r={PITH} class="pith" />

    <path d={todayPath} class="track" />
    <!-- Not drawn at zero: a round-capped empty stroke would still show a dot. -->
    {#if fraction > 0}
      <path
        d={todayPath}
        class="today"
        class:complete
        pathLength="1"
        stroke-dasharray="1"
        stroke-dashoffset={1 - fraction}
        style="--rings: {radii.length}"
      />
    {/if}
  </svg>
</div>

<style>
  .rings {
    position: relative;
    width: 9rem;
    height: 9rem;
    flex: none;
  }
  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  /* Earlywood and latewood: alternating light and dark bands, with a fine line at each edge. */
  .band {
    fill: currentColor;
    fill-opacity: 0.1;
  }
  .band.late {
    fill-opacity: 0.24;
  }
  .line {
    fill: none;
    stroke: currentColor;
    stroke-opacity: 0.5;
    stroke-width: 0.7;
  }
  .pith {
    fill: currentColor;
    fill-opacity: 0.6;
  }
  .track,
  .today {
    fill: none;
    stroke-width: 7;
    stroke-linecap: round;
  }
  .track {
    stroke: currentColor;
    stroke-opacity: 0.13;
  }
  .today {
    stroke: var(--hero-accent);
    transition: stroke-dashoffset 0.6s ease;
  }
  /* A finished day's ring glows once, as it joins the tree. */
  .today.complete {
    animation: settle 1.2s ease-out;
  }

  @media (prefers-reduced-motion: no-preference) {
    /* Rings grow outward from the pith, oldest first, then today's arc draws in. */
    .ring {
      transform-box: view-box;
      transform-origin: 60px 60px;
      animation: grow 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both;
      animation-delay: calc(var(--i) * 28ms);
    }
    .today {
      animation: draw 0.9s ease-out both;
      animation-delay: calc(var(--rings) * 28ms + 150ms);
    }
    .today.complete {
      animation:
        draw 0.9s ease-out both,
        settle 1.2s ease-out;
    }
  }
  @keyframes grow {
    from {
      transform: scale(0.15);
      opacity: 0;
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
  }
  @keyframes settle {
    40% {
      filter: drop-shadow(0 0 4px var(--hero-accent));
    }
  }
</style>
