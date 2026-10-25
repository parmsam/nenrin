<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A row you can swipe left to reveal a destructive action (iOS-style). A short swipe reveals
   * the button; a long swipe triggers the action directly. Either way the caller confirms.
   * Vertical scrolling is untouched (touch-action: pan-y), and a swipe never counts as a click.
   */
  let {
    actionLabel,
    onAction,
    children,
  }: {
    /** Accessible label for the revealed button, e.g. "Delete Japanese". */
    actionLabel: string;
    /** Runs the action (the caller asks for confirmation). */
    onAction: () => Promise<unknown>;
    children: Snippet;
  } = $props();

  const REVEAL = 92; // px: width of the revealed button
  const FULL = 200; // px: past this, release triggers the action

  let offset = $state(0);
  let dragging = $state(false);
  let start: { x: number; y: number; offset: number; id: number } | null = null;
  let decided: 'horizontal' | 'vertical' | null = null;
  let suppressClick = false;

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, offset, id: e.pointerId };
    decided = null;
  }

  function move(e: PointerEvent) {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!decided) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        decided = 'horizontal';
        dragging = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else if (Math.abs(dy) > 10) {
        decided = 'vertical';
        start = null;
        return;
      } else return;
    }
    // Rubber-band a little past the full-swipe point.
    const raw = start.offset + dx;
    offset = Math.max(-FULL - 40, Math.min(0, raw));
  }

  async function up() {
    if (!start) return;
    const wasDragging = dragging;
    start = null;
    dragging = false;
    if (!wasDragging) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    if (offset <= -FULL) await trigger();
    else offset = offset < -REVEAL / 2 ? -REVEAL : 0;
  }

  async function trigger() {
    offset = -REVEAL;
    await onAction();
    // Confirmed (row goes away) or cancelled (row closes): either way, slide back.
    offset = 0;
  }

  /** A tap on an open row closes it instead of following the link inside. */
  function clickCapture(e: MouseEvent) {
    if (suppressClick || offset !== 0) {
      e.preventDefault();
      e.stopPropagation();
      if (!suppressClick) offset = 0;
    }
  }
</script>

<div class="swipe" class:open={offset < 0}>
  <button
    class="action"
    tabindex={offset < 0 ? 0 : -1}
    aria-hidden={offset < 0 ? undefined : 'true'}
    aria-label={actionLabel}
    onclick={trigger}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
      /></svg
    >
    Delete
  </button>
  <div
    class="content"
    class:dragging
    class:armed={offset <= -FULL}
    style:transform="translateX({offset}px)"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onclickcapture={clickCapture}
    ondragstart={(e) => e.preventDefault()}
    role="presentation"
  >
    {@render children()}
  </div>
</div>

<style>
  .swipe {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
  }
  /* The red shows behind a long swipe; only the revealed strip is the button. */
  .swipe.open {
    background: var(--again);
  }
  .action {
    position: absolute;
    inset: 0 0 0 auto;
    width: 92px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0;
    border-radius: 0;
    background: var(--again);
    color: #fff;
    font-weight: 700;
    font-size: 0.8rem;
  }
  .swipe:not(.open) .action {
    visibility: hidden;
  }
  .action svg {
    width: 1.15rem;
    height: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .content {
    position: relative;
    touch-action: pan-y;
    /* Mouse drags on links would start a native link drag and cancel the swipe. */
    -webkit-user-drag: none;
    /* Text selection would start before the swipe direction is known. */
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    transition: transform 0.2s ease;
    background: var(--bg);
    border-radius: 16px;
  }
  .content.dragging {
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .content {
      transition: none;
    }
  }
</style>
