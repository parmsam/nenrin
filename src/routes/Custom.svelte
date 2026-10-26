<script lang="ts">
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db';
  import { deckSubtreeIds } from '../lib/db/decks';
  import { getPrefs } from '../lib/db/prefs';
  import { navigate } from '../lib/router.svelte';
  import {
    defaultsFor,
    extendToday,
    SESSION_DEFAULTS,
    sessionCards,
    sessionQuery,
    type SessionKind,
    type SessionOptions,
  } from '../lib/study/custom';
  import { dayStart } from '../lib/study/day';

  let { deckId }: { deckId: string } = $props();

  const KINDS: { id: SessionKind; label: string; hint: string }[] = [
    { id: 'all', label: 'Preview the deck', hint: 'Flip through every card, in the order added.' },
    { id: 'new', label: 'Preview new cards', hint: 'Look over cards you haven’t studied yet.' },
    { id: 'forgotten', label: 'Review forgotten cards', hint: 'Cards you answered Again lately.' },
    { id: 'ahead', label: 'Review ahead', hint: 'Review cards before they’re due.' },
    { id: 'tags', label: 'Study by tag', hint: 'Every card whose note has one of these tags.' },
  ];

  const data = liveQuery(async () => {
    const deck = await db.decks.get(deckId);
    if (!deck) return null;
    const ids = await deckSubtreeIds(db, deckId);
    const noteIds = await db.cards.where('deckId').anyOf(ids).toArray();
    const notes = await db.notes.bulkGet([...new Set(noteIds.map((c) => c.noteId))]);
    const tags = [...new Set(notes.flatMap((n) => n?.tags ?? []))].sort();
    const { rolloverHour } = await getPrefs(db);
    const extra =
      deck.config.extraToday?.day === dayStart(Date.now(), rolloverHour)
        ? deck.config.extraToday
        : undefined;
    return { deck, tags, extra };
  });

  let opts = $state<Omit<SessionOptions, 'deckId'>>({ ...SESSION_DEFAULTS, ...defaultsFor('all') });
  let tagText = $state('');
  let moreNew = $state(10);
  let moreReviews = $state(50);
  let note = $state('');
  let matching = $state<number | undefined>();

  function pick(kind: SessionKind) {
    opts = { ...opts, ...defaultsFor(kind), kind, limit: kind === 'all' ? 0 : 100 };
  }

  const current = $derived<SessionOptions>({
    ...opts,
    deckId,
    tags: tagText.split(/[\s,]+/).filter(Boolean),
  });

  // Live count of matching cards, so you know what you'll get before starting.
  $effect(() => {
    const o = $state.snapshot(current) as SessionOptions;
    let stale = false;
    sessionCards(db, o).then((cards) => {
      if (!stale) matching = cards.length;
    });
    return () => (stale = true);
  });

  async function extend(e: SubmitEvent, what: 'newCards' | 'reviews') {
    e.preventDefault();
    const n = what === 'newCards' ? moreNew : moreReviews;
    await extendToday(db, deckId, { [what]: n });
    note = `Added ${n} ${what === 'newCards' ? 'new cards' : 'reviews'} for today.`;
  }

  function start(e: SubmitEvent) {
    e.preventDefault();
    navigate(`/session/${deckId}?${sessionQuery(current)}`);
  }
</script>

{#if $data === undefined}
  <p class="muted">Loading…</p>
{:else if $data === null}
  <p>This deck doesn’t exist. <a href="#/">Back to decks</a></p>
{:else}
  {@const { deck, tags, extra } = $data}
  <nav class="crumbs muted"><a href="#/">Decks</a> / <a href="#/deck/{deckId}">{deck.name}</a></nav>
  <h2>Custom study</h2>

  <section class="panel">
    <h3>More cards today</h3>
    <p class="muted small">
      Today’s limits: {deck.config.newPerDay + (extra?.newCards ?? 0)} new,
      {deck.config.reviewsPerDay + (extra?.reviews ?? 0)} reviews{extra
        ? ' (raised for today)'
        : ''}. Tomorrow they go back to the deck’s settings.
    </p>
    <div class="extend">
      <form class="row nowrap" onsubmit={(e) => extend(e, 'newCards')}>
        <label class="inline"
          >+ <input
            type="number"
            min="1"
            max="9999"
            bind:value={moreNew}
            aria-label="Extra new cards"
          />
          new cards</label
        >
        <button class="secondary" type="submit">Add</button>
      </form>
      <form class="row nowrap" onsubmit={(e) => extend(e, 'reviews')}>
        <label class="inline"
          >+ <input
            type="number"
            min="1"
            max="99999"
            bind:value={moreReviews}
            aria-label="Extra reviews"
          />
          reviews</label
        >
        <button class="secondary" type="submit">Add</button>
      </form>
    </div>
    {#if note}
      <p class="ok" role="status">{note} <a href="#/study/{deckId}">Study now</a></p>
    {/if}
  </section>

  <form class="panel session" onsubmit={start}>
    <h3>Study session</h3>
    <fieldset>
      <legend class="visually-hidden">Kind of session</legend>
      {#each KINDS as k (k.id)}
        <label class="kind">
          <input
            type="radio"
            name="kind"
            value={k.id}
            checked={opts.kind === k.id}
            onchange={() => pick(k.id)}
          />
          <span><strong>{k.label}</strong> <span class="muted">{k.hint}</span></span>
        </label>
      {/each}
    </fieldset>

    <div class="grid">
      {#if opts.kind === 'new' || opts.kind === 'forgotten' || opts.kind === 'ahead'}
        <label>
          {opts.kind === 'ahead'
            ? 'Due in the next (days)'
            : opts.kind === 'new'
              ? 'Added in the last (days, 0 = any)'
              : 'Forgotten in the last (days)'}
          <input
            type="number"
            min={opts.kind === 'new' ? 0 : 1}
            max="3650"
            bind:value={opts.days}
          />
        </label>
      {/if}
      {#if opts.kind === 'tags'}
        <label>
          Tags (space-separated)
          <input bind:value={tagText} list="custom-tags" placeholder="e.g. verbs jlpt::n5" />
          <datalist id="custom-tags">
            {#each tags as t (t)}<option value={t}></option>{/each}
          </datalist>
        </label>
      {/if}
      <label>
        Cards (0 = all)
        <input type="number" min="0" max="99999" bind:value={opts.limit} />
      </label>
      <label>
        Order
        <select bind:value={opts.order}>
          <option value="added">Order added</option>
          <option value="due">Due date</option>
          <option value="random">Random</option>
        </select>
      </label>
    </div>

    <label class="check">
      <input type="checkbox" bind:checked={opts.reschedule} />
      <span>
        Count answers as reviews
        <span class="muted small"
          >{opts.reschedule
            ? 'FSRS schedules each card from your answer, like a normal review.'
            : 'Practice only: nothing is saved, and due dates don’t change.'}</span
        >
      </span>
    </label>

    <div class="row">
      <button type="submit" disabled={matching === 0}>Start</button>
      {#if matching !== undefined}
        <span class="muted" role="status"
          >{matching.toLocaleString()} {matching === 1 ? 'card' : 'cards'}</span
        >
      {/if}
    </div>
  </form>
{/if}

<style>
  .crumbs {
    font-size: 0.875rem;
    margin-bottom: 0.25rem;
  }
  h2 {
    margin: 0 0 1rem;
  }
  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }
  .panel {
    margin-bottom: 1.25rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .extend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
  }
  .nowrap {
    flex-wrap: nowrap;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    white-space: nowrap;
  }
  .inline input {
    width: 6rem;
  }
  .session {
    display: grid;
    gap: 1rem;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }
  .kind,
  .check {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    font-weight: 400;
  }
  .kind input,
  .check input {
    width: auto;
    flex: none;
    margin: 0;
    accent-color: var(--accent);
    transform: translateY(0.1em);
  }
  .kind .muted {
    font-size: 0.85rem;
  }
  .check > span {
    display: grid;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 1rem;
  }
  .ok {
    margin: 0.75rem 0 0;
    color: var(--good);
  }
</style>
