# LastWave song flow and Mavrixfy integration plan

Current follow-up: the main app now uses a shared TypeScript YouTube transport on Android/iOS. The native recommendation below is historical. See [current flow, fixes and release blockers](youtube-music-implementation.md#current-shared-implementation--7-october-2026). Automated checks and both Hermes exports pass, but current live playback is blocked by YouTube requiring sign-in; actual iPhone/background verification remains pending.

Reviewed 7 October 2026. The review below records the original Android design. YouTube Music support now has Android and iOS native implementations. Android live playback/seek and an Apple iOS simulator build have passed; live iPhone playback still needs device verification. See [implementation and validation](youtube-music-implementation.md). This review uses the active `LastWave-Native/app` sources, not the duplicate project under `reference zip`. Existing uncommitted app changes were preserved.

## Recommendation

Add an independent YouTube Music provider and an Android native extraction module. Reuse Mavrixfy's player controls and audio engine initially, passing a complete stream descriptor through to playback. Keep JioSaavn search, metadata normalization, quality ladder, recommendations, and IDs separate. A shared player UI does not require merging song catalogs.

The original review was based on source inspection. Current build, test, and live playback results are recorded in the implementation notes linked above.

## 1. Exact LastWave methods to call

Main file: `LastWave-Native/app/src/main/java/com/lastwave/app/data/music/InnerTubeMusicApi.kt`.

- `searchSongs(query, limit = 30, prefetchStreams = true)` — line 1438. Returns metadata as `List<YouTubeMusicTrack>`, not playable audio. Uses the YouTube Music InnerTube `search` endpoint, first with a songs filter, then unfiltered if empty. Deduplicates by video ID and optionally prefetches the first two streams.
- `fetchSongDetails(videoId)` — line 1933. Metadata lookup for a known video ID.
- `resolveAudioStream(videoId)` — line 2033. The public playback stream entry point. Returns `YouTubeAudioStream`: URL, request headers, MIME type, codec, bitrate, expiry, duration, client profile, and auth scope.
- `peekCachedStream(videoId)` — line 2015. Returns a fresh cached descriptor or null.
- `prefetchStream(videoId)` — line 244. Starts opportunistic background resolution; foreground playback shares the pending request.
- `reportPlaybackFailure(videoId, rejectedStream)` — line 218. Rejects the actual failed client/descriptor, clears matching caches, and applies client cooldown.
- `invalidateCache(videoId)` — line 204. Clears stream, match, and pending request state.
- `fetchRelatedSongs(videoId, limit = 30, prefetchStreams = true)` — line 1479. Anonymous YouTube Music radio through `next`, using `RDAMVM<videoId>`.
- `fetchPlaylist(...)` — line 280; `searchPlaylists(...)` — line 1913; `searchArtists(...)` — line 1507; `searchAlbums(...)` — line 1510; `fetchArtistPage(...)` — line 1514; `fetchAlbumPage(...)` — line 1678. These form the related catalog browsing surface. Playlist results include `isComplete`; failed continuation pages must not become a cached complete playlist.
- `findBestMatch(...)` — line 2765. Matches title/artist to a video. Use only for explicitly requested YouTube metadata matching, never as an automatic replacement for a failed JioSaavn song.
- `resolveDownloadStream(videoId)` — line 2101. Download-only NewPipe path preferring Opus; not the primary playback method.

Actual UI playback entry points are in `playback/MusicPlayer.kt`:

- `play(track: PlayableTrack, sourceLabel = "LastWave", startRadio = true)` — line 1667. Plays one selected song and optionally starts its radio.
- `playQueue(tracks, startIndex = 0, sourceLabel = "LastWave", startShuffled = false)` — line 1696. Plays a supplied queue.

`ui/search/SearchViewModel.kt:146` builds `PlayableTrack` from the selected search result and calls these methods. `PlayableTrack` is defined at `MusicPlayer.kt:111`. Its `durationMs` uses milliseconds; search metadata uses seconds.

Illustrative Kotlin call shape, assuming the API and player have already been supplied by LastWave's dependency injection:

```kotlin
val songs = innerTube.searchSongs("Arijit Singh", prefetchStreams = false)
val selected = songs.firstOrNull() ?: return
musicPlayer.play(
    PlayableTrack(
        title = selected.title,
        artist = selected.artist,
        album = selected.album,
        artworkUrl = selected.artworkUrl,
        videoId = selected.videoId,
        durationMs = selected.durationSeconds?.toLong()?.times(1000L),
    ),
    sourceLabel = "YouTube Music",
    startRadio = false,
)
// For an extraction-only bridge, call innerTube.resolveAudioStream(videoId)
// and return its descriptor to Mavrixfy; do not instantiate MusicPlayer.
```

## 2. Actual resolution and playback chain

```text
Search result / known videoId
  -> PlayableTrack
  -> MusicPlayer.play / playQueue
  -> resolveTrackAudioStream
  -> resolveYoutubeTrackAudioStream
  -> fresh stream cache OR InnerTubeMusicApi.resolveAudioStream
  -> ResolvedStream, including headers / expiry / MIME / codec
  -> Media3 data source + ExoPlayer
```

The current `resolveAudioStreamInternal()` implementation at line 2172 runs:

1. Hedged direct URL fast path: VISIONOS, ANDROID_VR, TVHTML5. Per-client timeout 2.5 seconds, stage budget 4 seconds. It returns a direct candidate without a blocking byte probe; player opening is part of validation.
2. InnerTubeX stage through `InnerTubeXStreamExtractor.resolve(...)`, bounded to 4 seconds. It requests compatible direct/HLS transports and excludes SABR/segmented output from this player graph.
3. A race between direct InnerTube clients and NewPipe, with shared config, signature timestamp, and optional PO-token prerequisites.
4. A final bounded NewPipe fallback if earlier candidates fail and the overall budget permits it.

The whole public resolution is capped at 12 seconds. Stage timeouts are not additive promises. Cache entries use a four-hour maximum TTL plus a two-minute expiry safety margin. Pending requests are shared by video ID and auth scope. Failed clients have a 60-second cooldown.

Some comments call InnerTubeX the primary resolver, but the active implementation tries the direct fast path first. Likewise, the public method's byte-probe comment does not mean every candidate is probed before return.

`MusicPlayer.kt:5729` tries a known video ID directly, then can search for an alternative match twice if resolution fails. For Mavrixfy, preserve the selected YouTube video by default and offer an explicit alternative action instead of silently substituting another version. Never run this matching behavior on JioSaavn tracks.

`MusicPlayer.kt:924` uses a `ResolvingDataSource` and applies per-stream headers; line 990 applies `stream.requestHeaders`. Error handling reports rejected YouTube streams back to the resolver. Expiry checks, preload, retry, audio focus, queue restoration, and notifications contribute to reliability beyond URL extraction.

## 3. Related LastWave source map

All paths below are relative to `LastWave-Native/app/src/main` unless stated otherwise.

- `java/com/lastwave/app/data/music/InnerTubeMusicApi.kt`: catalog requests, response parsing, config bootstrap, stream cache, clients, matching, radio, playlist continuation.
- `.../data/music/InnerTubeXStreamExtractor.kt`: extraction compatibility adapter. Uses reflection because the pinned artifact has newer Kotlin metadata than the app. Returns only acceptable HTTPS audio/HLS output; carries headers and expiry.
- `.../data/music/YouTubeStreamExtractor.kt`: NewPipe initialization, downloader, audio format selection, signature deciphering, throttling parameter handling, player-script invalidation.
- `.../data/music/TextMatch.kt`: matching support.
- `.../data/music/potoken/BotGuardTokenGenerator.kt`, `ChallengeParser.kt`, and `assets/po_token.html`: Android WebView PO-token lifecycle. Requires initialization with application context, main-thread WebView work, cancellation and cleanup.
- `.../data/ytmusic/YtMusicAuthManager.kt`, `YtMusicPreferences.kt`: session/cookie and account state. `YtMusicLibraryManager.kt`, `YtMusicSyncManager.kt`, `YtMusicHistorySyncManager.kt`: optional account library/history sync. Anonymous search/playback is the recommended first scope.
- `.../data/search/SearchRepository.kt`, `.../ui/search/SearchViewModel.kt`: search model mapping and selected-song playback.
- `.../playback/MusicPlayer.kt`, `MusicPlaybackService.kt`, `AndroidAutoMediaLibrary.kt`: player, background media service, automotive library. These should not be copied wholesale into Mavrixfy alongside its existing audio owner.
- `.../playback/LinkPlaybackResolver.kt`: link handling. `cast/CastPlayback.kt` and `CastStreamServer.kt`: optional casting.
- `.../data/download/TrackDownloadManager.kt`, `WebmOpusRemuxer.kt`: stream resolution, HTTP headers, downloading, tagging, offline records and Opus remuxing.
- `.../data/lyrics/LyricsRepository.kt` and related lyric API classes: metadata-based lyric lookup; no need to copy this to enable song playback because Mavrixfy already has a lyrics service.
- `.../data/playlist/PlaylistRepository.kt`, `LikedSongsManager.kt`, `.../data/repository/SongPlayStatsRepository.kt`: playlist/likes/statistics persistence.
- `.../data/repository/HomeRepository.kt`, `ArtistRepository.kt`, `AlbumRepository.kt`; `.../data/discover/DiscoverRepository.kt`; `.../data/generate/GenerateRepository.kt`: discovery, recommendations and detail orchestration built on the catalog.
- `LastWave-Native/app/build.gradle.kts`, `gradle/libs.versions.toml`, `app/proguard-rules.pro`: dependency and release shrinking setup. Local pins include InnerTubeX 0.4.1, NewPipe v0.26.5, Media3 1.2.1 and Ktor CIO 3.5.2. These describe this checkout, not verified recommended latest versions.

## 4. Mavrixfy findings and precise changes required

### Existing song and catalog boundaries

`src/lib/musicData.ts:3` already has `source: "youtube"`, `videoId`, `youtubeVideoId`, `youtubeAudioExpiresAt`, and `playbackHeaders`. These fields do not implement YouTube playback by themselves.

`src/lib/searchRepository.ts:106` normalizes existing API results through `parseApiSong()`. It defaults source to JioSaavn and does not preserve YouTube IDs/expiry/headers. Add a separate `normalizeYouTubeTrack()` instead of feeding YouTube metadata through this parser.

`src/data/providers/MusicCatalogTypes.ts` still uses JioSaavn structures. Keep that path for its existing consumers. Introduce YouTube-specific album/playlist/artist models instead of pretending a YouTube browse ID is a JioSaavn ID.

`src/features/search/hooks/useSearchEngine.ts` currently calls `searchRepository(query, resultFilter, signal)`. Add a visible JioSaavn / YouTube Music selector and an independent YouTube repository. Include source in cache keys and request identity. Preserve the current abort and sequence checks when switching providers.

`src/lib/searchUtils.ts:289` deduplicates by a metadata fingerprint and preferentially retains JioSaavn over YouTube. Never run a combined result array through this function. YouTube results should deduplicate by video ID inside their own provider.

### Playback descriptors, expiry and headers

`src/services/audio/PlayerPlaybackResolver.ts` currently resolves local downloads, the quality ladder from `downloadUrl`, and direct audio candidates. There is no YouTube extraction branch. Website URLs are correctly rejected as audio URLs; a watch link is not a playable stream.

Add YouTube dispatch after valid local-file lookup and before JioSaavn quality selection. A YouTube resolution failure must terminate that provider branch with a useful error, not try JioSaavn or reuse an expired `audioUrl`.

`src/types/playbackTypes.ts` defines `ResolvedPlaybackResult` around URL and quality state. Extend it with a complete descriptor (headers, expiry, MIME/codec, actual bitrate, video ID, client profile, resolution ID). Do not mutate shared catalog `Song` objects to carry temporary resolver state.

`src/services/audio/usePlayerCoreState.ts:138` caches `Map<songId, string>` indefinitely until eviction. Replace the YouTube lane with descriptor caching, expiry validation and shared pending requests. Maintain the JioSaavn cache behavior. Quality and account/session changes must invalidate the applicable stream cache. Native cancellation must be connected to JS cancellation; a `Promise.race` timeout alone does not stop network work.

`PlayerPlaybackResolver.ts:117` puts `song.playbackHeaders` into track metadata, but `StandardAudioPlayer.tsx:764` passes only `current.url` to `<Audio>`. Its standby player also passes only a string. The installed `react-native-audio-api/src/Audio/types.ts:5` accepts `{ uri, headers }`. Carry headers through active and standby snapshots and pass an object source. Reload if the descriptor changes, even when its URL is unchanged. Update `ExpoAvAdapter.ts` and its standby preparation too.

Use the existing audio engine first; prove support for each chosen MIME/codec and seeking on actual devices. Restrict extraction to tested formats. HLS, Opus/WebM and segmented SABR must not be assumed to work because LastWave's Media3 player supports some of them. If a native Media3 backend is later needed, keep exactly one active playback engine and media session.

### Queue and errors

`audioPlaybackCommands.ts:203` imposes a 12-second JS resolution timeout and uses request IDs to reject stale taps. Retain those protections, while giving native resolution a compatible deadline and cancellation path.

`audioNativeQueueLane.ts:68` resolves all queue songs with `Promise.all`; this is unsuitable for eagerly extracting hundreds of expiring YouTube URLs. Start the selected track immediately, prefetch the next one or two, and resolve remaining tracks near playback.

The synchronized queue fast path in `audioPlaybackCommands.ts` can skip to an old URL even after a fresh resolution completed. Validate/replace the target descriptor before skip. Queue URL validity must include expiry, not just string length. Protect standby completion and metadata updates using queue generation plus target song ID.

`audioSyncListeners.ts:206` currently stops and shows an error on `PlaybackError`. Add a YouTube-specific bounded recovery: reject the failed resolution, invalidate it, re-resolve, and restore position plus the latest play/pause intent. Distinguish unavailable media from temporary network failure. Do not skip through a whole queue on a network outage.

### Radio, details, library and downloads

`smartAutoplayService.ts` currently calls existing `/api/songs/.../suggestions` and catalog search endpoints. Route YouTube seeds exclusively to `fetchRelatedSongs(videoId)`. Do not send a namespaced YouTube ID to the JioSaavn API.

`usePlaylistDetailParams.ts` hardcodes `isYouTubeSource = false`; artist/search navigation also carries `youtube: "false"`. Add explicit provider routing and independent detail loaders. These remnants are not a functioning YouTube provider.

`BackgroundYoutubeVideo.tsx` and `useBackgroundVisualVideo.ts` are visual-video functionality, not the audio resolver. Keep them independent of provider identity: a JioSaavn track showing a YouTube background remains JioSaavn.

`services/liked-songs/likedSongsRepository.ts` already retains source and video IDs in cached liked-song metadata. Preserve these through Firestore, history, playlists, offline records and restore. Re-resolve streams on restore instead of treating persisted signed URLs as durable.

`lib/downloads/downloadManager.ts` uses rights/offline-license checks and the existing resolver. `downloadQueue.ts:255` starts downloads with empty options, so required stream headers are not carried. Treat YouTube downloads as a separate later stage with their own eligibility, expiry retry, MIME-derived extension, headers and source-qualified records. Never reuse JioSaavn ID-based renewal for them. Playback work should not bypass existing download checks.

## 5. Proposed integration contract

New files (proposed, not implemented):

```text
src/services/youtube/YouTubeNative.ts          typed native wrapper + capability check
src/services/youtube/YouTubeRepository.ts      search / details / radio / pagination
src/services/youtube/YouTubeNormalizer.ts      metadata -> Song; no JioSaavn conversion
src/services/youtube/YouTubeStreamResolver.ts  descriptors / freshness / pending calls
modules/mavrixfy-youtube/                     local Expo Android module + Kotlin services
```

Prefer a local autolinked Expo module so prebuild does not erase hand-edited native registration. Match the installed RN/Expo/Kotlin toolchain before selecting dependencies. Use typed InnerTubeX APIs if the chosen version is compatible; reflection should be a narrowly tested compatibility measure, not a default design.

Suggested bridge surface: `searchSongs(query, limit, requestId)`, `getSongDetails(videoId, requestId)`, `resolveStream(videoId, quality, requestId)`, `getRelatedSongs(videoId, limit, requestId)`, `getPlaylist(browseId, continuation, requestId)`, `reportPlaybackFailure(resolutionId)`, and `cancel(requestId)`.

Native code should retain the rejected descriptor by resolution ID to report the exact failed client. Run network/extraction on IO; token WebView operations on Android's main thread. Start anonymous. Do not return cookies or token internals to JS or logs.

Song identity: preserve existing JioSaavn IDs; use `youtube_<videoId>` for new YouTube songs, matching the current download code's namespace convention. Set `source: "youtube"`, keep the raw ID in `youtubeVideoId`, set `audioUrl: ""` until resolution, omit `downloadUrl`, and store duration in seconds.

Display actual extracted bitrate/codec. Never label YouTube audio as 320kbps from the JioSaavn quality defaults. A shared low/medium/high preference can be mapped independently by each provider.

Provider isolation rules: separate search results/caches, detail loaders, radio, stream resolution and download renewal; no automatic cross-provider song replacement, no fingerprint merge, no mixed automatic queues. Shared player controls and source-qualified library records are acceptable. If a queue supports explicit user mixing later, it must be a deliberate UI action.

The first bridge is Android-only. Gate YouTube capability on iOS/web until a separately implemented and tested backend exists; do not silently substitute JioSaavn. A server resolver is not the default recommendation because extraction and media requests may depend on the same client/session/IP context.

## 6. Implementation stages and acceptance checks

1. **Native proof:** anonymous search and extraction, descriptor mapping, supported-format filtering, cancellation, timeout, release shrinking checks. Reuse only the needed catalog/extractor pieces and their dependencies.
2. **Separate search:** provider selector, YouTube normalization, source-aware cache identity, explicit unsupported-platform state. Search the same title in both providers and verify results remain separate.
3. **Playback:** descriptor cache, active/standby headers, truthful quality, expiry validation, selected-track-first resolution, stale queue protection, bounded recovery. Test rapid A/B taps, pause during resolution, seek, quality change, expired URLs, rejected clients, unavailable media and long queues.
4. **Background and restore:** actual Android device background playback, lockscreen next/previous, audio focus, headset interruption, process restart and offline local-file preference. Verify exactly one player/session owns audio.
5. **Catalog/library:** YouTube radio, playlists with continuation/completeness, albums/artists and source-preserving likes/history. Verify YouTube radio never calls JioSaavn suggestions. Keep cross-provider automatic deduplication disabled.
6. **Downloads later:** independent eligibility and download handling, headers, expiry renewal, cancellation, offline playback and real format validation.

Measure cold/warm tap-to-audio latency and transition stalls on a real device under Wi-Fi and cellular. Do not declare smooth playback from cache-hit timing alone. Repeat JioSaavn search, quality changes, next/previous, autoplay, likes, downloads and restore as regression checks.

## Dependency reuse note and upstream context

The local LastWave license is GPLv3. Before distributing copied code or linked extractor dependencies, determine their compatibility with Mavrixfy's distribution model; this plan does not make that determination.

Upstream InnerTubeX documents extraction, transport capabilities, host-owned playback/token integration and experimental API versioning. Its current README shows a newer API/version than this checkout; pin and test the selected version rather than copying current README calls into the older reflective adapter. Source: [InnerTubeX official repository](https://github.com/MetrolistGroup/innertubex). The installed audio library's object-source support was verified directly in local dependency source; the public [React Native Audio API documentation](https://docs.swmansion.com/react-native-audio-api/) is the broader reference.
