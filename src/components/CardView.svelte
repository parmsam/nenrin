<script lang="ts">
  import { db } from '../lib/db';
  import { mediaUrls } from '../lib/db/media';
  import { mediaRefs, resolveMedia } from '../lib/render';

  /** Already-sanitized card HTML (from renderCard). */
  let { html }: { html: string } = $props();
  let resolved = $state('');

  $effect(() => {
    const source = html;
    resolved = source;
    const refs = mediaRefs(source);
    if (refs.length === 0) return;
    let cancelled = false;
    mediaUrls(db, refs).then((urls) => {
      if (!cancelled) resolved = resolveMedia(source, urls);
    });
    return () => (cancelled = true);
  });
</script>

<div class="card-content">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by renderCard() -->
  {@html resolved}
</div>

<style>
  .card-content {
    font-size: 1.35rem;
    line-height: 1.55;
    text-align: center;
    overflow-wrap: anywhere;
  }
  .card-content :global(p) {
    margin: 0.4em 0;
  }
  .card-content :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }
  .card-content :global(hr#answer) {
    border: 0;
    border-top: 1px dashed var(--border);
    margin: 1.25rem 0;
  }
  .card-content :global(.cloze) {
    font-weight: 700;
    color: var(--accent);
  }
  .card-content :global(pre),
  .card-content :global(ul),
  .card-content :global(ol),
  .card-content :global(table) {
    text-align: left;
    display: inline-block;
    max-width: 100%;
  }
  .card-content :global(pre) {
    overflow-x: auto;
    padding: 0.75rem;
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 0.9rem;
  }
  .card-content :global(.katex-display) {
    overflow-x: auto;
    overflow-y: hidden;
  }
</style>
