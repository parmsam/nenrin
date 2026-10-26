<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../lib/db';
  import {
    DEFAULT_MODELS,
    DEFAULT_OPENAI_URL,
    getAiConfig,
    setAiConfig,
    type AiProvider,
  } from '../lib/llm/generate';
  import { confirmAction } from '../lib/confirm.svelte';

  let provider = $state<AiProvider>('anthropic');
  let apiKey = $state('');
  let model = $state(DEFAULT_MODELS.anthropic);
  let baseUrl = $state(DEFAULT_OPENAI_URL);
  let saved = $state(false);
  let note = $state('');

  onMount(async () => {
    const config = await getAiConfig(db);
    if (!config) return;
    ({ provider, apiKey, model } = config);
    baseUrl = config.baseUrl ?? DEFAULT_OPENAI_URL;
    saved = true;
  });

  function changeProvider(next: AiProvider) {
    // Swap in the new provider's default model unless one was typed by hand.
    if (model === DEFAULT_MODELS[provider]) model = DEFAULT_MODELS[next];
    provider = next;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    await setAiConfig(db, {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim() || DEFAULT_MODELS[provider],
      ...(provider === 'openai' && { baseUrl: baseUrl.trim() || DEFAULT_OPENAI_URL }),
    });
    saved = true;
    note = 'Saved. Generate cards from Add cards → Paste.';
  }

  async function remove() {
    const ok = await confirmAction({
      title: 'Remove the API key?',
      message: 'AI card generation turns off on this device. Your cards stay as they are.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await setAiConfig(db, null);
    apiKey = '';
    saved = false;
    note = 'Removed.';
  }
</script>

<form class="panel stack" onsubmit={save}>
  <p>
    Turn your notes or an article into cards with your own API key. When you press
    <strong>Generate</strong>, the text you give goes straight from this device to the provider you
    pick here, and is billed to your account there. Nenrin has no server and sees nothing. The key
    is kept on this device only, and isn’t included in backups.
  </p>
  <label>
    Provider
    <select value={provider} onchange={(e) => changeProvider(e.currentTarget.value as AiProvider)}>
      <option value="anthropic">Anthropic (Claude)</option>
      <option value="openai">OpenAI or compatible (OpenRouter, Ollama, LM Studio…)</option>
    </select>
  </label>
  {#if provider === 'openai'}
    <label>
      API address
      <input
        type="url"
        bind:value={baseUrl}
        placeholder={DEFAULT_OPENAI_URL}
        autocomplete="off"
        spellcheck="false"
      />
    </label>
  {/if}
  <label>
    API key {#if provider === 'openai'}<span class="muted">(not needed for most local servers)</span
      >{/if}
    <input
      type="password"
      bind:value={apiKey}
      required={provider === 'anthropic'}
      autocomplete="off"
      spellcheck="false"
      placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
    />
  </label>
  <label>
    Model
    <input bind:value={model} autocomplete="off" spellcheck="false" />
  </label>
  <p class="hint muted">
    {#if provider === 'anthropic'}
      Get a key at <a href="https://console.anthropic.com/" rel="noopener" target="_blank"
        >console.anthropic.com</a
      >. Cheaper models such as <code>claude-sonnet-5-5</code> or <code>claude-haiku-5-5</code> work too.
    {:else}
      The server must allow requests from this site (CORS). Ollama does with
      <code>OLLAMA_ORIGINS</code> set.
    {/if}
  </p>
  <div class="row">
    <button type="submit">Save</button>
    {#if saved}<button type="button" class="secondary" onclick={remove}>Remove key</button>{/if}
    {#if note}<span class="muted" role="status">{note}</span>{/if}
  </div>
</form>

<style>
  .hint {
    font-size: 0.85rem;
    margin: 0;
  }
</style>
