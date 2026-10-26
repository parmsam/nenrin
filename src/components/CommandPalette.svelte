<script lang="ts">
  import { tick } from 'svelte';
  import { exportBackup } from '../lib/actions';
  import { db } from '../lib/db';
  import { deckTree, type DeckNode } from '../lib/db/decks';
  import {
    loadRecent,
    paletteState,
    rankCommands,
    rememberRecent,
    type Command,
  } from '../lib/palette.svelte';
  import { navigate } from '../lib/router.svelte';
  import { MOD, shortcutsDialog } from '../lib/shortcuts.svelte';
  import { loadTheme, MODES, PALETTES, saveTheme } from '../lib/theme';

  const MAX = 50;
  let dialog: HTMLDialogElement;
  let input: HTMLInputElement | undefined = $state();
  let query = $state('');
  let active = $state(0);
  let decks = $state<DeckNode[]>([]);
  let recent = $state<string[]>([]);
  let note = $state('');

  $effect(() => {
    if (paletteState.open && !dialog.open) {
      query = '';
      active = 0;
      note = '';
      recent = loadRecent();
      db.decks.toArray().then((all) => (decks = deckTree(all)));
      dialog.showModal();
      tick().then(() => input?.focus());
    } else if (!paletteState.open && dialog.open) dialog.close();
  });

  const go = (path: string) => () => navigate(path);

  const commands = $derived.by((): Command[] => {
    const base = import.meta.env.BASE_URL;
    const list: Command[] = [
      { id: 'home', label: 'Decks', group: 'Go to', keywords: 'home today', run: go('/') },
      {
        id: 'add',
        label: 'Add cards',
        group: 'Go to',
        keywords: 'new note create paste',
        run: go('/add'),
      },
      {
        id: 'browse',
        label: 'Browse notes',
        group: 'Go to',
        keywords: 'search find edit',
        run: go('/browse'),
      },
      {
        id: 'stats',
        label: 'Stats',
        group: 'Go to',
        keywords: 'statistics heatmap retention forecast',
        run: go('/stats'),
      },
      {
        id: 'import',
        label: 'Import',
        group: 'Go to',
        keywords: 'anki apkg colpkg csv txt',
        run: go('/import'),
      },
      {
        id: 'settings',
        label: 'Settings',
        group: 'Go to',
        keywords: 'preferences options',
        run: go('/settings'),
      },
      {
        id: 'optimize',
        label: 'Optimize scheduling',
        group: 'Go to',
        keywords: 'fsrs parameters train',
        run: () => void (location.href = `${base}optimize.html`),
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        group: 'Action',
        keys: ['?'],
        run: () => void (shortcutsDialog.open = true),
      },
      {
        id: 'backup',
        label: 'Export backup',
        group: 'Action',
        keywords: 'download save json',
        run: async () => {
          await exportBackup();
          note = 'Backup downloaded.';
        },
      },
      ...MODES.map((m) => ({
        id: `theme-${m.id}`,
        label: `Theme: ${m.label}`,
        group: 'Appearance',
        keywords: m.id === 'dark' ? 'night mode' : m.id === 'light' ? 'day mode' : 'auto os',
        run: () => saveTheme({ ...loadTheme(), mode: m.id }),
      })),
      ...PALETTES.map((p) => ({
        id: `accent-${p.id}`,
        label: `Accent: ${p.label}`,
        group: 'Appearance',
        keywords: `color colour ${p.kanji}`,
        run: () => saveTheme({ ...loadTheme(), palette: p.id }),
      })),
      ...decks.flatMap((d) => [
        {
          id: `study-${d.id}`,
          label: `Study ${d.path}`,
          group: 'Deck',
          keywords: 'review',
          run: go(`/study/${d.id}`),
        },
        {
          id: `preview-${d.id}`,
          label: `Preview ${d.path}`,
          group: 'Deck',
          keywords: 'browse flip read through',
          run: go(`/session/${d.id}?kind=all`),
        },
        {
          id: `custom-${d.id}`,
          label: `Custom study ${d.path}`,
          group: 'Deck',
          keywords: 'cram extra more ahead forgotten tag practice',
          run: go(`/custom/${d.id}`),
        },
        {
          id: `deck-${d.id}`,
          label: `Open ${d.path}`,
          group: 'Deck',
          keywords: 'deck settings',
          run: go(`/deck/${d.id}`),
        },
      ]),
    ];
    return list;
  });

  const results = $derived.by(() => {
    const ranked = rankCommands(commands, query, recent).slice(0, MAX);
    const q = query.trim();
    if (!q) return ranked;
    return [
      ...ranked,
      {
        id: 'search-notes',
        label: `Search notes for “${q}”`,
        group: 'Search',
        run: go(`/browse?q=${encodeURIComponent(q)}`),
      } satisfies Command,
    ];
  });

  $effect(() => {
    // Keep the highlight inside the list as results change.
    if (active >= results.length) active = Math.max(0, results.length - 1);
  });

  async function choose(cmd: Command | undefined) {
    if (!cmd) return;
    if (cmd.id !== 'search-notes') rememberRecent(cmd.id);
    const keepOpen = cmd.id === 'backup';
    if (!keepOpen) paletteState.open = false;
    await cmd.run();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = (active + 1) % Math.max(1, results.length);
      scrollActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active - 1 + results.length) % Math.max(1, results.length);
      scrollActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    }
  }

  function scrollActive() {
    tick().then(() =>
      document.getElementById(`cmd-${active}`)?.scrollIntoView({ block: 'nearest' }),
    );
  }
</script>

<dialog
  bind:this={dialog}
  aria-label="Command palette"
  onclose={() => {
    // The close event arrives a task later; ignore it if the palette was reopened since.
    if (!dialog.open) paletteState.open = false;
  }}
  onclick={(e) => {
    if (e.target === dialog) dialog.close();
  }}
>
  <!-- Only rendered while open: keeps hidden commands out of the page and out of the way. -->
  {#if paletteState.open}
    <div class="box">
      <div class="search">
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5" /></svg
        >
        <input
          bind:this={input}
          bind:value={query}
          oninput={() => (active = 0)}
          onkeydown={onKey}
          placeholder="Type a command or deck…"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results.length ? `cmd-${active}` : undefined}
          aria-autocomplete="list"
          autocomplete="off"
          spellcheck="false"
        />
        <kbd>Esc</kbd>
      </div>
      <ul id="palette-list" role="listbox" aria-label="Commands">
        {#each results as cmd, i (cmd.id)}
          <li
            id="cmd-{i}"
            role="option"
            aria-selected={i === active}
            class:active={i === active}
            onpointermove={() => (active = i)}
            onclick={() => choose(cmd)}
            onkeydown={() => {}}
          >
            <span class="label">{cmd.label}</span>
            {#if cmd.keys}
              <span class="keys"
                >{#each cmd.keys as k (k)}<kbd>{k}</kbd>{/each}</span
              >
            {/if}
            <span class="group">{cmd.group}</span>
          </li>
        {:else}
          <li class="empty" role="presentation">No matches</li>
        {/each}
      </ul>
      <p class="foot muted">
        {#if note}<span role="status">{note}</span>{:else}
          <kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to run · <kbd>{MOD}</kbd><kbd>K</kbd> anywhere
        {/if}
      </p>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(36rem, calc(100vw - 1.5rem));
    margin: 12vh auto auto;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 24px 70px rgb(0 0 0 / 30%);
  }
  dialog::backdrop {
    background: rgb(26 23 20 / 40%);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.9rem;
    border-bottom: 1px solid var(--border);
  }
  .search svg {
    width: 1.2rem;
    height: 1.2rem;
    flex: none;
    fill: none;
    stroke: var(--muted);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .search input {
    border: 0;
    padding: 0.7rem 0;
    font-size: 1.05rem;
    background: transparent;
  }
  .search input:focus-visible {
    outline: none;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0.4rem;
    max-height: min(22rem, 55vh);
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.7rem;
    border-radius: 10px;
    cursor: pointer;
  }
  li.active {
    background: var(--accent-soft);
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .group {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .keys {
    display: inline-flex;
    gap: 0.2rem;
  }
  .empty {
    color: var(--muted);
    cursor: default;
  }
  .foot {
    margin: 0;
    padding: 0.55rem 0.9rem;
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
  }
  kbd {
    margin: 0 0.1rem;
  }
</style>
