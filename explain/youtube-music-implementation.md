# YouTube Music implementation

## Current shared implementation — 7 October 2026

The main app now lazily loads `src/services/youtube/SharedYouTubeTransport.ts` through `YouTubeMusic.ts`. Both Android and iOS use the same TypeScript catalog/extraction service (`youtubei.js` 18.1.0 with Jinter for Hermes player transforms). It does not call the older Kotlin/Swift extractor bridges. Those sources/plugins remain in the repository/build configuration for reference; they are not a runtime fallback.

Current call flow:

1. Search selects an explicit provider. YouTube `searchYouTubeMusic` calls filtered `music.search` for songs/playlists and produces provider-qualified IDs. The provider is available on Android/iOS including Expo Go. Web extraction is unsupported.
2. Playlist `loadYouTubePlaylist` calls `music.getPlaylist`, then `getContinuation`. Continuations are bounded, expire, belong to their playlist, and repeated cursors fail. Only a complete result reaches the existing playlist cache. Related/autoplay uses YouTube `music.getUpNext(videoId, true)`.
3. Playback requests the exact video via `getBasicInfo`, selects an audio-only AAC format, deciphers it with the session player, and carries matching client headers plus the playback nonce. Profiles are VISIONOS, ANDROID_VR, IOS, WEB; these are alternatives within the same YouTube video. There is no JioSaavn song matching or fallback.
4. An unrestricted HEAD request checks availability without downloading the song first. Tiny ranged GET success is insufficient: earlier live testing found ranged success with full-playback 403. The new HEAD path has automated coverage; current upstream sign-in restrictions prevent its live CDN confirmation in this follow-up.
5. The descriptor cache requires two minutes of remaining validity and the requested quality. Requests coalesce by song/quality. Rejected and superseded responses cannot refill the active cache; an older quality cannot overwrite newer metadata. Timeouts/cancellation stop further transport stages and suppress late results. Existing library API requests have per-fetch timeouts; cancellation cannot immediately abort every library-owned fetch.
6. `PlayerPlaybackResolver` passes descriptor headers/expiry/quality to the existing player. Native builds retain `StandardAudioPlayer`, its audio graph, interruption handling and remote media controls. Expo Go uses `ExpoAvAdapter` (expo-audio). Resuming after expiry reloads at the saved position. Expo recovery/quality reload waits for readiness and seeks **before** play, observes the latest pause intent, and cancels outgoing waits.
7. Recovery rejects the failed profile for a minute and retries the same song once per minute, preserving position. Failure stops with a retry state rather than consuming the queue or changing providers. Standby prefetch carries resolved headers; pending standby work cannot recreate a player after destroy. Finished Expo audio can be replayed from zero. A new play clears stale error state and stale requests cannot overwrite persisted position.

Background configuration explicitly enables expo-audio background playback. The existing audio-session, Android notification service and iOS audio background mode remain responsible for platform behavior. Lock-screen metadata includes title/artist/artwork/duration. See [Expo's background playback requirements](https://docs.expo.dev/versions/latest/sdk/audio/). A successful JS export is not a physical-device background certification.

### Current verification and release status

- Repository regression suite: **79 passed, 0 failed**. Covers native media controls/interruption intent, queues/progress, quality races, YouTube provider separation, expiry/cancellation, playlist continuations, Expo seek-before-play, headers, standby teardown and HEAD/client-rejection logic. A quality change invalidates the cache without blacklisting a healthy client. An iPhone Expo Go import check proves the custom JSI module is not evaluated during player import.
- Main-app TypeScript check: passed. Focused ESLint: no errors; two existing effect-dependency/disable warnings remain in `audioSyncListeners.ts`.
- Main-app Android and iOS Hermes exports: passed (3,727 Android modules; 3,471 iOS modules in the final export).
- Shared live catalog check: 20 songs, 20 playlists; first playlist 14 songs. Majboor (Unplugged) resolves to `dLAYG-TjnVQ`.
- **Current live playback is blocked:** player endpoints return “Sign in to confirm you’re not a bot” on this connection for all four clients. The earlier standalone prototype now returns the same restriction. No claim is made that the current main-app shared implementation plays this song live or achieves zero startup delay.
- The previous prototype's Android Expo Go AAC playback, seek and pause passed before this restriction. That result is historical and does not certify this main-app change. Actual iPhone execution, long background playback, remote commands, interruptions and stream-expiry recovery remain unverified.
- LastWave's Android-only implementation additionally has Media3/disk caching, wake/Wi-Fi locks, casting, lossless upgrades and other features. This change adopts its relevant exact-video, descriptor, stale-request and position-preserving recovery rules; it is not feature parity with every LastWave subsystem.

This is **not yet production-certified**. Release requires live main-app playback/seek/pause/resume tests once the upstream restriction clears, plus physical Android/iPhone background, lock-screen/Bluetooth controls, interruption and expired-stream checks. Private/removed/region-restricted or login-required content may remain unavailable.

Reproduce the live check without exposing signed media URLs:

```powershell
node scripts/youtube-shared.probe.mjs "Majboor unplugged" dLAYG-TjnVQ
npm test
npm run typecheck
```

For the main app's free foreground Expo Go check, run `npm run start:expo-go -- --tunnel`, open its QR/link in iPhone Expo Go, and select YouTube Music in Search. The script now explicitly selects Expo Go instead of accidentally generating a development-client link. This does not remove the current upstream playback restriction or certify standalone background playback.

## YouTube Music on Home

Home now has separate YouTube Music rows in All and a dedicated YouTube Music category, using the existing horizontal card layout. Songs play through the existing resolver with a YouTube-only queue; playlists open the existing YouTube playlist detail flow.

`SharedYouTubeTransport.home` calls `music.getHomeFeed`, accepts actual song/video endpoints and playlist cards, and excludes albums/artists. `YouTubeHomeRecommendations` follows LastWave's home/radio approach: prioritize related songs from at most two recent YouTube songs, deduplicate, exclude recently heard seeds, and spread artists before filling remaining slots. When anonymous home exposes only mixes, sample up to six songs from each of two playlist first pages. No playlist continuation or audio extraction runs during home loading. This uses local listening history and anonymous discovery; it does not claim recommendations from a signed-in YouTube account.

`useYouTubeHomeFeed` keeps its query/cache separate from JioSaavn and keys it by app account, account generation and YouTube history. It refreshes history on screen focus/foreground, refetches stale data, supports reconnect/pull refresh and exposes a retry state. Partial source failures preserve available YouTube content; total failure stays retryable and does not substitute JioSaavn songs.

Live check: `node scripts/youtube-shared.probe.mjs --home` returned 20 playlists, zero direct anonymous home songs, and 100 songs on the first mix page. This checks catalog availability, not physical-device playback.

## Artwork and browsing performance

The installed YouTube parser sorts thumbnail arrays **largest first**. The old `.at(-1)` selection picked the smallest image in search, home, playlists and radio. `YouTubeArtwork.bestYouTubeThumbnail` now chooses by actual dimensions without assuming order. Google artwork transformations request up to 1200 pixels, preserving crop flags and query strings. `getBestImageUrl` also ranks labeled/URL dimensions using the same units; home playlist cards use this ranking instead of assuming array order.

`MusicArtwork` is shared by song rows, home cards/recent/quick picks, playlist hero/search cards, player artwork/queue and Android/iOS mini players. It requests density-aware image sizes (192/512/768/1200), uses native memory/disk caching and downsampling, and keeps failure state per image. Large video surfaces try the video master and fall back to the reported image if unavailable, including the 120×90 placeholder case. Guessed video master URLs are not persisted as canonical metadata. It never matches artwork from another music catalog. Live checks retrieved a 1200×1200 playlist cover and a 1280×720 song thumbnail; actual availability still depends on the source upload.

Catalog requests initialize without retrieving/parsing the YouTube player. Playback lazily prepares a single shared player; concurrent requests coalesce that preparation. Search no longer starts two unsolicited extractions. Active playback prefetches the next YouTube track, while the second-ahead YouTube extraction is skipped. Anonymous home metadata/mix previews have bounded caches and explicit refresh invalidation; preview continuation objects are discarded immediately.

Playlist detail can show the first page before remaining pages complete. A loading footer identifies remaining work, and continuation failure preserves visible songs with a retry action. Only a complete load enters the playlist cache. Playback started during loading uses the currently displayed queue snapshot. The incorrect 68px list geometry for 64px rows was removed; smaller render batches avoid mounting as many rows at once. Public YouTube playlists no longer expose local edit/remove actions.

Validation: 96 regression tests, TypeScript and focused lint; live catalog/image checks. Android/iOS bundle checks verify packaging, not device frame rates or physical iPhone playback. Reproduce catalog/artwork checks with `node scripts/youtube-shared.probe.mjs --home --artwork`.

## Historical native implementation — superseded at runtime

The remaining sections record earlier native builds and checks. Their native-module requirement and validation numbers describe that earlier version, not the shared implementation above.

Implemented 7 October 2026, following the LastWave source review. Existing karaoke, lyrics, and audio changes in the workspace were preserved.

Earlier TypeScript feasibility prototype: [Expo Go instructions and historical playback results](../prototypes/youtube-expo-go/README.md). Its original Android check passed before the current upstream sign-in restriction. The main app now has its own shared transport described above; the prototype remains a separate test harness.

## Behavior

- Search has separate **JioSaavn** and **YouTube Music** choices. YouTube has All, Songs, and Playlists filters. Selecting a provider cancels old search work and clears its results.
- Search results, suggestions, and recent searches use the measured header height so the two selector rows do not obscure content.
- YouTube songs use `youtube_<videoId>` IDs; playlists use `youtube_playlist_<playlistId>`. They retain their own metadata and provider identity. No title matching, JioSaavn conversion, or cross-provider playback fallback is used.
- YouTube playlist detail loads continuation pages and only caches a complete successful result. Cancelled or failed pages do not become a partial saved playlist.
- Playback resolves fresh audio URLs locally through platform-specific Android and iOS bridges. Signed URLs, HTTP headers, codec, bitrate, and expiry remain together. Requests coalesce; expired streams are refreshed. Search prefetches two songs, and the player prepares nearby queue entries rather than resolving an entire playlist.
- Playback failure evicts the failed YouTube descriptor and retries that song once in a 60-second window. InnerTubeX and NewPipe are extraction alternatives within YouTube only. Failure never invokes JioSaavn.
- YouTube autoplay requests YouTube related songs. JioSaavn artist lookup is skipped for YouTube tracks.
- Playback and quality changes reject stale selection results and preserve the user's most recent pause intent.

## Main code

| Responsibility | Files / entry points |
| --- | --- |
| Native setup | `plugins/withYouTubeMusic.js`, `app.json`, Android package registration |
| iOS setup | `plugins/withYouTubeMusicIOS.js`: native source registration and pinned YouTubeKit Swift package linking |
| iOS catalog / extraction bridge | `plugins/youtube-music/ios/MavrixfyYouTube.swift`, Objective-C export shim `MavrixfyYouTubeBridge.m` |
| Catalog / playlists / extraction bridge | `plugins/youtube-music/MavrixfyYouTubeModule.kt`: `search`, `playlist`, `resolveStream`, `related`, `cancel`, `rejectStream` |
| LastWave extraction adapters | `InnerTubeXStreamExtractor.kt`, `YouTubeStreamExtractor.kt`, `YouTubeAudioStream.kt` |
| Independent JS provider | `src/services/youtube/YouTubeMusic.ts`: `searchYouTubeMusic`, `loadYouTubePlaylist`, `resolveYouTubeStream` |
| Search UI and routing | `SearchScreen.tsx`, `useSearchEngine.ts` |
| Playlist routing | `usePlaylistDetailParams.ts`, `usePlaylistDetailData.ts` |
| Player stream dispatch | `PlayerPlaybackResolver.ts`, `usePlayerCoreState.ts`, `StandardAudioPlayer.tsx`, `ExpoAvAdapter.ts` |
| Queue / quality / recovery | `audioNativeQueueLane.ts`, `audioQualityControl.ts`, `audioSyncListeners.ts` |
| Related songs | `smartAutoplayService.ts`, `useArtistDiscovery.ts` |

The plugin regenerates native source files and dependency setup during Expo prebuild. Make native edits in `plugins/youtube-music/`, then synchronize/prebuild Android. LastWave attribution and GPL source license are included beside the adapters.

## Build and validation

This feature requires new Android and iOS native builds; an OTA update alone cannot install the module. The Expo runtime is `3.3.0-33002-youtube1`. The YouTube selector is shown on either platform when its native module is present. Android uses NewPipe/InnerTubeX; iOS uses local YouTubeKit extraction and its own anonymous YouTube Music catalog requests. Both share the provider-qualified IDs, queue, stream cache and playback routing. Neither falls back to JioSaavn.

iOS uses the existing deployment target of 16.4, playback audio-session category, and audio background mode. Extraction selects native-compatible AAC/M4A only. Swift Package Manager resolves YouTubeKit at the pinned revision and includes its JavaScript extraction resources. The bridge exports the same six native methods as Android. New iOS native code needs verification by Apple tooling; TypeScript tests alone do not prove iOS playback.

The build uses compile SDK 37, with the existing target SDK retained. InnerTubeX is invoked through its LastWave reflection adapter so its newer Kotlin runtime metadata does not enter the app's Kotlin 2.1 compile classpath.

- TypeScript typecheck: passed.
- Focused lint: passed.
- Focused playback, quality, queue, streaming, and YouTube regression tests: 46 tests passed, including iOS provider routing, renderer headers and unsupported/missing-native handling.
- Android debug and instrumentation APK builds: passed for the x86_64 emulator.
- Full repository suite (latest follow-up): **63 passed, 0 failed**. Fixed background player/equalizer work, background progress subscriptions, small-screen touch targets and native suspension races. Added bounded queue rendering and cancellable video drift polling, connected to the actual player components. These automated checks do not certify every live YouTube stream.
- Reported “Majboor unplugged” follow-up: Android debug/test APK compilation passed. The emulator installation succeeded, but the instrumentation did not reach a usable search/playback report and was stopped. The song remains unverified; an exact YouTube link/video ID and testing platform are needed to reproduce the user's selection. No stream-extraction fix is claimed from this attempt.
- Live Android native probe: **passed**. Search returned 20 songs and 20 playlists; the first playlist returned 11 tracks. Stream resolution took 7,923 ms. Audio advanced to 1,507 ms and reached 10,852 ms after a seek to 10 seconds. The probe used the native bridge and Android MediaPlayer, not the React Native audio renderer.
- React Native Android bundle: built and app launched. Provider/filter controls and the measured header layout were inspected. A complete physical-device playback/background run remains a release check; the development server reloaded during the final screen test.

Validation logs are retained locally under `outputs/youtube-integration/` (ignored by Git). Temporary emulator DNS settings and the test Metro server were cleaned up after validation.

## iOS verification

- Xcode Swift package references write/parse successfully and are idempotent on an Expo SDK 57 native project template. Native Swift and Objective-C sources are registered in the app's Sources phase.
- The exact catalog request configuration used by iOS returned HTTP 200 with 20 song renderers and 32 playlist renderers for “Arijit Singh” from this machine. This verifies the request shape, not the iOS URLSession runtime or decoder.
- Windows Expo CLI explicitly refuses iOS prebuild. The Apple cloud simulator build with the existing `ios-simulator` EAS profile **finished successfully**: [build logs and simulator artifact](https://expo.dev/accounts/satvik1234/projects/mavrixfy/builds/6dd1b26b-7162-4a5b-b9d5-0d41df01ea05). It compiled the Objective-C bridge, Swift app/module and linked YouTubeKit with its extraction resources. This is a simulator build, not a signed iPhone IPA. The upstream Expo Doctor step reported dependency/config warnings but the native build completed successfully.
- The YouTubeKit license resource was added to the final plugin after that cloud snapshot; its Xcode resource registration was checked separately for idempotence. Native bridge/extraction sources are unchanged from the passing build.
- iPhone/simulator execution still needs to verify live playback, playlist continuations, stream expiry/retry, background playback, audio interruptions, and notification controls. Android's live probe and an iOS compile cannot certify these runtime behaviors on iOS.

On macOS, generate/install the iOS project and run it with `npm run ios`. From Windows, a cloud simulator build can be created with `npx eas-cli build --platform ios --profile ios-simulator`.

Run focused tests:

```powershell
node --test scripts/quality-change.regression.test.cjs scripts/streaming-quality.regression.test.cjs scripts/youtube-music.regression.test.cjs scripts/media-playback.regression.test.cjs scripts/queue-mutation.regression.test.cjs
```

The opt-in native probe searches songs and playlists, loads playlist tracks, resolves audio, then checks advancement and seeking. It uses live YouTube requests and needs an emulator/device with working networking:

```powershell
cd android
./gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest -PreactNativeArchitectures=x86_64
adb install -r -t app/build/outputs/apk/debug/app-debug.apk
adb install -r -t app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument --user 0 -w com.mavrixfy.app.test/com.mavrixfy.app.youtube.YouTubeSmokeRunner
```

For a reported song, pass `-e query 'Majboor unplugged'` inside a quoted adb shell command before the instrumentation component. Use `-e videoId VIDEO_ID` to resolve the exact selected video rather than the first search match. The report includes the tested video ID.

The native probe does not replace testing the React Native audio renderer on a physical device. Before shipping, exercise song and playlist taps, next/previous, quality changes, pause during resolution, rapid provider changes, lock-screen/background playback, and temporary network loss. This implementation does not claim sample-accurate gapless playback.
