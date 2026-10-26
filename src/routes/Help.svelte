<script lang="ts">
  import { helpHtml, helpPages, pageBySlug } from '../lib/help';

  let { slug = '' }: { slug?: string } = $props();

  const pages = helpPages();
  const page = $derived(slug ? pageBySlug(slug) : undefined);
  const index = $derived(page ? pages.findIndex((p) => p.slug === page.slug) : -1);
  const intro = pageBySlug('README');
</script>

<nav class="crumbs muted" aria-label="Breadcrumb">
  <a href="#/">Decks</a> /
  {#if page}
    <a href="#/help">Help</a> / <span aria-current="page">{page.title}</span>
  {:else}
    <span aria-current="page">Help</span>
  {/if}
</nav>

{#if slug && !page}
  <h2>Page not found</h2>
  <p><a href="#/help">See all help pages</a></p>
{:else if page}
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- our own guide, sanitized by helpHtml() -->
  <article class="guide">{@html helpHtml(page)}</article>
  <nav class="pager" aria-label="Guide pages">
    {#if index > 0}
      <a href="#/help/{pages[index - 1].slug}">← {pages[index - 1].title}</a>
    {:else}
      <a href="#/help">← Contents</a>
    {/if}
    {#if index >= 0 && index < pages.length - 1}
      <a class="next" href="#/help/{pages[index + 1].slug}">{pages[index + 1].title} →</a>
    {/if}
  </nav>
{:else if intro}
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- our own guide, sanitized by helpHtml() -->
  <article class="guide">{@html helpHtml(intro)}</article>
  <p class="muted small">
    Also on <a href="https://github.com/parmsam/nenrin/tree/main/docs/guide">GitHub</a>.
  </p>
{/if}

<style>
  .guide {
    line-height: 1.6;
    max-width: 42rem;
  }
  .guide :global(h1) {
    font-size: 1.6rem;
    margin: 0.25rem 0 1rem;
  }
  .guide :global(h2) {
    font-size: 1.15rem;
    margin: 1.75rem 0 0.5rem;
  }
  .guide :global(table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.9rem;
    display: block;
    overflow-x: auto;
  }
  .guide :global(th),
  .guide :global(td) {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  .guide :global(pre) {
    overflow-x: auto;
    padding: 0.75rem;
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 0.85rem;
  }
  .guide :global(code) {
    font-size: 0.9em;
  }
  .guide :global(.shot) {
    display: block;
    width: min(100%, 300px);
    height: auto;
    margin: 1rem 0;
    border: 1px solid var(--border);
    border-radius: 20px;
  }
  /* Show the screenshot for the app's theme, which Settings can set apart from the OS. */
  .guide :global(.shot-dark) {
    display: none;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .guide :global(.shot-light) {
      display: none;
    }
    :global(:root:not([data-theme='light'])) .guide :global(.shot-dark) {
      display: block;
    }
  }
  :global(:root[data-theme='dark']) .guide :global(.shot-light) {
    display: none;
  }
  :global(:root[data-theme='dark']) .guide :global(.shot-dark) {
    display: block;
  }
  .guide :global(li) {
    margin: 0.25rem 0;
  }
  .guide :global(ol) {
    padding-left: 1.4rem;
  }
  .pager {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    max-width: 42rem;
    margin: 2rem 0 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  .pager a {
    text-decoration: none;
  }
  .pager .next {
    margin-left: auto;
    text-align: right;
  }
  .small {
    font-size: 0.85rem;
  }
</style>
