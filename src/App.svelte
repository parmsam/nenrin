<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from './lib/db';
  import { ensureBuiltins } from './lib/notes';
  import { match, router } from './lib/router.svelte';
  import DeckView from './routes/DeckView.svelte';
  import Editor from './routes/Editor.svelte';
  import Home from './routes/Home.svelte';
  import Import from './routes/Import.svelte';
  import Review from './routes/Review.svelte';
  import Settings from './routes/Settings.svelte';
  import ShortcutsDialog from './components/ShortcutsDialog.svelte';
  import { isTyping, shortcutsDialog } from './lib/shortcuts.svelte';

  const logo = `${import.meta.env.BASE_URL}logo.svg`;
  let ready = $state(false);

  function onKey(e: KeyboardEvent) {
    if (e.key === '?' && !isTyping(e) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      shortcutsDialog.open = true;
    }
  }

  onMount(async () => {
    await ensureBuiltins(db);
    ready = true;
  });

  const route = $derived.by(() => {
    const p = router.path;
    let m: Record<string, string> | null;
    if ((m = match('/deck/:id', p))) return { name: 'deck', id: m.id } as const;
    if ((m = match('/study/:id', p))) return { name: 'study', id: m.id } as const;
    if ((m = match('/edit/:id', p))) return { name: 'edit', id: m.id } as const;
    if (p === '/add') return { name: 'add' } as const;
    if (p === '/import') return { name: 'import' } as const;
    if (p === '/settings') return { name: 'settings' } as const;
    return { name: 'home' } as const;
  });
</script>

{#if route.name !== 'study'}
  <header class="app-header">
    <a class="brand" href="#/">
      <img src={logo} alt="" width="36" height="36" />
      <h1>Nenrin</h1>
      <ruby class="kanji" lang="ja">年輪<rp>(</rp><rt>ねんりん</rt><rp>)</rp></ruby>
    </a>
    <span class="badge">pre-alpha</span>
    <button
      class="icon-link kbd-button"
      onclick={() => (shortcutsDialog.open = true)}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
        ><path
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM7 10h.01M11 10h.01M15 10h.01M7 14h10"
        /></svg
      >
    </button>
    <a class="icon-link" href="#/settings" aria-label="Settings" title="Settings">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
        ><path
          fill="currentColor"
          d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
          transform="translate(-1 0)"
        /></svg
      >
    </a>
  </header>
{/if}

<main>
  {#if !ready}
    <p class="muted">Loading…</p>
  {:else if route.name === 'deck'}
    {#key route.id}<DeckView id={route.id} />{/key}
  {:else if route.name === 'study'}
    {#key route.id}<Review deckId={route.id} />{/key}
  {:else if route.name === 'edit'}
    {#key route.id}<Editor noteId={route.id} />{/key}
  {:else if route.name === 'add'}
    <Editor />
  {:else if route.name === 'import'}
    <Import />
  {:else if route.name === 'settings'}
    <Settings />
  {:else}
    <Home />
  {/if}
</main>

<ShortcutsDialog />
<svelte:window onkeydown={onKey} />

{#if route.name !== 'study'}
  <footer class="muted">
    Local-first · works offline · <a href="https://github.com/parmsam/nenrin">Source (MIT)</a>
  </footer>
{/if}

<style>
  .app-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 1.1rem 0 1.25rem;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    color: inherit;
    text-decoration: none;
  }
  h1 {
    font-size: 1.45rem;
    margin: 0;
    letter-spacing: 0.01em;
  }
  .kanji {
    color: var(--muted);
    font-size: 1rem;
    letter-spacing: 0.1em;
    ruby-position: over;
  }
  .kanji rt {
    font-size: 0.55em;
    letter-spacing: 0.05em;
  }
  .badge {
    margin-left: auto;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
  }
  .icon-link {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    color: var(--muted);
  }
  button.icon-link {
    padding: 0;
    background: transparent;
  }
  /* Touch-only devices have no keyboard to need shortcuts for. */
  @media (hover: none) {
    .kbd-button {
      display: none;
    }
  }
  .icon-link:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  footer {
    padding: 2rem 0 1.5rem;
    font-size: 0.85rem;
    text-align: center;
  }
</style>
