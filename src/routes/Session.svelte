<script lang="ts">
  import { onMount } from 'svelte';
  import CardView from '../components/CardView.svelte';
  import { db, DEFAULT_PREFS, type Card, type Prefs } from '../lib/db';
  import { getPrefs } from '../lib/db/prefs';
  import { recordReview, undoReview, type UndoEntry } from '../lib/db/repo';
  import { navigate, router } from '../lib/router.svelte';
  import { createScheduler, GRADES, Rating, type Grade } from '../lib/scheduler';
  import { cardContent, type CardContent } from '../lib/study/content';
  import { parseSessionQuery, sessionCards, type SessionOptions } from '../lib/study/custom';
  import { formatInterval } from '../lib/study/day';
  import { plainKey, shortcutsDialog } from '../lib/shortcuts.svelte';

  let { deckId }: { deckId: string } = $props();

  const LABELS: Record<Grade, string> = {
    [Rating.Again]: 'Again',
    [Rating.Hard]: 'Hard',
    [Rating.Good]: 'Good',
    [Rating.Easy]: 'Easy',
  };
  const MAX_ANSWER_MS = 60_000;

  /** One step taken, so Z / ← can go back: where we were, and the review to undo, if any. */
  interface Step {
    pos: number;
    review?: UndoEntry;
    requeued: boolean;
  }

  // Read once: later URL updates (position, seed) must not rebuild the session. The route is
  // keyed by deck, so a different deck mounts a fresh component.
  const query = router.query;
  // svelte-ignore state_referenced_locally
  const options: SessionOptions = parseSessionQuery(deckId, query);
  const seed = Number(query.get('seed')) || Math.floor(Math.random() * 2 ** 31);

  let deckName = $state('');
  let prefs = $state<Prefs>({ ...DEFAULT_PREFS });
  /** Card ids in the order they'll be shown; Again appends a card to the end. */
  let queue = $state.raw<string[]>([]);
  let pos = $state(Math.max(0, Number(query.get('at')) || 0));
  let card = $state.raw<Card | null>(null);
  let content = $state<CardContent | null>(null);
  let intervals = $state<Record<Grade, string> | null>(null);
  let revealed = $state(false);
  /** Type-in-the-answer text for the current card. */
  let typed = $state('');
  let loading = $state(true);
  let history = $state.raw<Step[]>([]);
  let cardView: CardView | undefined = $state();
  let busy = false;
  let shownAt = 0;

  const finished = $derived(!loading && pos >= queue.length);
  const title = $derived(
    options.kind === 'all'
      ? 'Preview'
      : options.reschedule
        ? 'Custom study'
        : 'Practice (not scheduled)',
  );

  /** Mulberry32: a tiny seeded PRNG, so a reload or a trip to the editor keeps the shuffle. */
  function seeded(a: number) {
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Keeps the position in the URL, so editing a card returns to the same place. */
  function here(): string {
    // A throwaway copy for building a string, not reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const q = new URLSearchParams(query);
    q.set('seed', String(seed));
    q.set('at', String(pos));
    return `/session/${deckId}?${q}`;
  }

  /** Bumped on every show(), so a slow load can't overwrite a newer card. */
  let showToken = 0;

  async function show() {
    const token = ++showToken;
    navigate(here(), { replace: true });
    revealed = false;
    typed = '';
    if (pos >= queue.length) {
      card = null;
      return;
    }
    const next = await db.cards.get(queue[pos]);
    if (token !== showToken) return;
    if (!next) {
      // Deleted mid-session (e.g. from the editor): skip it.
      queue = queue.filter((_, i) => i !== pos);
      return show();
    }
    const c = await cardContent(db, next, prefs);
    let iv: Record<Grade, string> | null = null;
    if (options.reschedule) {
      const deck = await db.decks.get(next.deckId);
      const now = Date.now();
      const preview = createScheduler({
        desiredRetention: deck?.config.desiredRetention,
        params: deck?.config.fsrsParams,
      }).preview(next, now);
      iv = Object.fromEntries(GRADES.map((g) => [g, formatInterval(preview[g] - now)])) as Record<
        Grade,
        string
      >;
    }
    if (token !== showToken) return;
    content = c;
    intervals = iv;
    card = next;
    shownAt = Date.now();
  }

  /**
   * Moves on. Again puts the card back at the end of the session. Only scheduled sessions
   * wait for the database; a preview keeps up with fast key presses.
   */
  async function answer(grade: Grade) {
    const id = queue[pos];
    if (!id || busy) return;
    if (options.reschedule && (!revealed || card?.id !== id)) return;
    let review: UndoEntry | undefined;
    if (options.reschedule) {
      busy = true;
      try {
        const durationMs = Math.min(Date.now() - shownAt, MAX_ANSWER_MS);
        review = await recordReview(db, id, grade, { durationMs });
      } finally {
        busy = false;
      }
    }
    const requeued = grade === Rating.Again;
    if (requeued) queue = [...queue, id];
    history = [...history, { pos, review, requeued }];
    pos += 1;
    await show();
  }

  async function back() {
    const step = history.at(-1);
    if (busy || (!step && pos === 0)) return;
    if (step) {
      if (step.review) {
        busy = true;
        try {
          await undoReview(db, step.review);
        } finally {
          busy = false;
        }
      }
      if (step.requeued) queue = queue.slice(0, -1);
      history = history.slice(0, -1);
      pos = step.pos;
    } else {
      // Opened mid-session from a URL: there's no history, just step back.
      pos -= 1;
    }
    await show();
  }

  function edit() {
    if (card) navigate(`/edit/${card.noteId}?return=${encodeURIComponent(here())}`);
  }

  function restart() {
    history = [];
    pos = 0;
    show();
  }

  function onKey(e: KeyboardEvent) {
    if (!plainKey(e) || shortcutsDialog.open) {
      // Cmd/Ctrl+Z still undoes, as in the review screen.
      if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        back();
      }
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 'escape') navigate(`/deck/${deckId}`);
    else if (key === 'z' || key === 'arrowleft') {
      e.preventDefault();
      back();
    } else if (key === 'r') cardView?.replay();
    else if (key === 'e') edit();
    else if (key === ' ' || key === 'enter') {
      e.preventDefault();
      if (pos >= queue.length) return;
      if (!revealed) revealed = true;
      else answer(Rating.Good);
    } else if (key === 'arrowright' && !options.reschedule) {
      e.preventDefault();
      answer(Rating.Good);
    } else if (key === '1') {
      if (options.reschedule || revealed) answer(Rating.Again);
    } else if (['2', '3', '4'].includes(key) && options.reschedule) {
      answer(Number(key) as Grade);
    }
  }

  onMount(async () => {
    const [p, deck] = await Promise.all([getPrefs(db), db.decks.get(deckId)]);
    if (!deck) return navigate('/', { replace: true });
    prefs = p;
    deckName = deck.name;
    queue = (await sessionCards(db, options, Date.now(), seeded(seed))).map((c) => c.id);
    pos = Math.min(pos, queue.length);
    loading = false;
    await show();
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="session">
  <header>
    <a class="back" href="#/deck/{deckId}" aria-label="Back to deck" title="Back (Esc)">←</a>
    <span class="deck-name">{title} · {deckName}</span>
    {#if !loading && queue.length}
      <span
        class="progress muted"
        aria-label="Card {Math.min(pos + 1, queue.length)} of {queue.length}"
        >{Math.min(pos + 1, queue.length)} / {queue.length}</span
      >
    {/if}
    <button
      class="secondary tool"
      onclick={back}
      disabled={history.length === 0 && pos === 0}
      title={options.reschedule ? 'Undo (Z)' : 'Previous (←)'}
      >{options.reschedule ? 'Undo' : '← Prev'}</button
    >
    <button class="secondary tool" onclick={edit} disabled={!card} title="Edit (E)">Edit</button>
    <button
      class="secondary tool kbd-button"
      onclick={() => (shortcutsDialog.open = true)}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)">?</button
    >
  </header>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if queue.length === 0}
    <section class="done">
      <h2>No cards match</h2>
      <p class="muted">Try a wider range or another kind of session.</p>
      <div class="row center">
        <a class="button" href="#/custom/{deckId}">Custom study</a>
        <a class="button secondary" href="#/deck/{deckId}">Back to deck</a>
      </div>
    </section>
  {:else if finished}
    <section class="done">
      <img src="{import.meta.env.BASE_URL}logo.svg" alt="" width="96" height="96" />
      <h2>Session finished</h2>
      <p class="muted">
        {queue.length}
        {queue.length === 1 ? 'card' : 'cards'} seen.
        {options.reschedule ? 'Your answers were scheduled as reviews.' : 'Nothing was scheduled.'}
      </p>
      <div class="row center">
        <a class="button" href="#/deck/{deckId}">Back to deck</a>
        {#if !options.reschedule}<button class="secondary" onclick={restart}>Start over</button
          >{/if}
        <a class="button secondary" href="#/custom/{deckId}">Custom study</a>
      </div>
    </section>
  {:else if card && content}
    <section class="card panel" aria-live="polite">
      <CardView
        bind:this={cardView}
        html={revealed ? content.back : content.front}
        css={content.css}
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
      {:else if options.reschedule && intervals}
        <div class="grades four">
          {#each GRADES as g (g)}
            <button class="grade g{g}" onclick={() => answer(g)}>
              <span class="interval">{intervals[g]}</span>
              <span>{LABELS[g]}</span>
              <kbd>{g}</kbd>
            </button>
          {/each}
        </div>
      {:else}
        <div class="grades two">
          <button class="grade g1" onclick={() => answer(Rating.Again)}>
            <span>Again</span>
            <span class="interval">see it later</span>
            <kbd>1</kbd>
          </button>
          <button class="grade g3" onclick={() => answer(Rating.Good)}>
            <span>Next</span>
            <span class="interval">&nbsp;</span>
            <kbd>Space</kbd>
          </button>
        </div>
      {/if}
    </footer>
  {/if}
</div>

<style>
  .session {
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
  .progress {
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
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
    gap: 0.5rem;
  }
  .four {
    grid-template-columns: repeat(4, 1fr);
  }
  .two {
    grid-template-columns: 1fr 1fr;
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
    kbd,
    .kbd-button {
      display: none;
    }
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
