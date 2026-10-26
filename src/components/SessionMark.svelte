<script lang="ts">
  /**
   * The session mark beside the counts: 木 → 林 → 森 as cards are answered, whatever the
   * rating (rewards never depend on which button you press).
   */
  import { playClack } from '../lib/sound';
  import { sessionMark } from '../lib/study/rewards';

  let { answered, sound = false }: { answered: number; sound?: boolean } = $props();

  const mark = $derived(sessionMark(answered));
  let shown = $state(-1);
  let fresh = $state(false);

  // A newly reached mark pops in (and clacks, if sounds are on); undo just steps back quietly.
  $effect(() => {
    const at = mark?.at ?? -1;
    if (at > shown && shown !== -1 && mark) {
      fresh = true;
      if (sound) playClack();
      setTimeout(() => (fresh = false), 900);
    }
    shown = at;
  });
</script>

{#if mark}
  <span
    class="mark"
    class:fresh
    role="img"
    aria-label="Session mark: {mark.name}, {mark.at} cards"
    title="{mark.name}: {mark.at} cards this session"
  >
    <span lang="ja" class="kanji">{mark.kanji}</span>
    {#each Array.from({ length: mark.rings }, (_v, i) => i) as i (i)}<span
        class="ring"
        style="--r: {i}"
      ></span>{/each}
  </span>
{/if}

<style>
  .mark {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
    flex: none;
  }
  .kanji {
    font-size: 1.1rem;
    line-height: 1;
  }
  .ring {
    position: absolute;
    inset: calc(-3px - var(--r) * 4px);
    border: 1.5px solid var(--accent);
    border-radius: 50%;
    opacity: 0.6;
  }
  @media (prefers-reduced-motion: no-preference) {
    .fresh {
      animation: pop 0.6s cubic-bezier(0.2, 0.8, 0.3, 1.4);
    }
  }
  @keyframes pop {
    from {
      transform: scale(0.3);
      opacity: 0;
    }
  }
</style>
