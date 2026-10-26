<script lang="ts">
  import { controllers, setPadMap } from '../lib/input/controller.svelte';
  import {
    assign,
    buttonName,
    DEFAULT_PAD_MAP,
    PAD_ACTIONS,
    type PadAction,
  } from '../lib/input/controls';

  /** The action waiting for a button press, if any. */
  let listening = $state<PadAction | null>(null);

  function change(action: PadAction) {
    if (listening === action) return stop();
    listening = action;
    controllers.capture = (button) => {
      setPadMap(assign(controllers.map, action, button));
      listening = null;
    };
  }

  function stop() {
    listening = null;
    controllers.capture = null;
  }

  const isDefault = $derived(
    PAD_ACTIONS.every(({ action }) => controllers.map[action] === DEFAULT_PAD_MAP[action]),
  );

  $effect(() => stop);
</script>

<div class="panel stack">
  <p>
    Study from the couch: connect a game controller, a Bluetooth page turner or a presentation
    clicker. Page turners and clickers work without setup (Page Down shows the answer and then rates
    Good, Page Up is Again). The controller buttons can be changed here, for this device.
  </p>
  <!-- Announced when a controller connects; not a role="status", which is the page's own. -->
  <p class="status" aria-live="polite">
    {#if controllers.connected.length}
      Connected: <strong>{controllers.connected.join(', ')}</strong>
    {:else}
      <span class="muted">No controller found. Connect one and press any button.</span>
    {/if}
  </p>
  <table>
    <thead>
      <tr><th scope="col">While studying</th><th scope="col">Button</th></tr>
    </thead>
    <tbody>
      {#each PAD_ACTIONS as { action, label } (action)}
        <tr>
          <td>{label}</td>
          <td>
            <button
              class="secondary tiny"
              class:listening={listening === action}
              aria-label="{label}: {listening === action
                ? 'press a button on the controller'
                : buttonName(controllers.map[action])}. Change"
              onclick={() => change(action)}
            >
              {listening === action ? 'Press a button…' : buttonName(controllers.map[action])}
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="row">
    <button
      class="secondary"
      disabled={isDefault}
      onclick={() => {
        stop();
        setPadMap({ ...DEFAULT_PAD_MAP });
      }}>Reset to defaults</button
    >
  </div>
</div>

<style>
  .status {
    margin: 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    max-width: 28rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.35rem 0.5rem 0.35rem 0;
    border-bottom: 1px solid var(--border);
  }
  th {
    font-size: 0.85rem;
    color: var(--muted);
    font-weight: 600;
  }
  .tiny {
    padding: 0.25rem 0.7rem;
    font-size: 0.85rem;
    min-width: 6rem;
  }
  .listening {
    outline: 2px solid var(--accent);
  }
</style>
