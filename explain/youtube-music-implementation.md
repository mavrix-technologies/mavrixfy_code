# YouTube Music implementation

Implemented 7 October 2026, following the LastWave source review. Existing karaoke, lyrics, and audio changes in the workspace were preserved.

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
