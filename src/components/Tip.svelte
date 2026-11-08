<script lang="ts">
  import type { Snippet } from 'svelte';
  import { dismissTip, setTipsEnabled, tipVisible, type TipId } from '../lib/tips.svelte';

  let {
    id,
    title,
    children,
  }: {
    id: TipId;
    title: string;
    children: Snippet;
  } = $props();
</script>

{#if tipVisible(id)}
  <aside class="tip" aria-label="Tip: {title}">
    <div class="text">
      <p class="title">{title}</p>
      <p>{@render children()}</p>
      <button class="link" onclick={() => setTipsEnabled(false)}>Hide all tips</button>
    </div>
    <button
      class="close"
      onclick={() => dismissTip(id)}
      aria-label="Close tip: {title}"
      title="Close tip">×</button
    >
  </aside>
{/if}

<style>
  .tip {
    position: relative;
    display: flex;
    gap: 0.5rem;
    align-items: start;
    margin: 0.25rem 0 1rem;
    padding: 0.75rem 0.5rem 0.75rem 1rem;
    border: 1px solid var(--accent);
    border-left-width: 4px;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--text);
    font-size: 0.9rem;
    line-height: 1.45;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  p {
    margin: 0;
  }
  .title {
    font-weight: 650;
    margin-bottom: 0.2rem;
  }
  .link {
    margin-top: 0.4rem;
    padding: 0;
    background: none;
    border: none;
    color: var(--muted);
    font-size: 0.8rem;
    text-decoration: underline;
    cursor: pointer;
  }
  .close {
    flex: none;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    font-size: 1.3rem;
    line-height: 1;
  }
  .close:hover {
    background: var(--surface);
    color: var(--text);
  }
</style>
