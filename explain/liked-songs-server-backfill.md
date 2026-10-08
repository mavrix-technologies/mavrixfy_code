# Saved-song YouTube backfill (operator only)

The app has no migration banner, review screen, or update/restore buttons. Backfill belongs on a trusted administrator machine; no Admin keys go into an app build. LastWave reference: LikedSongsManager mutation mutex, GeneratedTrack.sameSongAs (video ID first, whitespace-normalized title|artist second), and StoredTrack.url (durable track identity). Firestore and the account cache remain Mavrixfy's storage rather than replacing them with Android Room/public Downloads.

## Compatibility and playback

Keep each original users/{uid}/likedSongs/{songId} document, all its original root fields and timestamps. Add only:

- playbackBackup: version 1, first raw original snapshot; never overwritten.
- playbackLinks: original JioSaavn ID/catalog/audio URLs when present, and permanent YouTube Music watch URL/video ID.
- playbackMapping: version 1, enabled, durable YouTube metadata, matchScore, provenance, timestamp. No signed audio URL is saved.

Old released apps continue reading original JioSaavn fields. New builds project valid enabled mappings to canonical youtube_{videoId} Songs and use the existing YouTube resolver on play. The resolver obtains a fresh temporary CDN stream URL in memory. A permanent watch link is not itself an audio stream; video availability, regional restrictions and upstream changes prevent a forever/100% playback guarantee. No automatic provider fallback is introduced.

The app keeps a local metadata cache, preserves original like document aliases, serializes heart mutations like LastWave's mutex, and deduplicates by video ID or normalized title/artist. A heart Unlike intentionally removes linked like documents; no migration writes recreate deleted likes.

## Run

Run from Mavrixfy_App using Firebase Admin credentials with Firestore access. GOOGLE_APPLICATION_CREDENTIALS can point to a local service-account JSON outside the repository, or pass --credentials with its path. Android google-services.json is app configuration, not an Admin credential. The JSON project must match the explicit target project.

```powershell
# Read-only preview first; no cloud writes.
npm run liked:backfill -- --project spotify-8fefc --credentials 'C:\private\firebase-admin.json' --limit 20

# Apply across saved song documents. User authorization for this task already covers backfill.
npm run liked:backfill -- --project spotify-8fefc --credentials 'C:\private\firebase-admin.json' --apply

# Re-scan unmapped records / failed searches / likes created by older app versions.
npm run liked:backfill -- --project spotify-8fefc --credentials 'C:\private\firebase-admin.json' --apply --restart

# Operator rollback retains originals, backup and YouTube metadata.
npm run liked:backfill -- --project spotify-8fefc --credentials 'C:\private\firebase-admin.json' --restore --apply

# No Firebase access needed: probe the SAME YouTube catalog transport as the app.
npm run liked:backfill -- --probe 'Chaleya Arijit Singh Shilpa Rao'
```

Sequential search and 100-document pagination bound memory and requests. A bounded metadata-only search cache avoids repeating songs across users. Each write transaction re-reads the original and checks updateTime; modified/deleted records are skipped. Existing mappings, disabled preferences and unknown mapping versions are left unchanged. The first backup remains unchanged. Restore disables only mappings created by admin-backfill-v1.

Checkpoint and audit files are private local artifacts under .expo/liked-backfill/ (Git ignored); apply, dry-run and restore each have separate files. SIGINT stops between records. Resume is safe even if a write committed before checkpoint persistence. --restart scans again, skipping already mapped songs. Audit records include document path, selected video ID, score and outcome; failed and needs-review records must be reviewed/retried by the operator. Dry-run counts and access errors must not be reported as completed migration.

Ranking runs only in the admin helper (no matching logic ships to users): title 45, artist 30, duration 20, album 5; version mismatch loses 45. Top score wins, but auto-apply requires >=85, identical normalized title, matching version markers and artist overlap >=0.8. Known durations must be within max(5 seconds, 3%). If an old record has no duration, require exact artist token coverage and a known candidate duration; normalize scoring over the available 80 points. Scores are heuristics, not verified recording identity or official status.

Scan accepts only users/{uid}/likedSongs/{songId}. Other collection-group paths, including unknown legacy root likedSongs/{uid} documents, are audited as unsupported rather than guessing their array schema. Actual historical root-document shape must be inspected with Admin access before supporting it. There is no claim that unsupported or uncertain records have been migrated.

Old apps may keep writing new JioSaavn likes before and after rollout. Re-scan with --restart immediately before rollout and periodically while those builds remain active; this script does not deploy a continuous Cloud Function. Mapping conversion does not interrupt an already playing track.

## Validation and access status

Live shared-transport search found Chaleya by Arijit Singh/Shilpa Rao at 201 seconds (video V_jp5_VAzXk), separately from other artists/versions. Firebase Admin ADC and existing Firebase CLI authentication were unavailable on this machine; the provided Android app configuration does not change that. No real users' records have been modified. Final automated checks are recorded in youtube-music-implementation.md.

References: Firebase server SDK credentials https://firebase.google.com/docs/firestore/quickstart-server ; transaction semantics https://firebase.google.com/docs/firestore/manage-data/transactions ; YouTube.js song search https://ytjs.dev/api/youtubei.js/namespaces/Types/type-aliases/MusicSearchType .
