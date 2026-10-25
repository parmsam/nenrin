<script lang="ts">
  import type { StudyCounts } from '../lib/study/queue';

  let { counts, current }: { counts: StudyCounts; current?: keyof StudyCounts } = $props();
</script>

<span
  class="counts"
  aria-label="{counts.new} new, {counts.learning} learning, {counts.review} to review"
>
  <span class="new" class:current={current === 'new'} title="New">{counts.new}</span>
  <span class="learning" class:current={current === 'learning'} title="Learning"
    >{counts.learning}</span
  >
  <span class="review" class:current={current === 'review'} title="Review">{counts.review}</span>
</span>

<style>
  .counts {
    display: inline-flex;
    gap: 0.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .new {
    color: var(--new);
  }
  .learning {
    color: var(--learning);
  }
  .review {
    color: var(--review);
  }
  .current {
    text-decoration: underline;
    text-underline-offset: 4px;
    text-decoration-thickness: 2px;
  }
</style>
