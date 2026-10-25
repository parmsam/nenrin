<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';

  const HOUR = 60 * 60 * 1000;

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Tell future service workers this device can show the update prompt, so they wait
      // for the user instead of taking over (see public/sw-migrate.js).
      caches
        ?.open('nenrin-meta')
        .then((c) =>
          c.put(new URL('__nenrin-update-prompt', registration.scope).href, new Response('1')),
        )
        .catch(() => {});
      // Installed apps can stay open for days: check hourly and whenever the app comes back.
      setInterval(() => registration.update(), HOUR);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update();
      });
    },
  });

  /**
   * Activates the waiting version and reloads once it controls the page. We listen for
   * `controllerchange` ourselves: the plugin's own reload doesn't fire in every setup.
   */
  function reload() {
    navigator.serviceWorker?.addEventListener('controllerchange', () => location.reload(), {
      once: true,
    });
    updateServiceWorker(true);
    // If the switch never happens (e.g. the worker was already active), reload anyway.
    setTimeout(() => location.reload(), 3000);
  }

  // "Ready to work offline" is good news, not a decision: let it fade on its own.
  $effect(() => {
    if ($offlineReady) {
      const t = setTimeout(() => offlineReady.set(false), 4000);
      return () => clearTimeout(t);
    }
  });
</script>

{#if $needRefresh}
  <div class="toast" role="alert">
    <span>A new version of Nenrin is ready.</span>
    <button onclick={reload}>Reload</button>
    <button class="secondary" onclick={() => needRefresh.set(false)}>Later</button>
  </div>
{:else if $offlineReady}
  <!-- A polite live region rather than role="status": it's a passing note, and pages
       keep their own status messages. -->
  <div class="toast" aria-live="polite">
    <span>Ready to work offline.</span>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: max(1rem, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: max-content;
    max-width: calc(100vw - 2rem);
    padding: 0.6rem 0.6rem 0.6rem 1rem;
    border-radius: 14px;
    background: var(--hero);
    color: var(--hero-text);
    box-shadow: 0 10px 30px rgb(0 0 0 / 25%);
    font-size: 0.9rem;
  }
  .toast span {
    padding-right: 0.25rem;
  }
  .toast button {
    padding: 0.4rem 0.9rem;
    font-size: 0.85rem;
  }
  .toast button:not(.secondary) {
    background: var(--hero-accent);
    color: var(--hero);
  }
</style>
