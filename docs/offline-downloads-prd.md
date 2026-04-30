# Offline Downloads PRD

## Goal

Build production-ready offline playback for Mavrixfy without locking the app into an MVP-only storage model. Downloads must respect subscriptions, device limits, track rights, local storage safety, and Firestore cost controls from the first implementation phase.

## Phase 0: Foundation

Phase 0 must land before user-facing download controls. It defines the contracts that keep offline playback scalable, revocable, and affordable.

### Download Entitlement Rules

| User state | Download access | Limits |
| --- | --- | --- |
| Free | No full downloads | Progressive streaming cache only, if enabled |
| Premium active | Full downloads | Up to 5 registered download devices and 10,000 offline songs |
| Premium expired | Playback blocked after local grace period | Keep metadata, revoke playable licenses on next sync |
| Account disabled or rights violation | Playback blocked immediately after sync | Remove licenses and queued downloads |

Rules:

- Entitlements are evaluated before queueing any download.
- Device registration is required before the first full download on a device.
- A device must have a stable `deviceId`, platform, app version, last sync time, and active download count.
- The offline song cap counts unique track IDs, not playlist references.
- Local playback requires both a valid entitlement snapshot and a valid per-track offline license.

Suggested constants:

```ts
const DOWNLOAD_DEVICE_LIMIT = 5;
const MAX_OFFLINE_SONGS = 10000;
const LICENSE_REFRESH_INTERVAL_HOURS = 24;
const LICENSE_GRACE_PERIOD_DAYS = 7;
```

### Download Format Strategy

Use segmented encrypted chunks as the target architecture.

```text
downloads/
  tracks/{songId}/
    manifest.json
    segment-00001.enc
    segment-00002.enc
    segment-00003.enc
```

Why:

- Safer resume after network drops.
- Better partial validation and repair.
- Easier future DRM and license revocation.
- Supports progressive caching while streaming.

MVP shortcut allowed:

```text
downloads/tracks/{songId}/track.enc
```

If the MVP starts with encrypted full files, the public download manager API must still behave as if it is segment-based: queued, resumable, locally indexed, and license-gated. That keeps the migration path clean.

### Background Download Engine Architecture

Downloads must be native-backed. The JavaScript thread can coordinate UI state, but it must not own long-running transfer reliability.

| Platform | Engine | Responsibility |
| --- | --- | --- |
| Android | WorkManager | Persistent download queue, retries, constraints, backoff |
| Android | Foreground Service | Long-running active transfers with visible notification |
| iOS | Background URLSession | System-managed background transfers and resume handling |
| React Native | Download manager bridge | Queue commands, progress events, local DB updates, playback handoff |

Required queue states:

```text
queued
waiting_for_wifi
waiting_for_charging
downloading
paused
completed
failed
expired
revoked
deleted
```

### Download Policy Rules

| Case | Behavior |
| --- | --- |
| Streaming song already downloading | Playback uses downloaded local bytes where possible, then falls back to stream |
| Duplicate song in multiple playlists | Store track bytes once, add multiple collection references |
| Low storage warning | Pause new downloads before the safety threshold is crossed |
| Song rights removed | Revoke local playback on next license sync |
| Premium expires | Stop new downloads, block playback after grace period |
| Device limit exceeded | Block queueing until another device is removed |
| Wi-Fi-only enabled on cellular | Queue remains `waiting_for_wifi` |
| Charging-only enabled while unplugged | Queue remains `waiting_for_charging` |
| Corrupt segment or checksum mismatch | Retry segment, then mark track `failed` after retry limit |
| User removes a playlist download | Remove only references; delete bytes only when no references remain |

Storage safety:

- Keep a hard minimum free-space threshold.
- Pause downloads before OS-level storage pressure.
- Show storage usage by songs, playlists, albums, and cache.
- Allow users to delete individual songs, playlists, albums, or all downloads.

### Partial Caching

Support a basic progressive cache primitive before full download UX ships, then productize it in Phase 3.

```text
stream -> encrypted segment cache -> playback reads cache first -> network fills gaps
```

Expected behavior:

- Cache the first 30-60 seconds of frequently played songs.
- Reuse cached bytes during network interruptions.
- Promote cached segments into full downloads when the user taps Download.
- Evict progressive cache before deleting user-requested downloads.
- Keep cache indexes and byte-level progress local only.

Progressive cache is not the same as an offline entitlement. Free users may benefit from short streaming cache, but full offline playback remains premium-gated.

### Firestore Cost Protection

Intermediate transfer progress must stay local only.

Firestore writes are allowed only for:

- Download completed.
- Download failed.
- Download expired or revoked.
- License refresh.
- Device registration or removal.

Do not write per-percent progress, per-segment progress, queue heartbeats, or transient pause/resume events to Firestore.

Local state should use SQLite or another durable local store. AsyncStorage is acceptable only for lightweight preferences, not the canonical download index.

### Admin Catalog Controls

Track documents must support download and rights metadata so the dashboard can disable offline access without an app release.

```json
{
  "downloadable": true,
  "territoryRights": ["IN", "US"],
  "drmRequired": true,
  "offlineAllowed": true,
  "offlineMaxQuality": "high",
  "rightsVersion": 3
}
```

Rules:

- `offlineAllowed` must be true before queueing or refreshing a license.
- `downloadable` controls whether the UI shows full download actions.
- `territoryRights` is checked against the user's effective country.
- `rightsVersion` is copied into local licenses so changed rights can invalidate stale downloads.
- Admin changes should take effect on the next license sync.

## Firestore Architecture

The app should keep Firestore as the source of truth for entitlements, device registration, completed download inventory, and license refresh state. The local device remains the source of truth for byte-level progress.

### Proposed Collections

```text
users/{uid}
  subscriptionStatus
  subscriptionTier
  downloadEntitlement
    canDownload
    maxDevices
    maxOfflineSongs
    licenseGracePeriodDays

users/{uid}/downloadDevices/{deviceId}
  platform
  appVersion
  modelName
  registeredAt
  lastLicenseSyncAt
  active

users/{uid}/offlineLicenses/{songId}
  songId
  deviceId
  status
  rightsVersion
  expiresAt
  refreshedAt
  completedAt
  failedAt
  failureCode

songs/{songId}
  downloadable
  territoryRights
  drmRequired
  offlineAllowed
  offlineMaxQuality
  rightsVersion
```

### Local Download Store

Use a durable local database for:

- Download queue state.
- Segment paths and checksums.
- Track-to-playlist reference counts.
- Progress percentage.
- Retry counts.
- Local-only errors.
- Storage usage.
- Progressive cache index.

Suggested local tables:

```text
download_items
download_segments
download_references
download_licenses
download_preferences
progressive_cache
```

## User Preferences

Required toggles:

- Download over Wi-Fi only.
- Download only while charging.
- Download quality.
- Auto-delete expired downloads.
- Smart downloads, Phase 2 or later.

The charging-only toggle is especially useful for users with limited battery and mobile data constraints.

## Phase 1: MVP

Ship the first user-facing offline experience.

- Song download.
- Playlist download.
- Album download.
- Offline playback.
- Download manager screen.
- Storage management screen.
- Wi-Fi-only and charging-only constraints.
- Basic license sync.
- Duplicate-track storage dedupe.
- Cache-first playback handoff for partially cached current streams.
- Firestore writes only for completed, failed, expired, revoked, and license refresh events.

Exit criteria:

- User can download a song, kill the app, reopen, and play offline.
- User can download a playlist with duplicate songs without duplicate byte storage.
- User cannot download when entitlement, device, territory, or storage rules fail.
- Admin can disable a track and the device revokes playback on next sync.

## Phase 2: Intelligence

- Smart downloads.
- Offline search.
- License refresh automation.
- Android Auto offline support.
- Better retry and repair flows.
- Expired-download cleanup jobs.

## Phase 3: Expansion

- Progressive caching as a polished product feature with smarter promotion and eviction.
- Cross-device synced download inventory.
- Offline lyrics.
- Offline podcasts.
- More advanced DRM provider integration.
- Per-territory catalog refresh.

## Implementation Modules

```text
services/downloads/
  entitlement.ts
  downloadManager.ts
  downloadQueue.ts
  licenseSync.ts
  storagePolicy.ts
  trackReferences.ts
  progressiveCache.ts

native/android/
  WorkManager workers
  Foreground download service
  encrypted file writer

native/ios/
  Background URLSession coordinator
  encrypted file writer
```

Module responsibilities:

- `entitlement.ts`: checks subscription, device limit, song cap, and territory rules.
- `downloadManager.ts`: public API used by UI and playback.
- `downloadQueue.ts`: local queue state and native bridge commands.
- `licenseSync.ts`: Firestore license refresh, revocation, expiry, and rights-version checks.
- `storagePolicy.ts`: free-space thresholds, cache eviction, and user storage summaries.
- `trackReferences.ts`: one physical track download, many playlist or album references.
- `progressiveCache.ts`: streaming cache segments that can be promoted to full downloads.

## Non-Goals

- Do not build full DRM provider integration in Phase 1 unless licensing requires it immediately.
- Do not sync byte-level progress across devices.
- Do not allow offline playback from progressive cache without a valid entitlement.
- Do not rely on the JS thread for reliable background transfer completion.

## Open Decisions

- Final encrypted container format and key management provider.
- Exact local database library.
- Whether Phase 1 ships full-file encryption first or starts directly with segmented chunks.
- License grace period length after failed sync.
- Admin dashboard implementation timeline for rights metadata.
