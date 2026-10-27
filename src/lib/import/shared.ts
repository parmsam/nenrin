/**
 * Files shared to Nenrin from another app (Android and desktop Chrome). The service worker
 * parks the file in a cache and opens #/import?shared=1 (public/sw-custom.js); this takes it
 * back out, once.
 */

const SHARE_CACHE = 'nenrin-share';

export async function takeSharedFile(): Promise<File | null> {
  if (!('caches' in self)) return null;
  const cache = await caches.open(SHARE_CACHE);
  // The service worker's scope is the app's base path.
  const key = new URL(`${import.meta.env.BASE_URL}shared-file`, location.origin).href;
  const response = await cache.match(key);
  if (!response) return null;
  const name = decodeURIComponent(response.headers.get('X-Filename') ?? 'shared file');
  const file = new File([await response.blob()], name, {
    type: response.headers.get('Content-Type') ?? '',
  });
  await cache.delete(key);
  return file;
}
