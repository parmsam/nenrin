<script lang="ts">
  import { tick } from 'svelte';
  import { confirmState } from '../lib/confirm.svelte';

  let dialog: HTMLDialogElement;
  let cancelButton: HTMLButtonElement | undefined = $state();
  const current = $derived(confirmState.current);

  $effect(() => {
    if (current && !dialog.open) {
      dialog.showModal();
      // Destructive actions default to the safe choice.
      tick().then(() => cancelButton?.focus());
    } else if (!current && dialog.open) dialog.close();
  });

  function finish(ok: boolean) {
    const pending = confirmState.current;
    confirmState.current = null;
    pending?.resolve(ok);
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="confirm-title"
  aria-describedby="confirm-message"
  onclose={() => confirmState.current && finish(false)}
>
  {#if current}
    <h2 id="confirm-title">{current.title}</h2>
    <p id="confirm-message">{current.message}</p>
    <div class="row">
      <button bind:this={cancelButton} class="secondary" onclick={() => finish(false)}
        >Cancel</button
      >
      <button class:danger-fill={current.danger} onclick={() => finish(true)}
        >{current.confirmLabel}</button
      >
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(26rem, calc(100vw - 2rem));
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
    margin: 0 0 0.5rem;
    font-size: 1.15rem;
  }
  p {
    margin: 0 0 1.25rem;
    color: var(--muted);
  }
  .row {
    justify-content: flex-end;
  }
  .danger-fill {
    background: var(--again);
    color: #fff;
  }
</style>
