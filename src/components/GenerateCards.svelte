<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../lib/db';
  import {
    generateCards,
    getAiConfig,
    GenerateError,
    type AiConfig,
    type CardStyle,
  } from '../lib/llm/generate';

  let {
    onresult,
  }: { /** The model's reply, in the paste format. */ onresult: (text: string) => void } = $props();

  let config = $state<AiConfig | null | undefined>(undefined);
  let source = $state('');
  let style = $state<CardStyle>('auto');
  let count = $state(10);
  let running: AbortController | null = $state(null);
  let progress = $state('');
  let error = $state('');

  onMount(async () => {
    config = await getAiConfig(db);
  });

  async function run() {
    if (!config || running) return;
    const controller = new AbortController();
    running = controller;
    error = '';
    progress = 'Waiting for the model…';
    try {
      const reply = await generateCards(
        config,
        source,
        { style, count },
        {
          signal: controller.signal,
          onText: (text) => {
            const cards = (text.match(/^Q:|\{\{c1::/gm) ?? []).length;
            progress = cards
              ? `Writing… ${cards} card${cards === 1 ? '' : 's'} so far`
              : 'Writing…';
          },
        },
      );
      onresult(reply);
      progress = 'Done. Check the cards below, then add them.';
    } catch (err) {
      progress = '';
      error = err instanceof GenerateError ? err.message : String(err);
    } finally {
      running = null;
    }
  }
</script>

<details class="generate">
  <summary>Generate from text with AI</summary>
  {#if config === null}
    <p class="muted">
      Paste notes or an article and get cards back, using your own API key for Claude, OpenAI or a
      local model. Set it up in <a href="#/settings">Settings → AI card generation</a>.
    </p>
  {:else if config}
    <!-- Not a <form>: this sits inside the editor's form, and forms can't nest. -->
    <div class="stack">
      <label>
        Text to make cards from
        <textarea
          bind:value={source}
          rows="7"
          placeholder="Paste lecture notes, a textbook section, an article…"></textarea>
      </label>
      <div class="row options">
        <label>
          Cards
          <select bind:value={style}>
            <option value="auto">Model’s choice</option>
            <option value="qa">Question and answer</option>
            <option value="cloze">Cloze</option>
          </select>
        </label>
        <label>
          About how many
          <input type="number" min="0" max="100" bind:value={count} />
        </label>
      </div>
      <div class="row">
        {#if running}
          <button type="button" class="secondary" onclick={() => running?.abort()}>Stop</button>
        {:else}
          <button type="button" onclick={run} disabled={!source.trim()}>Generate</button>
        {/if}
        <span class="muted" role="status" aria-live="polite">{progress}</span>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <p class="hint muted">
        Sent to {config.provider === 'anthropic' ? 'Anthropic' : (config.baseUrl ?? 'OpenAI')}
        ({config.model}) with your key. The reply fills the Markdown box below.
      </p>
    </div>
  {/if}
</details>

<style>
  .generate {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.6rem 0.9rem;
    margin-bottom: 1rem;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  .generate[open] summary {
    margin-bottom: 0.75rem;
  }
  .options label {
    flex: 1;
    min-width: 9rem;
  }
  .hint {
    font-size: 0.85rem;
    margin: 0;
  }
  .error {
    color: var(--again);
    margin: 0;
  }
</style>
