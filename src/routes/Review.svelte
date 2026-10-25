<script lang="ts">
  import { onMount } from 'svelte';
  import CardView from '../components/CardView.svelte';
  import Counts from '../components/Counts.svelte';
  import { db, type Card } from '../lib/db';
  import { recordReview, undoReview, type UndoEntry } from '../lib/db/repo';
  import { renderCard, type RenderedCard } from '../lib/render';
  import { navigate } from '../lib/router.svelte';
  import { createScheduler, GRADES, Rating, State, type Grade } from '../lib/scheduler';
  import { formatInterval } from '../lib/study/day';
  import { LEARN_AHEAD_MS, studyState, type StudyCounts } from '../lib/study/queue';
  import { isTyping, shortcutsDialog } from '../lib/shortcuts.svelte';

  let { deckId }: { deckId: string } = $props();

  const LABELS: Record<Grade, string> = {
    [Rating.Again]: 'Again',
    [Rating.Hard]: 'Hard',
    [Rating.Good]: 'Good',
    [Rating.Easy]: 'Easy',
  };
  /** Cap on the time recorded for one card, so walking away doesn't skew stats (as in Anki). */
  const MAX_ANSWER_MS = 60_000;

  let deckName = $state('');
  let counts = $state<StudyCounts>({ new: 0, learning: 0, review: 0 });
  let card = $state.raw<Card | null>(null);
  let rendered = $state<RenderedCard>({ front: '', back: '' });
  let intervals = $state<Record<Grade, string> | null>(null);
  let revealed = $state(false);
  let finished = $state(false);
  let waitUntil = $state<number | undefined>();
  // Raw (not deep-proxied): these snapshots go back into IndexedDB, which can't clone Proxies.
  let undoStack = $state.raw<UndoEntry[]>([]);
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
    const note = await db.notes.get(next.noteId);
    const noteType = note && (await db.noteTypes.get(note.noteTypeId));
    if (!note || !noteType) return; // Shouldn't happen: cards are deleted with their note.

    const scheduler = createScheduler({
      desiredRetention: deck.config.desiredRetention,
      params: deck.config.fsrsParams,
    });
    const preview = scheduler.preview(next, now);
    intervals = Object.fromEntries(
      GRADES.map((g) => [g, formatInterval(preview[g] - now)]),
    ) as Record<Grade, string>;
    // Full deck path for Anki's {{Deck}} / {{Subdeck}} template fields.
    const deckPath: string[] = [];
    for (
      let d = await db.decks.get(next.deckId);
      d;
      d = d.parentId ? await db.decks.get(d.parentId) : undefined
    ) {
      deckPath.unshift(d.name);
    }
    rendered = renderCard(noteType, note, next.ordinal, { deckPath });
    card = next;
    finished = false;
    revealed = false;
    shownAt = now;
  }

  async function rate(grade: Grade) {
    if (!card || !revealed || busy) return;
    busy = true;
    try {
      const durationMs = Math.min(Date.now() - shownAt, MAX_ANSWER_MS);
      undoStack = [...undoStack, await recordReview(db, card.id, grade, { durationMs })];
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
      await undoReview(db, entry);
      undoStack = undoStack.slice(0, -1);
      await load(entry.previous);
    } finally {
      busy = false;
    }
  }

  function edit() {
    if (card) navigate(`/edit/${card.noteId}?return=${encodeURIComponent(`/study/${deckId}`)}`);
  }

  function onKey(e: KeyboardEvent) {
    if (isTyping(e) || shortcutsDialog.open) return;
    // Z or Cmd/Ctrl+Z.
    if (e.key === 'z' && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.metaKey || e.ctrlKey || e.altKey) {
      return;
    } else if (e.key === 'Escape') {
      navigate(`/deck/${deckId}`);
    } else if (e.key === 'e') {
      edit();
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
    load();
    return () => clearTimeout(timer);
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
    <button
      class="secondary tool kbd-button"
      onclick={() => (shortcutsDialog.open = true)}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)">?</button
    >
  </header>

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
        {#if undoStack.length}<button class="secondary" onclick={undo}>Undo last</button>{/if}
      </div>
    </section>
  {:else if card}
    <section class="card panel" aria-live="polite">
      <CardView html={revealed ? rendered.back : rendered.front} />
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
