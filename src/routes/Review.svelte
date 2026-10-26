<script lang="ts">
  import { onMount } from 'svelte';
  import CardView from '../components/CardView.svelte';
  import Counts from '../components/Counts.svelte';
  import { db, DEFAULT_PREFS, type Card, type Prefs } from '../lib/db';
  import { getPrefs } from '../lib/db/prefs';
  import {
    hideCards,
    recordReview,
    restoreCards,
    undoReview,
    type CardsUndo,
    type UndoEntry,
  } from '../lib/db/repo';
  import type { RenderedCard } from '../lib/render';
  import { cardContent } from '../lib/study/content';
  import { navigate } from '../lib/router.svelte';
  import { createScheduler, GRADES, Rating, State, type Grade } from '../lib/scheduler';
  import { formatInterval, nextDayStart } from '../lib/study/day';
  import {
    LEARN_AHEAD_MS,
    sessionProgress,
    studyState,
    type StudyCounts,
  } from '../lib/study/queue';
  import { paletteState } from '../lib/palette.svelte';
  import { isTyping, shortcutsDialog } from '../lib/shortcuts.svelte';

  let { deckId }: { deckId: string } = $props();

  const LABELS: Record<Grade, string> = {
    [Rating.Again]: 'Again',
    [Rating.Hard]: 'Hard',
    [Rating.Good]: 'Good',
    [Rating.Easy]: 'Easy',
  };
  const HIDE_ACTIONS = [
    { key: '-', label: 'Bury card', action: 'bury', scope: 'card' },
    { key: '=', label: 'Bury note', action: 'bury', scope: 'note' },
    { key: '@', label: 'Suspend card', action: 'suspend', scope: 'card' },
    { key: '!', label: 'Suspend note', action: 'suspend', scope: 'note' },
  ] as const;
  /** Cap on the time recorded for one card, so walking away doesn't skew stats (as in Anki). */
  const MAX_ANSWER_MS = 60_000;

  let deckName = $state('');
  let counts = $state<StudyCounts>({ new: 0, learning: 0, review: 0 });
  let card = $state.raw<Card | null>(null);
  let rendered = $state<RenderedCard>({ front: '', back: '' });
  let cardCss = $state('');
  let prefs = $state<Prefs>({ ...DEFAULT_PREFS });
  let cardView: CardView | undefined = $state();
  let intervals = $state<Record<Grade, string> | null>(null);
  let revealed = $state(false);
  /** Type-in-the-answer text for the current card. */
  let typed = $state('');
  let finished = $state(false);
  let waitUntil = $state<number | undefined>();
  // Raw (not deep-proxied): these snapshots go back into IndexedDB, which can't clone Proxies.
  let undoStack = $state.raw<(UndoEntry | CardsUndo)[]>([]);
  /** Cards rated in this session (undo takes one back), for the progress bar. */
  let answered = $state(0);
  const progress = $derived(sessionProgress(answered, counts));
  const left = $derived(counts.new + counts.learning + counts.review);
  /** Short confirmation after bury/suspend/undo, read out by screen readers. */
  let status = $state('');
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  let moreMenu: HTMLDetailsElement | undefined = $state();
  let busy = false;
  let shownAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const kind = $derived<keyof StudyCounts | undefined>(
    !card
      ? undefined
      : card.state === State.New
        ? 'new'
        : card.state === State.Review
          ? 'review'
          : 'learning',
  );

  /** Shows the next card, or a specific one (after undo). */
  async function load(force?: Card) {
    clearTimeout(timer);
    const deck = await db.decks.get(deckId);
    if (!deck) return navigate('/', { replace: true });
    deckName = deck.name;
    const now = Date.now();
    const state = await studyState(db, deckId, now);
    counts = state.counts;
    const next = force ?? state.next;
    if (!next) {
      card = null;
      finished = true;
      waitUntil = state.waitUntil;
      if (waitUntil) timer = setTimeout(load, Math.max(1000, waitUntil - LEARN_AHEAD_MS - now));
      return;
    }
    const content = await cardContent(db, next, prefs);
    if (!content) return; // Shouldn't happen: cards are deleted with their note.

    const scheduler = createScheduler({
      desiredRetention: deck.config.desiredRetention,
      params: deck.config.fsrsParams,
    });
    const preview = scheduler.preview(next, now);
    intervals = Object.fromEntries(
      GRADES.map((g) => [g, formatInterval(preview[g] - now)]),
    ) as Record<Grade, string>;
    rendered = content;
    cardCss = content.css;
    card = next;
    finished = false;
    revealed = false;
    typed = '';
    shownAt = now;
  }

  async function rate(grade: Grade) {
    if (!card || !revealed || busy) return;
    busy = true;
    try {
      const durationMs = Math.min(Date.now() - shownAt, MAX_ANSWER_MS);
      undoStack = [...undoStack, await recordReview(db, card.id, grade, { durationMs })];
      answered++;
      await load();
    } finally {
      busy = false;
    }
  }

  async function undo() {
    const entry = undoStack.at(-1);
    if (!entry || busy) return;
    busy = true;
    try {
      if ('logId' in entry) await undoReview(db, entry);
      else await restoreCards(db, entry);
      undoStack = undoStack.slice(0, -1);
      if ('logId' in entry) answered = Math.max(0, answered - 1);
      // Show the card that was rated, buried or suspended again (hide() puts it first).
      await load('logId' in entry ? entry.previous : entry.cards[0]);
      flash('Undone');
    } finally {
      busy = false;
    }
  }

  function flash(text: string) {
    status = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (status = ''), 2500);
  }

  /** Bury (until the next study day) or suspend the current card, or its whole note. */
  async function hide(action: 'bury' | 'suspend', scope: 'card' | 'note') {
    if (!card || busy) return;
    busy = true;
    try {
      const how =
        action === 'bury'
          ? ({ action, until: nextDayStart(Date.now(), prefs.rolloverHour) } as const)
          : ({ action } as const);
      const entry = await hideCards(db, card, how, scope);
      // Undo should bring back the card on screen, so keep it first.
      entry.cards.sort((a, b) => Number(b.id === card?.id) - Number(a.id === card?.id));
      undoStack = [...undoStack, entry];
      const what = scope === 'card' ? 'Card' : 'Note';
      flash(`${what} ${action === 'bury' ? 'buried until tomorrow' : 'suspended'}. Z to undo.`);
      await load();
    } finally {
      busy = false;
    }
  }

  function edit() {
    if (card) navigate(`/edit/${card.noteId}?return=${encodeURIComponent(`/study/${deckId}`)}`);
  }

  function onKey(e: KeyboardEvent) {
    if (isTyping(e) || shortcutsDialog.open || paletteState.open) return;
    // Z or Cmd/Ctrl+Z.
    if (e.key.toLowerCase() === 'z' && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.metaKey || e.ctrlKey || e.altKey) {
      return;
    } else if (e.key === 'Escape') {
      navigate(`/deck/${deckId}`);
    } else if (e.key.toLowerCase() === 'r') {
      cardView?.replay();
    } else if (e.key.toLowerCase() === 'e') {
      edit();
    } else if (e.key === '-') {
      hide('bury', 'card');
    } else if (e.key === '=') {
      hide('bury', 'note');
    } else if (e.key === '@') {
      hide('suspend', 'card');
    } else if (e.key === '!') {
      hide('suspend', 'note');
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!card) return;
      if (revealed) rate(Rating.Good);
      else revealed = true;
    } else if (['1', '2', '3', '4'].includes(e.key)) {
      rate(Number(e.key) as Grade);
    }
  }

  onMount(() => {
    getPrefs(db).then((p) => {
      prefs = p;
      load();
    });
    return () => {
      clearTimeout(timer);
      clearTimeout(statusTimer);
    };
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="review">
  <header>
    <a class="back" href="#/deck/{deckId}" aria-label="Back to deck" title="Back (Esc)">←</a>
    <span class="deck-name">{deckName}</span>
    <Counts {counts} current={kind} />
    <button class="secondary tool" onclick={undo} disabled={undoStack.length === 0} title="Undo (Z)"
      >Undo</button
    >
    <button class="secondary tool" onclick={edit} disabled={!card} title="Edit (E)">Edit</button>
    <details class="more" bind:this={moreMenu}>
      <summary class="tool" aria-label="More actions" title="More actions">⋯</summary>
      <div class="menu panel">
        {#each HIDE_ACTIONS as a (a.key)}
          <button
            class="secondary"
            disabled={!card}
            onclick={() => {
              moreMenu!.open = false;
              hide(a.action, a.scope);
            }}>{a.label} <kbd>{a.key}</kbd></button
          >
        {/each}
      </div>
    </details>
    <button
      class="secondary tool kbd-button"
      onclick={() => (shortcutsDialog.open = true)}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)">?</button
    >
  </header>

  {#if prefs.reviewProgress !== 'off' && (answered > 0 || left > 0)}
    <div class="session-progress">
      <progress
        max="1"
        value={finished ? 1 : progress}
        aria-label="Progress: {answered} done, {left} left"
        title="{answered} done, {left} left"
      ></progress>
      {#if prefs.reviewProgress === 'percent'}
        <span aria-hidden="true">{Math.round(progress * 100)}%</span>
      {:else if prefs.reviewProgress === 'fraction'}
        <span aria-hidden="true">{answered} / {answered + left}</span>
      {/if}
    </div>
  {/if}

  <p class="status" role="status">{status}</p>

  {#if finished}
    <section class="done">
      <img src="{import.meta.env.BASE_URL}logo.svg" alt="" width="96" height="96" />
      <h2>Done for now</h2>
      {#if waitUntil}
        <p class="muted">
          A learning card is due in {formatInterval(waitUntil - Date.now())}. Stay here and it will
          appear.
        </p>
      {:else}
        <p class="muted">You’ve finished this deck for today. Another ring on the tree.</p>
      {/if}
      <div class="row center">
        <a class="button" href="#/">Back to decks</a>
        <a class="button secondary" href="#/custom/{deckId}">Custom study</a>
        {#if undoStack.length}<button class="secondary" onclick={undo}>Undo last</button>{/if}
      </div>
    </section>
  {:else if card}
    <section class="card panel" aria-live="polite">
      <CardView
        bind:this={cardView}
        html={revealed ? rendered.back : rendered.front}
        css={cardCss}
        side={revealed ? 'answer' : 'question'}
        autoplay={prefs.autoplayAudio}
        bind:typed
        onsubmit={() => (revealed = true)}
      />
    </section>

    <footer class="answer">
      {#if !revealed}
        <button class="show" onclick={() => (revealed = true)}>
          Show answer <kbd>Space</kbd>
        </button>
      {:else if intervals}
        <div class="grades">
          {#each GRADES as g (g)}
            <button class="grade g{g}" onclick={() => rate(g)}>
              <span class="interval">{intervals[g]}</span>
              <span>{LABELS[g]}</span>
              <kbd>{g}</kbd>
            </button>
          {/each}
        </div>
      {/if}
    </footer>
  {/if}
</div>

<style>
  .review {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    padding-bottom: env(safe-area-inset-bottom);
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.9rem 0;
  }
  .session-progress {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .session-progress span {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .session-progress progress {
    appearance: none;
    flex: 1;
    min-width: 0;
    height: 0.3rem;
    border: none;
    border-radius: 999px;
    background: var(--border);
    overflow: hidden;
  }
  .session-progress progress::-webkit-progress-bar {
    background: var(--border);
  }
  .session-progress progress::-webkit-progress-value {
    background: var(--accent);
    border-radius: 999px;
    transition: width 0.3s ease;
  }
  .session-progress progress::-moz-progress-bar {
    background: var(--accent);
    border-radius: 999px;
  }
  @media (prefers-reduced-motion: reduce) {
    .session-progress progress::-webkit-progress-value {
      transition: none;
    }
  }
  .back {
    font-size: 1.4rem;
    text-decoration: none;
    color: var(--muted);
    padding: 0 0.25rem;
  }
  .deck-name {
    font-weight: 600;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tool {
    padding: 0.4rem 0.7rem;
    font-size: 0.8rem;
  }
  .card {
    flex: 1;
    display: grid;
    align-content: center;
    padding: 2rem 1.25rem;
    border-radius: 20px;
    box-shadow: var(--shadow);
    margin-bottom: 1rem;
  }
  .answer {
    position: sticky;
    bottom: 0;
    padding: 0.75rem 0 1rem;
    background: var(--bg);
  }
  .show {
    width: 100%;
    padding: 1rem;
    font-size: 1.05rem;
  }
  .show kbd {
    color: inherit;
    border-color: currentColor;
    opacity: 0.7;
    margin-left: 0.4rem;
  }
  .grades {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }
  .grade {
    display: grid;
    gap: 0.15rem;
    justify-items: center;
    padding: 0.7rem 0.25rem;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
  }
  .grade .interval {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--muted);
  }
  .g1 {
    color: var(--again);
  }
  .g2 {
    color: var(--hard);
  }
  .g3 {
    color: var(--good);
  }
  .g4 {
    color: var(--easy);
  }
  .grade:hover {
    border-color: currentColor;
  }
  .grade kbd {
    font-size: 0.65rem;
  }
  @media (hover: none) {
    kbd {
      display: none;
    }
    .kbd-button {
      display: none;
    }
  }
  .more {
    position: relative;
  }
  .more summary {
    list-style: none;
    cursor: pointer;
    font-weight: 600;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--text);
  }
  .more summary::-webkit-details-marker {
    display: none;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 0.35rem);
    z-index: 5;
    display: grid;
    gap: 0.35rem;
    padding: 0.5rem;
    min-width: 11rem;
    box-shadow: var(--shadow);
  }
  .menu button {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.85rem;
    padding: 0.45rem 0.7rem;
  }
  .status {
    margin: 0;
    min-height: 1.2em;
    font-size: 0.85rem;
    color: var(--muted);
    text-align: center;
  }
  .done {
    flex: 1;
    display: grid;
    align-content: center;
    justify-items: center;
    text-align: center;
    gap: 0.25rem;
  }
  .done h2 {
    margin: 0.75rem 0 0;
  }
  .center {
    justify-content: center;
    margin-top: 1rem;
  }
</style>
