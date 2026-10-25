import type { NenrinDB } from '.';

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

async function sha1Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stores a pasted or dropped image. Identical images share one file. Returns its filename. */
export async function addImage(db: NenrinDB, blob: Blob): Promise<string> {
  const mime = blob.type || 'image/png';
  const sha1 = await sha1Hex(blob);
  const existing = await db.media.where('sha1').equals(sha1).first();
  if (existing) return existing.filename;
  const filename = `paste-${sha1.slice(0, 12)}.${EXT[mime] ?? 'bin'}`;
  await db.media.put({ filename, blob, mime, sha1 });
  return filename;
}

const urlCache = new Map<string, string>();

/** blob: URLs for the given media files that exist locally. Cached for the session. */
export async function mediaUrls(db: NenrinDB, filenames: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const missing = filenames.filter((f) => {
    const cached = urlCache.get(f);
    if (cached) out.set(f, cached);
    return !cached;
  });
  for (const m of await db.media.bulkGet(missing)) {
    if (!m) continue;
    const url = URL.createObjectURL(m.blob);
    urlCache.set(m.filename, url);
    out.set(m.filename, url);
  }
  return out;
}
