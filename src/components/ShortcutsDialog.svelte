<script lang="ts">
  import { SHORTCUTS, shortcutsDialog } from '../lib/shortcuts.svelte';

  let dialog: HTMLDialogElement;

  $effect(() => {
    if (shortcutsDialog.open && !dialog.open) dialog.showModal();
    else if (!shortcutsDialog.open && dialog.open) dialog.close();
  });
</script>

<!-- Native <dialog>: focus trap, Esc to close and inert background come for free. -->
<dialog
  bind:this={dialog}
  aria-labelledby="shortcuts-title"
  onclose={() => (shortcutsDialog.open = false)}
  onclick={(e) => {
    // Click on the backdrop (outside the content box) closes.
    if (e.target === dialog) dialog.close();
  }}
>
  <div class="content">
    <header>
      <h2 id="shortcuts-title">Keyboard shortcuts</h2>
      <button class="secondary close" onclick={() => dialog.close()} aria-label="Close">✕</button>
    </header>
    {#each SHORTCUTS as section (section.group)}
      <h3>{section.group}</h3>
      <dl>
        {#each section.items as item (item.action)}
          <div class="item">
            <dt>
              {#each item.keys as combo, i (i)}
                {#if i > 0}<span class="or">or</span>{/if}
                {#each combo as key, j (j)}
                  {#if j > 0}<span class="plus">+</span>{/if}<kbd>{key}</kbd>
                {/each}
              {/each}
            </dt>
            <dd>{item.action}</dd>
          </div>
        {/each}
      </dl>
    {/each}
  </div>
</dialog>

<style>
  dialog {
    width: min(30rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 20px 60px rgb(0 0 0 / 25%);
  }
  dialog::backdrop {
    background: rgb(26 23 20 / 45%);
    backdrop-filter: blur(2px);
  }
  .content {
    padding: 1.25rem 1.4rem 1.5rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
  }
  .close {
    padding: 0.35rem 0.6rem;
    font-size: 0.9rem;
  }
  h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin: 1.25rem 0 0.4rem;
  }
  dl {
    margin: 0;
    display: grid;
  }
  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--border);
  }
  .item:last-child {
    border-bottom: 0;
  }
  dt {
    order: 2;
    white-space: nowrap;
  }
  dd {
    margin: 0;
  }
  kbd {
    font-size: 0.8rem;
    color: var(--text);
    background: var(--surface-2);
  }
  .or,
  .plus {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0 0.3rem;
  }
</style>
