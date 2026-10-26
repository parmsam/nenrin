<script lang="ts">
  import { tick } from 'svelte';
  import { db } from '../lib/db';
  import { mediaUrls } from '../lib/db/media';
  import { mediaRefs, resolveMedia } from '../lib/render';
  import { cssMediaRefs, isStockCss, scopeDeckCss } from '../lib/render/deck-css';
  import { renderDiagramsIn } from '../lib/render/diagram';
  import { renderMathIn } from '../lib/render/math';
  import { compareTyped } from '../lib/study/typing';
  import { isDarkMode } from '../lib/theme';

  let {
    html,
    css = '',
    side = 'question',
    autoplay = false,
    typed = $bindable(''),
    onsubmit,
  }: {
    /** Already-sanitized card HTML (from renderCard). */
    html: string;
    /** The note type's CSS; applied scoped to this card, or ignored if it's Anki's stock CSS. */
    css?: string;
    /** Which side is showing. On the answer, only audio after <hr id="answer"> autoplays. */
    side?: 'question' | 'answer';
    /** Play the side's audio when it appears. */
    autoplay?: boolean;
    /** Type-in-the-answer: the text typed on the front, compared on the back. */
    typed?: string;
    /** Enter in the answer box (show the answer). */
    onsubmit?: () => void;
  } = $props();

  let resolved = $state('');
  let scopedCss = $state('');
  let container: HTMLDivElement | undefined = $state();
  let playRun = 0;

  // Browsers without CSS @scope can't contain deck styles, so they just don't get them.
  const supportsScope = 'CSSScopeRule' in globalThis;
  const dark = isDarkMode();
  // Deck styles written only for light mode (white card, dark text, no .nightMode rules) get
  // inverted in dark mode, with images and video flipped back, instead of a glaring white box.
  const autoDark = $derived(dark && !!scopedCss && !/night_?mode/i.test(css));

  $effect(() => {
    const source = html;
    let cancelled = false;
    const refs = mediaRefs(source);
    const ready = refs.length
      ? mediaUrls(db, refs).then((urls) => resolveMedia(source, urls))
      : Promise.resolve(source);
    resolved = source;
    ready.then(async (final) => {
      if (cancelled) return;
      resolved = final;
      await tick();
      if (cancelled) return;
      if (container) {
        renderMathIn(container);
        renderDiagramsIn(container);
        mountTyping(container);
        fitOcclusions(container);
      }
      if (autoplay) play();
    });
    return () => {
      cancelled = true;
      stop();
    };
  });

  $effect(() => {
    const source = css;
    scopedCss = '';
    if (!source || !supportsScope || isStockCss(source)) return;
    let cancelled = false;
    mediaUrls(db, cssMediaRefs(source)).then((urls) => {
      if (!cancelled) scopedCss = scopeDeckCss(source, { urls });
    });
    return () => (cancelled = true);
  });

  const span = (text: string, cls: string) =>
    Object.assign(document.createElement('span'), { textContent: text, className: cls });

  /** Fills the template's type-in placeholders: a text box on the front, the comparison on the back. */
  function mountTyping(root: HTMLElement) {
    // Anki allows one answer box per card.
    root.querySelectorAll('.nenrin-type').forEach((box, i) => {
      if (i > 0) return box.remove();
      const input = Object.assign(document.createElement('input'), {
        type: 'text',
        className: 'type-answer',
        value: typed,
        autocomplete: 'off',
        spellcheck: false,
        enterKeyHint: 'done',
      });
      input.setAttribute('aria-label', 'Type the answer');
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('autocorrect', 'off');
      input.addEventListener('input', () => (typed = input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          onsubmit?.();
        }
      });
      box.replaceChildren(input);
      // Only while studying; previews (editor, browse) show the box without taking focus.
      if (onsubmit) input.focus({ preventScroll: true });
      else input.disabled = true;
    });
    for (const el of root.querySelectorAll<HTMLElement>('.nenrin-type-answer')) {
      const result = compareTyped(typed, el.dataset.expected ?? '');
      const line = (parts: { text: string; kind: string }[]) => {
        const div = document.createElement('div');
        div.append(...parts.map((p) => span(p.text, `typed-${p.kind}`)));
        return div;
      };
      const nodes: Node[] = [];
      if (result.correct) nodes.push(line(result.expected));
      else {
        if (typed.trim()) nodes.push(line(result.typed), span('↓', 'typed-arrow'));
        nodes.push(line(result.expected));
      }
      el.replaceChildren(...nodes);
      el.setAttribute(
        'aria-label',
        result.correct ? 'Your answer is correct' : 'Your answer compared with the correct one',
      );
    }
  }

  /** Masks stored in pixels (Anki 23.10.0) take their coordinate space from the image. */
  function fitOcclusions(root: HTMLElement) {
    for (const io of root.querySelectorAll<HTMLElement>('.nenrin-io[data-units="px"]')) {
      const img = io.querySelector('img');
      const svg = io.querySelector('svg');
      if (!img || !svg) continue;
      const fit = () => svg.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
      if (img.complete && img.naturalWidth) fit();
      else img.addEventListener('load', fit, { once: true });
    }
  }

  function audios(): HTMLAudioElement[] {
    if (!container) return [];
    const all = [...container.querySelectorAll('audio')];
    if (side !== 'answer') return all;
    // The answer usually repeats the question ({{FrontSide}}): play only what's new.
    const divider = container.querySelector('hr#answer');
    return divider
      ? all.filter((a) => divider.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING)
      : all;
  }

  function stop() {
    playRun++;
    for (const a of container?.querySelectorAll('audio') ?? []) a.pause();
  }

  /** Plays this side's audio clips one after another. */
  async function play() {
    stop();
    const run = playRun;
    for (const audio of audios()) {
      if (run !== playRun) return;
      audio.currentTime = 0;
      try {
        await audio.play();
        await new Promise<void>((done) => {
          audio.addEventListener('ended', () => done(), { once: true });
          audio.addEventListener('pause', () => done(), { once: true });
          audio.addEventListener('error', () => done(), { once: true });
        });
      } catch {
        // Autoplay blocked (e.g. iOS without a recent tap) or a broken file: R / the player work.
        return;
      }
    }
  }

  /** Replays the current side's audio (the R shortcut). */
  export function replay() {
    play();
  }
</script>

{#if scopedCss}
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- scopeDeckCss escapes "<" and scopes rules -->
  {@html `<style>${scopedCss}</style>`}
{/if}
<!-- .deck-scope is the @scope root; deck rules match only inside it, so the classes decks
     target (.card, .nightMode) go on the inner element, as in Anki. -->
<div class="deck-scope" bind:this={container}>
  <div
    class="deck-card card"
    class:styled={!!scopedCss}
    class:auto-dark={autoDark}
    class:nightMode={dark}
    class:night_mode={dark}
  >
    <div class="card-content">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by renderCard() -->
      {@html resolved}
    </div>
  </div>
</div>

<style>
  /* Image occlusion: an SVG of masks laid over the image (see render/occlusion.ts). */
  .card-content :global(.nenrin-io) {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
  }
  .card-content :global(.nenrin-io img) {
    display: block;
    max-width: 100%;
    height: auto;
  }
  .card-content :global(.io-masks) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .card-content :global(.io-masks > *) {
    vector-effect: non-scaling-stroke;
    stroke-width: 2px;
  }
  /* As in Anki: the masks to guess in red, the others in yellow. */
  .card-content :global(.io-active) {
    fill: var(--io-active);
    stroke: var(--again);
  }
  .card-content :global(.io-inactive) {
    fill: var(--io-inactive);
    stroke: var(--hard);
  }
  .card-content :global(.io-revealed) {
    fill: none;
    stroke: var(--good);
    stroke-dasharray: 6 4;
  }
  .card-content :global(.io-header) {
    margin-bottom: 0.75rem;
  }
  /* Type-in-the-answer: the box, and the comparison (Anki's colors: right, wrong, missing). */
  .card-content :global(.type-answer) {
    display: block;
    width: min(100%, 24rem);
    margin: 1rem auto 0;
    font: inherit;
    text-align: center;
  }
  /* The card clips outlines drawn outside it, so draw the focus ring inside the box. */
  .card-content :global(.type-answer:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .card-content :global(.nenrin-type-answer) {
    display: block;
    margin: 0.75rem auto 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow-wrap: anywhere;
  }
  .card-content :global(.typed-good) {
    color: var(--good);
  }
  .card-content :global(.typed-bad) {
    color: var(--again);
    text-decoration: line-through;
  }
  .card-content :global(.typed-missing) {
    color: var(--muted);
    text-decoration: underline;
  }
  .card-content :global(.typed-arrow) {
    display: block;
    color: var(--muted);
  }
  .deck-scope {
    /* Deck CSS can't position or paint outside the card. */
    contain: layout paint;
    border-radius: 12px;
  }
  .deck-card {
    border-radius: 12px;
  }
  .deck-card.styled {
    padding: 0.5rem;
  }
  .deck-card.auto-dark {
    background: transparent !important;
    filter: invert(1) hue-rotate(180deg);
  }
  .deck-card.auto-dark :global(img),
  .deck-card.auto-dark :global(video) {
    filter: invert(1) hue-rotate(180deg);
  }
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
  .card-content :global(audio) {
    max-width: 100%;
    margin: 0.4rem 0;
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
  /* Diagrams use the app's tokens, so they follow light/dark and the accent without re-rendering. */
  .card-content :global(.nenrin-diagram) {
    --pele-bg: transparent;
    --pele-fg: var(--text);
    --pele-muted: var(--muted);
    --pele-line: var(--muted);
    --pele-surface: var(--surface-2);
    --pele-surface-alt: var(--accent-soft);
    --pele-border: var(--border);
    --pele-accent: var(--accent);
    --pele-font: inherit;
    --pele-radius: 6px;
    margin: 0.75rem auto;
    max-width: 100%;
    overflow-x: auto;
    /* Source text shows until Pele has loaded; keep it quiet. */
    white-space: pre;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .card-content :global(.nenrin-diagram[data-rendered]) {
    white-space: normal;
    color: inherit;
    font-size: 1rem;
  }
  .card-content :global(.nenrin-diagram svg) {
    display: block;
    margin: 0 auto;
  }
  /* Typst's own stylesheet is dropped (page-wide rules); this is the part SVGs need. */
  .card-content :global(.nenrin-diagram svg.typst-doc) {
    fill: none;
    overflow: visible;
    max-width: 100%;
    height: auto;
  }
  .card-content :global(.diagram-hint) {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .card-content :global(.diagram-error) {
    color: var(--again);
    font-size: 0.85rem;
  }
  .card-content :global(.katex-display) {
    overflow-x: auto;
    overflow-y: hidden;
  }
  .card-content :global(details.hint) {
    display: inline-block;
    font-size: 0.9em;
  }
</style>
