<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from './lib/db';
  import { ensureBuiltins } from './lib/notes';
  import { match, navigate, router } from './lib/router.svelte';
  import DeckView from './routes/DeckView.svelte';
  import Home from './routes/Home.svelte';
  import Review from './routes/Review.svelte';

  // Everyday screens ship in the main bundle; the rest load on first visit (and are
  // precached by the service worker, so they still open offline).
  const lazy = {
    editor: () => import('./routes/Editor.svelte'),
    stats: () => import('./routes/Stats.svelte'),
    browse: () => import('./routes/Browse.svelte'),
    import: () => import('./routes/Import.svelte'),
    settings: () => import('./routes/Settings.svelte'),
  };
  import CommandPalette from './components/CommandPalette.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import { paletteState } from './lib/palette.svelte';
  import ShortcutsDialog from './components/ShortcutsDialog.svelte';
  import Splash from './components/Splash.svelte';
  import UpdatePrompt from './components/UpdatePrompt.svelte';
  import { isTyping, shortcutsDialog } from './lib/shortcuts.svelte';

  const logo = `${import.meta.env.BASE_URL}logo.svg`;
  let ready = $state(false);

  function onKey(e: KeyboardEvent) {
    // ⌘K / Ctrl+K toggles the command palette, even from inside a text field.
    if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      paletteState.open = !paletteState.open;
      return;
    }
    if (e.key === '?' && !isTyping(e) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      shortcutsDialog.open = true;
    }
  }

  onMount(async () => {
    await ensureBuiltins(db);
    ready = true;
  });

  // Where to return when the gear is clicked again while Settings is open.
  let beforeSettings = '/';
  $effect(() => {
    const here = location.hash.slice(1) || '/';
    if (router.path !== '/settings') beforeSettings = here;
  });

  /** The gear toggles Settings: open it, or go back to where you were. */
  function toggleSettings(e: MouseEvent) {
    if (router.path !== '/settings') return;
    e.preventDefault();
    navigate(beforeSettings);
  }

  const route = $derived.by(() => {
    const p = router.path;
    let m: Record<string, string> | null;
    if ((m = match('/deck/:id', p))) return { name: 'deck', id: m.id } as const;
    if ((m = match('/study/:id', p))) return { name: 'study', id: m.id } as const;
    if ((m = match('/edit/:id', p))) return { name: 'edit', id: m.id } as const;
    if (p === '/add') return { name: 'add' } as const;
    if (p === '/import') return { name: 'import' } as const;
    if (p === '/browse') return { name: 'browse' } as const;
    if (p === '/stats') return { name: 'stats' } as const;
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
    <span class="badge" title="Pre-alpha: expect rough edges">v{__APP_VERSION__}</span>
    <a class="icon-link" href="#/browse" aria-label="Browse notes" title="Browse notes">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
        ><path
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5"
        /></svg
      >
    </a>
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
    <a
      class="icon-link"
      class:active={route.name === 'settings'}
      href="#/settings"
      onclick={toggleSettings}
      aria-label={route.name === 'settings' ? 'Close settings' : 'Settings'}
      aria-current={route.name === 'settings' ? 'page' : undefined}
      title={route.name === 'settings' ? 'Close settings' : 'Settings'}
    >
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
  {:else if route.name === 'edit' || route.name === 'add'}
    {#await lazy.editor() then m}
      {#key route.name === 'edit' ? route.id : 'add'}
        <m.default noteId={route.name === 'edit' ? route.id : undefined} />
      {/key}
    {/await}
  {:else if route.name === 'stats' || route.name === 'browse' || route.name === 'import' || route.name === 'settings'}
    {#await lazy[route.name]() then m}<m.default />{:catch}
      <p class="error">Couldn’t load this screen. Check your connection and reload.</p>
    {/await}
  {:else}
    <Home />
  {/if}
</main>

<ShortcutsDialog />
<ConfirmDialog />
<CommandPalette />
{#if ready}<Splash />{/if}
<UpdatePrompt />
<svelte:window onkeydown={onKey} />

<!-- Rendered once the app is ready, so it doesn't jump down as content loads (CLS). -->
{#if ready && route.name !== 'study'}
  <footer class="muted">
    Nenrin v{__APP_VERSION__} (pre-alpha) · Local-first · works offline ·
    <a href="https://github.com/parmsam/nenrin">Source (MIT)</a>
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
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.04em;
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
  .icon-link.active {
    background: var(--accent-soft);
    color: var(--accent);
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
