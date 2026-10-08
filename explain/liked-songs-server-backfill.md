# Saved-song compatibility

Each liked song keeps the original `audioUrl` for released JioSaavn builds and has at most one additional provider link, `youtubeUrl`, for YouTube Music. `youtubeUrl` is a permanent watch URL (`https://music.youtube.com/watch?v=VIDEO_ID`), not a playable CDN stream. The player resolves a fresh stream only when playback starts; no temporary or signed stream URL is stored.

The current app prefers a valid `youtubeUrl` when present. Older app versions continue reading the unchanged JioSaavn `audioUrl`. Silent backfill considers a song only when it is JioSaavn-sourced and has a valid HTTP(S) legacy audio URL; it then requires a confident YouTube match. Records without either remain unchanged. No button, migration UI or provider fallback is added. Existing metadata, IDs, and timestamps are preserved.

## Admin tools

Run these only from a trusted operator machine with Firebase Admin access. Never put service-account credentials in the app or repository. Dry-run is the default.

```powershell
# Find confident YouTube matches and add youtubeUrl only.
npm run liked:backfill -- --project spotify-8fefc --credentials 'C:\private\firebase-admin.json' --limit 20
npm run liked:backfill -- --project spotify-8fefc --credentials 'C:\private\firebase-admin.json' --apply

# Remove redundant fields from an older rollout. Makes a local snapshot first.
npm run liked:simplify -- --project spotify-8fefc --credentials 'C:\private\firebase-admin.json'
npm run liked:simplify -- --project spotify-8fefc --credentials 'C:\private\firebase-admin.json' --apply

# Remove YouTube preference for a song to return the new app to its preserved JioSaavn URL.
npm run liked:backfill -- --project spotify-8fefc --credentials 'C:\private\firebase-admin.json' --restore --apply
```

Backfill selects a candidate only when its title, performer, version and duration meet strict confidence checks. Uncertain songs stay unchanged. The tool stores only `youtubeUrl`; it does not overwrite legacy JioSaavn fields. Backups, checkpoints and audit output stay under the Git-ignored `.expo/liked-backfill/` folder. The schema simplifier deletes only the retired `playbackBackup`, `playbackLinks` and `playbackMapping` fields after first backing up the current collection-group data locally.

## Current project result

On 2026-10-08, the backfill covered 432 Firestore liked-song documents. 277 have a YouTube watch URL and retain their original `audioUrl`; 155 have no confident match and remain unchanged. One old root-array like was previously copied into the current per-song path while retaining the original root-array record.

The schema simplification then removed all 277 instances of `playbackBackup`, `playbackLinks` and `playbackMapping`. Verification found 432 documents, 277 valid `youtubeUrl` values, zero retired fields, and zero changed JioSaavn `audioUrl` values. A pre-simplification snapshot is stored locally under `.expo/liked-backfill/`.
