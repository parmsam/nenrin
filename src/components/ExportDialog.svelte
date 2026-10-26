<script lang="ts">
  import { exportNotes, type ExportFormat } from '../lib/actions';

  let {
    open = $bindable(false),
    deckId,
    name,
    ondone,
  }: {
    open?: boolean;
    /** One deck and its sub-decks; all decks if omitted. */
    deckId?: string;
    /** Deck name, for the title and file name. */
    name?: string;
    ondone?: (message: string) => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let format: ExportFormat = $state('apkg');
  let scheduling = $state(true);
  let busy = $state(false);
  let error = $state('');

  $effect(() => {
    if (open && !dialog.open) {
      error = '';
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  });

  async function run(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await exportNotes({ deckId, name, format, scheduling });
      open = false;
      ondone?.(format === 'apkg' ? 'Anki package exported.' : 'Notes exported.');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="export-title" onclose={() => (open = false)}>
  <form onsubmit={run}>
    <h2 id="export-title">Export {name ?? 'all decks'}</h2>
    <fieldset>
      <legend class="visually-hidden">Format</legend>
      <label>
        <input type="radio" bind:group={format} value="apkg" />
        <span
          ><strong>Anki package (.apkg)</strong> Notes, cards, sub-decks and media. Opens in Anki.</span
        >
      </label>
      <label>
        <input type="radio" bind:group={format} value="txt" />
        <span
          ><strong>Notes as text (.txt)</strong> Tab-separated fields, for Anki or a spreadsheet.</span
        >
      </label>
    </fieldset>
    {#if format === 'apkg'}
      <label class="check">
        <input type="checkbox" bind:checked={scheduling} />
        <span
          >Include my progress <span class="muted"
            >(due dates, FSRS memory and review history). Turn off to share the deck.</span
          ></span
        >
      </label>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="row">
      <button type="button" class="secondary" onclick={() => (open = false)}>Cancel</button>
      <button type="submit" disabled={busy}>{busy ? 'Exporting…' : 'Export'}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(28rem, calc(100vw - 2rem));
    padding: 1.4rem 1.4rem 1.2rem;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 20px 60px rgb(0 0 0 / 25%);
  }
  dialog::backdrop {
    background: rgb(26 23 20 / 45%);
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.15rem;
  }
  fieldset {
    border: 0;
    margin: 0 0 0.75rem;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }
  label {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    line-height: 1.4;
  }
  label input {
    flex: none;
    width: auto;
    margin: 0.2rem 0 0;
    accent-color: var(--accent);
  }
  label strong {
    display: block;
  }
  fieldset label span {
    color: var(--muted);
  }
  fieldset label strong {
    color: var(--text);
  }
  .check {
    margin-bottom: 1rem;
  }
  .error {
    color: var(--again);
  }
  .row {
    justify-content: flex-end;
  }
</style>
