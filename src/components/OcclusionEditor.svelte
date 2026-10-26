<script lang="ts">
  import { db } from '../lib/db';
  import { addImage, mediaUrls } from '../lib/db/media';
  import { parseOcclusions, serializeOcclusions, type Occlusion } from '../lib/render/occlusion';

  let {
    occlusion = $bindable(''),
    image = $bindable(''),
  }: {
    /** The Occlusion field: Anki's {{cN::image-occlusion:…}} format. */
    occlusion?: string;
    /** The Image field: an <img> tag. */
    image?: string;
  } = $props();

  const masks = $derived(parseOcclusions(occlusion));
  const filename = $derived(
    /src="([^"]+)"/.exec(image)?.[1] ?? /!\[[^\]]*\]\(([^)\s]+)\)/.exec(image)?.[1],
  );
  let url = $state('');
  let selected = $state<number | null>(null);
  let draft = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  let svg: SVGSVGElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  let error = $state('');
  /** Hide all, guess one (Anki's default), or hide one, guess one. */
  const hideAll = $derived(masks.length ? masks.every((m) => m.hideAll) : true);

  $effect(() => {
    const name = filename;
    url = '';
    if (!name) return;
    mediaUrls(db, [decodeURIComponent(name)]).then((urls) => {
      if (name === filename) url = urls.get(decodeURIComponent(name)) ?? '';
    });
  });

  function save(next: Occlusion[]) {
    occlusion = serializeOcclusions(next);
  }

  async function useImage(blob: Blob) {
    if (!blob.type.startsWith('image/')) {
      error = 'That isn’t an image.';
      return;
    }
    error = '';
    const name = await addImage(db, blob);
    image = `<img src="${encodeURI(name)}">`;
  }

  function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) useImage(file);
  }

  function onPaste(e: ClipboardEvent) {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    useImage(file);
  }

  /** Pointer position as a fraction of the image, clamped to it. */
  function at(e: PointerEvent): [number, number] {
    const box = svg!.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return [clamp((e.clientX - box.left) / box.width), clamp((e.clientY - box.top) / box.height)];
  }

  function down(e: PointerEvent) {
    if (e.button !== 0 || (e.target as Element).closest('.mask')) return;
    const [x, y] = at(e);
    draft = { x0: x, y0: y, x1: x, y1: y };
    selected = null;
    svg!.setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (!draft) return;
    [draft.x1, draft.y1] = at(e);
  }

  function up() {
    if (!draft) return;
    const { x0, y0, x1, y1 } = draft;
    draft = null;
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    // A click, not a drag: don't make a sliver.
    if (width < 0.01 || height < 0.01) return;
    // New masks get a new number; existing ones keep theirs, so their cards keep their history.
    const ordinal = Math.max(0, ...masks.map((m) => m.ordinal)) + 1;
    save([
      ...masks,
      {
        ordinal,
        hideAll,
        shape: { kind: 'rect', left: Math.min(x0, x1), top: Math.min(y0, y1), width, height },
      },
    ]);
    selected = masks.length; // the new mask's index, once masks re-derives
  }

  function removeSelected() {
    if (selected === null) return;
    save(masks.filter((_, i) => i !== selected));
    selected = null;
  }

  function onMaskKey(e: KeyboardEvent, i: number) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      selected = i;
      removeSelected();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selected = selected === i ? null : i;
    }
  }

  function setHideAll(value: boolean) {
    save(masks.map((m) => ({ ...m, hideAll: value })));
  }

  /** Where a mask's number label goes. */
  function labelAt(m: Occlusion): [number, number] {
    const s = m.shape;
    if (s.kind === 'rect') return [s.left + s.width / 2, s.top + s.height / 2];
    if (s.kind === 'ellipse') return [s.left + s.rx, s.top + s.ry];
    const n = s.points.length;
    return [s.points.reduce((a, p) => a + p[0], 0) / n, s.points.reduce((a, p) => a + p[1], 0) / n];
  }
</script>

<div class="io-editor field" onpaste={onPaste}>
  <div class="field-head">
    <span class="label">Image and masks</span>
    {#if url}
      <button type="button" class="secondary tiny" onclick={() => fileInput?.click()}
        >Change image…</button
      >
    {/if}
  </div>
  <input
    bind:this={fileInput}
    class="visually-hidden"
    type="file"
    accept="image/*"
    aria-label="Choose an image"
    onchange={onFile}
  />

  {#if !filename}
    <button type="button" class="pick" onclick={() => fileInput?.click()}>
      <strong>Choose an image…</strong>
      <span class="muted">or paste one here. Then drag over the parts to hide.</span>
    </button>
  {:else if !url}
    <p class="muted">Loading image…</p>
  {:else}
    <div class="stage">
      <img src={url} alt="" draggable="false" />
      <svg
        bind:this={svg}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        role="application"
        aria-label="Drag to add a mask"
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={() => (draft = null)}
      >
        {#each masks as m, i (i)}
          <g
            class="mask"
            class:selected={selected === i}
            role="button"
            tabindex="0"
            aria-label="Mask {i + 1}, card {m.ordinal}{selected === i ? ', selected' : ''}"
            onclick={() => (selected = selected === i ? null : i)}
            onkeydown={(e) => onMaskKey(e, i)}
          >
            {#if m.shape.kind === 'rect'}
              <rect
                x={m.shape.left}
                y={m.shape.top}
                width={m.shape.width}
                height={m.shape.height}
              />
            {:else if m.shape.kind === 'ellipse'}
              <ellipse
                cx={m.shape.left + m.shape.rx}
                cy={m.shape.top + m.shape.ry}
                rx={m.shape.rx}
                ry={m.shape.ry}
              />
            {:else}
              <polygon points={m.shape.points.map((p) => p.join(',')).join(' ')} />
            {/if}
          </g>
        {/each}
        {#if draft}
          <rect
            class="draft"
            x={Math.min(draft.x0, draft.x1)}
            y={Math.min(draft.y0, draft.y1)}
            width={Math.abs(draft.x1 - draft.x0)}
            height={Math.abs(draft.y1 - draft.y0)}
          />
        {/if}
      </svg>
      <!-- Numbers in HTML, so they keep their shape over a stretched SVG. -->
      {#each masks as m, i (i)}
        {@const [x, y] = labelAt(m)}
        <span class="num" style:left="{x * 100}%" style:top="{y * 100}%">{m.ordinal}</span>
      {/each}
    </div>
    <div class="row tools">
      <span class="muted"
        >{masks.length
          ? `${masks.length} mask${masks.length === 1 ? '' : 's'}, ${new Set(masks.map((m) => m.ordinal)).size} card${new Set(masks.map((m) => m.ordinal)).size === 1 ? '' : 's'}`
          : 'Drag over the parts to hide.'}</span
      >
      <button
        type="button"
        class="secondary tiny"
        disabled={selected === null}
        onclick={removeSelected}>Delete mask</button
      >
    </div>
    <fieldset class="mode">
      <legend class="visually-hidden">While studying</legend>
      <label>
        <input type="radio" name="io-mode" checked={hideAll} onchange={() => setHideAll(true)} />
        Hide all, guess one
      </label>
      <label>
        <input type="radio" name="io-mode" checked={!hideAll} onchange={() => setHideAll(false)} />
        Hide one, guess one
      </label>
    </fieldset>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .io-editor {
    display: grid;
    gap: 0.35rem;
  }
  .tiny {
    padding: 0.2rem 0.55rem;
    font-size: 0.75rem;
  }
  .field-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .label {
    font-weight: 600;
  }
  .pick {
    display: grid;
    gap: 0.3rem;
    width: 100%;
    padding: 2rem 1rem;
    border: 2px dashed var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    text-align: center;
  }
  .stage {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
    user-select: none;
    -webkit-user-select: none;
  }
  .stage img {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 6px;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    /* Drawing, not scrolling, on touch screens. */
    touch-action: none;
  }
  svg :global(rect),
  svg :global(ellipse),
  svg :global(polygon) {
    vector-effect: non-scaling-stroke;
    stroke-width: 2px;
  }
  .mask {
    fill: var(--io-active);
    stroke: var(--again);
    cursor: pointer;
    outline: none;
  }
  .mask.selected,
  .mask:focus-visible {
    stroke: var(--accent);
    stroke-width: 3px;
    stroke-dasharray: 5 3;
  }
  .draft {
    fill: none;
    stroke: var(--accent);
    stroke-dasharray: 5 3;
  }
  .num {
    position: absolute;
    transform: translate(-50%, -50%);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1;
    color: var(--text);
    pointer-events: none;
  }
  .tools {
    justify-content: space-between;
    margin-top: 0.5rem;
  }
  .mode {
    border: 0;
    padding: 0;
    margin: 0.5rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
  }
  .mode label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .mode input {
    width: auto;
    accent-color: var(--accent);
  }
  .error {
    color: var(--again);
  }
</style>
