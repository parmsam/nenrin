# Storage and sync strategy

Status: **draft for discussion** (2026-10-25). Nothing here is built yet except local storage and JSON backup.

## The problem

Nenrin keeps everything in the browser's IndexedDB. That's fast, private, and works offline, but:

1. **Data can disappear.** The user clears site data, a browser is reset, or iOS Safari evicts storage for sites that aren't installed to the Home Screen. Installed PWAs and granted `navigator.storage.persist()` are much safer, but not guaranteed.
2. **One device only.** You can't study on your phone and your Mac.

We want to solve both **without running a server**, which is a core goal (see `PLAN.md`). The idea is to use storage the user already has: iCloud, Google Drive, Dropbox, or a folder on disk.

## Key insight: pick a sync model first, then providers

Cloud drives are good at storing files and bad at merging them. If two devices both overwrite `nenrin.json`, one side's reviews are lost. So the design question isn't "iCloud or Drive?" but **"what do we write so that merging is trivial?"** Then any file store works.

### Recommended model: per-device append-only logs

```
Nenrin/                         (in the user's cloud folder)
  devices/
    <deviceId>/
      000001.jsonl              each device only ever writes its own files
      000002.jsonl
  media/
    <sha1>.png                  content-addressed, immutable
  snapshot-<deviceId>.json.gz   optional compaction, for fast first sync
```

- **Each device writes only its own files**, so the cloud provider never sees conflicting writes.
- **Review logs are naturally append-only**, and merging is a set union by `id`.
- **Card scheduling state can be rebuilt by replaying review logs** through FSRS, so it never needs merging.
- **Notes and decks** use last-writer-wins per record, ordered by a hybrid logical clock. Rare conflicts, for example editing the same note on two offline devices, lose one edit, not data.
- **Deletes** are recorded as tombstones so they propagate.
- **Media** is named by its SHA-1, so it's immutable and trivially deduped. (We already hash images in `src/lib/db/media.ts`.)
- **Optional end-to-end encryption:** encrypt each file with a passphrase-derived key (WebCrypto AES-GCM) before upload. The cloud provider then only sees ciphertext.

Then a tiny provider interface covers every backend:

```ts
interface BlobStore {
  list(prefix: string): Promise<string[]>;
  get(path: string): Promise<Blob | undefined>;
  put(path: string, data: Blob): Promise<void>; // never overwrites another device's files
}
```

## Provider options

| Option                                           | Works on                    | Effort | Cost to us              | Notes                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | --------------------------- | ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JSON backup file** (done in Phase 1)           | Everywhere                  | Done   | $0                      | Manual. On iOS, _Share → Save to Files_ puts it in iCloud Drive. A safety net, not sync.                                                                                                                                                                                                                      |
| **Folder on disk** (File System Access API)      | Chrome / Edge desktop only  | Low    | $0                      | Pick a folder inside **iCloud Drive, Google Drive for Desktop, or Dropbox**, and their desktop apps sync it. Not available in Safari, Firefox, or on iOS.                                                                                                                                                     |
| **Google Drive API**                             | All browsers, incl. iOS PWA | Medium | $0 (free Cloud project) | `drive.appdata` (hidden app folder) or `drive.file` are **non-sensitive scopes**, so only basic verification is needed. It's browser-only with no backend, but access tokens last ~1 hour with no refresh token, so re-auth happens silently or via a popup, and popups are awkward in an iOS standalone PWA. |
| **Dropbox API**                                  | All browsers                | Medium | $0                      | OAuth **PKCE gives a browser app a long-lived refresh token without a secret**. The smoothest pure-web option.                                                                                                                                                                                                |
| **iCloud via CloudKit JS**                       | All browsers                | High   | $99/yr Apple Developer  | Users sign in with an Apple ID, and data counts against _their_ iCloud quota. Its docs are in Apple's archive, so long-term support is uncertain.                                                                                                                                                             |
| **iCloud natively** (Tauri macOS app, later iOS) | Apple devices               | High   | $99/yr                  | The "it just works" Apple experience: iCloud Drive container or CloudKit. Fits Phase 4's macOS app.                                                                                                                                                                                                           |
| **WebDAV / Nextcloud / remoteStorage**           | All browsers                | Medium | $0                      | Good for self-hosters. CORS often needs server config.                                                                                                                                                                                                                                                        |

### What about iCloud specifically?

**There's no browser API for iCloud Drive.** A web app can't read or write it directly. Our realistic iCloud paths are:

1. **Now:** backups saved to iCloud Drive through the share sheet or Files app (manual).
2. **Desktop:** the folder-sync option, with Nenrin's folder inside iCloud Drive (Chrome or Edge on Mac only).
3. **Later:** the native Tauri app with real iCloud integration (Apple Developer account required).

**Google Drive and Dropbox can be integrated directly from the PWA, on every platform including iPhone.**

## Recommendation (phased)

| When              | What                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1** (now) | JSON backup export/import ✅. Ask for persistent storage. Add a "last backup: N days ago" reminder.                            |
| **Phase 3**       | Auto-backup to a chosen folder (Chrome/Edge desktop). Use the Web Share API on iOS for one-tap _Save to Files / iCloud Drive_. |
| **Phase 4a**      | Build the **sync engine** (per-device logs + `BlobStore`) with a local-folder adapter, and test it hard.                       |
| **Phase 4b**      | **Dropbox** and **Google Drive** adapters (web, all platforms). Optional E2E encryption.                                       |
| **Phase 4c**      | **iCloud** through the native macOS/iOS app.                                                                                   |

### Cheap things to do now so sync isn't painful later

- ✅ Stable UUIDs for every record; `updatedAt` on notes.
- ✅ Review logs are append-only (undo removes only the log entry it just wrote).
- ✅ `deviceId` on review logs. ☐ `updatedAt` on decks.
- ☐ Record deletions as tombstones instead of only hard deletes.
- ☐ Keep card state derivable from review logs (add a test that replaying logs reproduces it).

## Open questions for us

1. **Which devices matter most?** If it's iPhone + Mac, Dropbox/Drive on the web get there fastest; iCloud needs the native app.
2. **Is $99/yr for an Apple Developer account OK** (needed for any real iCloud, and for a signed macOS app anyway)?
3. **Do we want E2E encryption on by default?** It's more private, but a forgotten passphrase means lost sync data (local data is unaffected).
4. **One provider first, or several?** I'd suggest Dropbox first (best browser auth story), then Google Drive.

## Sources

- Google Drive API scopes (non-sensitive `drive.appdata` / `drive.file`): https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Dropbox OAuth with offline access / PKCE: https://dropbox.tech/developers/using-oauth-2-0-with-offline-access
- CloudKit private database docs: https://developer.apple.com/tutorials/data/documentation/cloudkit/ckcontainer/privateclouddatabase.md
