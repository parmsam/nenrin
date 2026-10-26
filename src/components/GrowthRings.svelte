<script lang="ts">
  /**
   * 年輪: a tree cross-section of your studying. Each past ring is a day you studied (wider for
   * more reviews), older days darken into heartwood, and long breaks leave a scar; the outer
   * arc is today's ring, closing as you finish today's cards.
   */
  import {
    CENTER,
    PITH,
    TODAY_R,
    ringPath,
    ringsDescription,
    treeLayout,
  } from '../lib/study/rings';
  import type { Season } from '../lib/study/rewards';

  let {
    done,
    remaining,
    growth = [],
    season = null,
  }: {
    done: number;
    remaining: number;
    /** Reviews per day before today, oldest first. */
    growth?: number[];
    /** Rewards: blossom, leaves, maple or snow around the tree. */
    season?: Season | null;
  } = $props();

  /** Corners of the viewBox, clear of today's ring: x, y, rotation, size. */
  const SPOTS = [
    [9, 11, 20, 1.5],
    [24, 4, -35, 1.1],
    [109, 9, 60, 1.5],
    [116, 26, -10, 1.05],
    [111, 108, 35, 1.4],
    [6, 105, -50, 1.25],
  ] as const;

  const tree = $derived(treeLayout(growth));
  const total = $derived(done + remaining);
  const fraction = $derived(total === 0 ? 0 : done / total);
  const complete = $derived(total > 0 && remaining === 0);
  const description = $derived(ringsDescription(growth, done, remaining));
  const todayPath = ringPath(TODAY_R);
</script>

<div class="rings" role="img" aria-label={description} title={description}>
  <svg viewBox="0 0 120 120" aria-hidden="true">
    <!-- Each band is its own annulus (outer outline minus inner), so tones don't stack. -->
    {#if tree.heartwood > 0}
      <path d={ringPath(tree.heartwood)} class="heartwood grow" style="--i: 0" />
    {/if}
    {#each tree.rings as ring, i (i)}
      <g class="grow" style="--i: {i + 1}">
        <path
          d="{ringPath(ring.outer)} {ringPath(ring.inner)}"
          fill-rule="evenodd"
          class="band"
          class:late={i % 2 === 1}
        />
        <path d={ringPath(ring.outer)} class="line" />
      </g>
    {/each}
    {#each tree.scars as r (r)}
      <path d={ringPath(r)} class="scar grow" style="--i: {tree.rings.length}" />
    {/each}
    <circle cx={CENTER} cy={CENTER} r={PITH} class="pith" />

    {#if season}
      <g class="season {season}">
        {#each SPOTS as [x, y, angle, size], i (i)}
          <g transform="translate({x} {y}) rotate({angle}) scale({size})" style="--d: {i}">
            {#if season === 'spring'}
              <!-- A cherry petal, notched at the tip. -->
              <path
                d="M0 -3.4 C2.6 -2.4 2.6 1.8 0 3 C-2.6 1.8 -2.6 -2.4 0 -3.4 Z M-0.7 -3.6 L0 -2.4 L0.7 -3.6"
              />
            {:else if season === 'summer'}
              <path d="M0 -4 C3 -1.5 3 1.5 0 4 C-3 1.5 -3 -1.5 0 -4 Z" />
            {:else if season === 'autumn'}
              <!-- A maple leaf: five points. -->
              <path
                d="M0 -4 L1 -1.4 L3.8 -2.2 L2.3 0.2 L3.2 1.6 L0.6 1.2 L0.4 4 L-0.4 4 L-0.6 1.2 L-3.2 1.6 L-2.3 0.2 L-3.8 -2.2 L-1 -1.4 Z"
              />
            {:else}
              <circle r="1.7" />
            {/if}
          </g>
        {/each}
      </g>
    {/if}

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
        style="--rings: {tree.rings.length + 1}"
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
  /* Older days, merged into a darker core, as in a real trunk. */
  .heartwood {
    fill: currentColor;
    fill-opacity: 0.32;
  }
  /* A long break: a dark, tight line, like a hard year. */
  .scar {
    fill: none;
    stroke: currentColor;
    stroke-opacity: 0.85;
    stroke-width: 1.3;
  }
  .pith {
    fill: currentColor;
    fill-opacity: 0.6;
  }
  .season.spring {
    fill: var(--season-spring);
  }
  .season.summer {
    fill: var(--season-summer);
  }
  .season.autumn {
    fill: var(--season-autumn);
  }
  .season.winter {
    fill: var(--season-winter);
  }
  .season.spring path {
    fill-rule: evenodd;
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
    .grow {
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
  @media (prefers-reduced-motion: no-preference) {
    /* Petals, leaves and snow drift a little, each at its own pace. */
    .season > g {
      animation: drift 6s ease-in-out infinite alternate;
      animation-delay: calc(var(--d) * -1.3s);
    }
  }
  @keyframes drift {
    to {
      translate: 0 2px;
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
