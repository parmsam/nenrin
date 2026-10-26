<script lang="ts">
  import { db } from '../lib/db';
  import { importAnkiPackage, type AnkiImportResult } from '../lib/anki/import';
  import { InvalidPackageError } from '../lib/anki/errors';
  import type { AnkiPackage } from '../lib/anki/package';
  import { isCrowdAnkiFile } from '../lib/anki/crowdanki';
  import { parsePackageInWorker } from '../lib/anki/parse-in-worker';

  let { file }: { file: File } = $props();

  const isCollection = $derived(/\.colpkg$/i.test(file.name));
  // CrowdAnki exports carry no scheduling, so there's nothing to choose.
  const isCrowdAnki = $derived(isCrowdAnkiFile(file.name));
  let pkg = $state.raw<AnkiPackage | null>(null);
  let reading = $state(true);
  let busy = $state(false);
  let scheduling = $state(true);
  let error = $state('');
  let result = $state.raw<AnkiImportResult | null>(null);

  $effect(() => {
    const current = file;
    reading = true;
    pkg = null;
    result = null;
    error = '';
    parsePackageInWorker(current)
      .then((p) => {
        if (current !== file) return;
        pkg = p;
        // Your own collection: keep progress. A shared deck usually has none to keep.
        scheduling = /\.colpkg$/i.test(current.name) || p.revlog.length > 0;
      })
      .catch((err) => {
        error =
          err instanceof InvalidPackageError
            ? err.message
            : `Couldn’t read this package: ${(err as Error).message}`;
      })
      .finally(() => (reading = false));
  });

  /** Deck paths that actually contain cards (Anki packages often include an empty Default). */
  const deckNames = $derived.by(() => {
    if (!pkg) return [];
    const used = new Set(pkg.cards.map((c) => c.odid || c.did));
    return pkg.decks
      .filter((d) => used.has(d.id) && !d.filtered)
      .map((d) => d.path.join(' / '))
      .sort();
  });

  const count = (n: number, noun: string) => `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`;

  async function run() {
    if (!pkg) return;
    if (
      isCollection &&
      !confirm(
        'Importing a collection package replaces all decks, cards and review history on this device. Continue?',
      )
    ) {
      return;
    }
    busy = true;
    error = '';
    try {
      result = await importAnkiPackage(db, pkg, { scheduling, replace: isCollection });
      await navigator.storage?.persist?.();
    } catch (err) {
      error = `Import failed: ${(err as Error).message}`;
    } finally {
      busy = false;
    }
  }
</script>

{#if reading}
  <p class="muted" role="status">Reading {file.name}…</p>
{:else if error}
  <p class="error" role="alert">{error}</p>
{:else if pkg}
  <h3 class="section-title">
    {isCollection ? 'Anki collection' : isCrowdAnki ? 'CrowdAnki deck' : 'Anki deck package'}
  </h3>
  <div class="panel stack">
    <dl class="facts">
      <div>
        <dt>Notes</dt>
        <dd>{pkg.notes.length}</dd>
      </div>
      <div>
        <dt>Cards</dt>
        <dd>{pkg.cards.length}</dd>
      </div>
      {#if !isCrowdAnki}
        <div>
          <dt>Reviews</dt>
          <dd>{pkg.revlog.length}</dd>
        </div>
      {/if}
      <div>
        <dt>Media files</dt>
        <dd>{pkg.media.length}</dd>
      </div>
    </dl>
    {#if deckNames.length}
      <div>
        <p class="label">Decks</p>
        <ul class="decks">
          {#each deckNames as name (name)}<li>{name}</li>{/each}
        </ul>
      </div>
    {/if}
    {#if !isCrowdAnki}
      <label class="check">
        <input type="checkbox" bind:checked={scheduling} disabled={isCollection} />
        Import review history and scheduling
      </label>
    {/if}
    <p class="muted small">
      {#if isCrowdAnki}
        Every card arrives as new. Importing a newer version of the deck later updates its notes and
        keeps your progress.
      {:else if scheduling}
        Cards keep their due dates and FSRS memory; history is rebuilt from Anki’s review log when
        needed.
      {:else}
        Every card arrives as new, which is what you usually want for a deck someone shared.
      {/if}
    </p>
    {#if isCollection}
      <p class="warning small">
        A collection package replaces all decks, cards and review history on this device (your
        images and settings are kept). Export a backup first if you might want them back.
      </p>
    {:else if !isCrowdAnki}
      <p class="muted small">
        Notes you already imported are matched by Anki’s note id: newer versions update the note,
        and your scheduling is kept.
      </p>
    {/if}
  </div>

  <div class="row actions">
    <button onclick={run} disabled={busy || !!result}>
      {busy
        ? 'Importing…'
        : `Import ${pkg.notes.length} ${pkg.notes.length === 1 ? 'note' : 'notes'}`}
    </button>
  </div>

  {#if result}
    <div class="panel stack" role="status">
      <p>
        <strong>Done.</strong>
        {[
          `${count(result.notesAdded, 'note')} added`,
          `${result.notesUpdated} updated`,
          `${result.notesUnchanged} unchanged`,
          count(result.cardsAdded, 'card'),
          !isCrowdAnki && count(result.reviewsImported, 'review'),
          count(result.mediaImported, 'media file'),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div><a class="button" href="#/">Go to decks</a></div>
    </div>
  {/if}
{/if}

<style>
  .stack {
    display: grid;
    gap: 0.75rem;
  }
  .stack p {
    margin: 0;
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: 0.75rem;
    margin: 0;
  }
  .facts div {
    background: var(--surface-2);
    border-radius: 12px;
    padding: 0.6rem 0.8rem;
  }
  dt {
    font-size: 0.75rem;
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .label {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .decks {
    margin: 0.25rem 0 0;
    padding-left: 1.2rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .check input {
    width: auto;
  }
  .small {
    font-size: 0.85rem;
  }
  .warning {
    padding: 0.6rem 0.8rem;
    border-radius: 10px;
    background: var(--accent-soft);
  }
  .actions {
    margin: 1rem 0;
  }
</style>
