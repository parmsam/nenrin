<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../lib/db';
  import { deckTree } from '../lib/db/decks';
  import { router } from '../lib/router.svelte';
  import { studyState } from '../lib/study/queue';
  import { shouldShowSplash, SPLASH_SEEN_KEY } from '../lib/splash';

  const logo = `${import.meta.env.BASE_URL}logo.svg`;
  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let visible = $state(false);
  let leaving = $state(false);
  let due = $state<number | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    // Only on a plain launch: not over a deep link, and once per session.
    if (!shouldShowSplash(router.path)) return;
    (async () => {
      const top = deckTree(await db.decks.toArray()).filter((d) => d.depth === 0);
      // First-time users get the welcome screen instead.
      if (top.length === 0) return;
      const states = await Promise.all(top.map((d) => studyState(db, d.id)));
      due = states.reduce((n, s) => n + s.counts.new + s.counts.learning + s.counts.review, 0);
      try {
        sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
      } catch {
        // Session storage unavailable: it may show again on reload, which is harmless.
      }
      visible = true;
      timer = setTimeout(dismiss, reduceMotion ? 1000 : 1500);
    })();
    return () => clearTimeout(timer);
  });

  function dismiss() {
    if (!visible || leaving) return;
    clearTimeout(timer);
    leaving = true;
    setTimeout(() => (visible = false), reduceMotion ? 0 : 250);
  }
</script>

<svelte:window onkeydown={dismiss} />

{#if visible}
  <!-- Decorative: the home screen underneath carries the same information. -->
  <div
    class="splash"
    class:leaving
    class:still={reduceMotion}
    aria-hidden="true"
    onpointerdown={dismiss}
  >
    <img src={logo} alt="" width="120" height="120" />
    <p class="name">Nenrin</p>
    <p class="kanji" lang="ja"><ruby>年輪<rp>(</rp><rt>ねんりん</rt><rp>)</rp></ruby></p>
    <p class="tagline">Memory grows ring by ring</p>
    {#if due !== null}
      <p class="due">
        {due > 0 ? `${due} ${due === 1 ? 'card' : 'cards'} to study today` : 'All done for today'}
      </p>
    {/if}
  </div>
{/if}

<style>
  .splash {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.25rem;
    background: var(--hero);
    color: var(--hero-text);
    text-align: center;
    animation: in 0.35s ease both;
    transition: opacity 0.25s ease;
  }
  .splash.leaving {
    opacity: 0;
  }
  img {
    animation: grow 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  p {
    margin: 0;
  }
  .name {
    margin-top: 1rem;
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .kanji {
    font-size: 1.4rem;
    letter-spacing: 0.15em;
    opacity: 0.85;
  }
  .kanji rt {
    font-size: 0.45em;
    letter-spacing: 0.1em;
  }
  .tagline {
    margin-top: 0.75rem;
    opacity: 0.8;
  }
  .due {
    margin-top: 1.25rem;
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--hero-text) 14%, transparent);
    font-weight: 600;
  }
  .still,
  .still img {
    animation: none;
    transition: none;
  }
  @keyframes in {
    from {
      opacity: 0;
    }
  }
  @keyframes grow {
    from {
      transform: scale(0.82) rotate(-12deg);
      opacity: 0;
    }
  }
</style>
