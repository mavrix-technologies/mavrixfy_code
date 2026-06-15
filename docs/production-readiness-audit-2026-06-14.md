# Mavrixfy Production Readiness Audit

## Final Official Scan - 2026-06-15

This section is the final scan pass run against the current workspace and rebuilt Android release APK. It uses official Expo, React Native, and Android Vitals guidance as the checklist baseline.

Official references used:

- Expo environment variables: `EXPO_PUBLIC_` values are inlined into the client bundle, private values must not be placed there, and the documented client-env disable flag is `EXPO_NO_CLIENT_ENV_VARS=1`: https://docs.expo.dev/guides/environment-variables/
- Expo / EAS app credentials: Android store distribution requires a properly signed app; EAS can manage credentials, or local credentials must be provided safely: https://docs.expo.dev/app-signing/app-credentials/
- React Native performance: test performance in release mode and keep expensive logging/debug behavior out of production paths: https://reactnative.dev/docs/performance
- React Native security: do not embed sensitive API keys/secrets in app code; AsyncStorage is not for tokens/secrets; use a backend orchestration layer for secret-bearing APIs: https://reactnative.dev/docs/security
- Android Vitals startup/render/crash baselines: cold startup >= 5s is excessive, frozen frames are > 700ms, and crash rates should be monitored through Play Console / logcat: https://developer.android.com/topic/performance/vitals/launch-time, https://developer.android.com/topic/performance/vitals/render, https://developer.android.com/topic/performance/vitals/crash

### Changes Applied During This Final Pass

- Corrected `eas.json` profiles from the non-official `EXPO_NO_CLIENT_SIDE_ENV` name to Expo's documented `EXPO_NO_CLIENT_ENV_VARS`.
- Moved remaining production-path console output to the existing dev-only logger in `app/_layout.tsx`, `app/(tabs)/index.tsx`, `app/player.tsx`, `app/import-songs-file.tsx`, `components/AdMobBanner.tsx`, `components/AdMobNativeVideo.tsx`, `lib/api-config.ts`, `lib/autoMediaRemoteService.ts`, `lib/googleMobileAds.ts`, and `lib/youtube-music-config.ts`.
- Redacted foreground notification logging to an identifier instead of logging the full notification payload.
- Removed `react-native-image-colors` and its vulnerable `file-type` transitive chain; player gradients now use the existing `expo-image` thumbhash path plus stable fallbacks.
- Moved rounded native-ad styling to wrapper views in the reusable AdMob components so `NativeAdView` no longer receives unsupported `borderRadius` props there.
- Added the official `react-native-google-mobile-ads` Expo config plugin in `app.config.js` while retaining the root `app.json` ad block required by the checked-in Android native build.
- Rebuilt `android/app/build/outputs/apk/release/app-release.apk` after the cleanup.

### Command Results

| Check | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit --pretty false` | Pass | No TypeScript errors. |
| `npx expo lint` | Pass | No lint output. |
| `npx expo-doctor` | Fail: 17/18 pass | Fails the expected native app-config drift check because `android/` and `ios/` exist while `app.json` still owns native config fields. |
| `npm audit --omit=dev --audit-level=moderate` | Fail | 17 moderate transitive advisories remain in Expo config/prebuild tooling through `uuid`. The `react-native-image-colors` / `file-type` chain was removed. npm's remaining suggested fix is breaking, so do not run `npm audit fix --force` blindly. |
| `./gradlew.bat :app:assembleRelease` without signing props | Fail as intended | The production release task refuses to package without `MAVRIXFY_UPLOAD_*` signing values. |
| `./gradlew.bat :app:assembleRelease` with local debug-keystore props | Pass | Release APK rebuilt successfully with R8/minify/resource shrinking enabled for local smoke use. |
| `aapt dump badging` | Pass | `versionCode=20601`, `versionName=2.6.0`, `minSdk=24`, `targetSdk=35`, native code `arm64-v8a` and `armeabi-v7a`. |
| `apksigner verify --verbose --print-certs` | Pass but not store-ready | APK verifies with APK Signature Scheme v2 and one signer, but it is signed by the Android debug certificate because real upload signing properties were not provided. |

### Runtime Device Results

Device: Android emulator `emulator-5556` with installed `com.mavrixfy.app` version `2.6.0` / `20601`.

- Cold launch via `adb shell am start -W`: `TotalTime=2704ms`, below Android Vitals' 5s excessive cold-start threshold.
- Playback tap smoke test: app process stayed alive; filtered logcat showed no `AndroidRuntime`, `ReactNativeJS`, `Expo`, or `TrackPlayer` fatal crash output.
- `dumpsys gfxinfo` after launch/play: about `14%` janky frames in the sampled window; 50th percentile frame time around `18-23ms`, 90th around `29-46ms`, 95th around `57-97ms`.
- `dumpsys meminfo`: around `353 MB` total PSS after launch/play, with `4` WebViews active and about `49 MB` malloced bitmap memory.
- After the dependency cleanup, an x86_64 release-like build was installed on the emulator and cold-launched in `2031ms` with no sampled app fatal crash. The standard ARM-only APK is not a valid emulator smoke target on this x86_64 device; when installed there, it crashes with missing `libreactnative.so` because of ABI mismatch.
- Expo Updates still logged a nonfatal remote update download failure during the emulator smoke run and fell back to the embedded bundle.

Interpretation: crash stability looks good for this smoke pass, startup is acceptable on this emulator, but UI smoothness and memory should still be tested on a low-end physical Android device because the sampled jank is above a comfortable target for a music app's main surfaces.

### API and Network Results

Production API smoke checks:

- `https://mavrixfy-api-drab.vercel.app/api/youtube-music/search?query=arijit&filter=songs&limit=2`: HTTP 200, JSON keys `success,source,results`, about `5.8s`.
- `https://mavrixfy-api-drab.vercel.app/api/youtube-music/search/suggestions?query=arijit`: HTTP 200, JSON keys `success,suggestions`, about `0.4s`.
- `https://mavrixfy-song-api.vercel.app/api/search/songs?query=arijit&limit=2`: HTTP 200, JSON keys `success,data`, about `0.6s`.
- `https://mavrixfy-song-api.vercel.app/api/search/playlists?query=trending&limit=2&page=1`: HTTP 200, JSON keys `success,data`, about `0.8s`.

Architecture conclusion: production app calls should continue to use the backend proxy for YouTube Music, currently `https://mavrixfy-api-drab.vercel.app/api/youtube-music`. The standalone YouTube service should remain backend-to-backend, not a direct production client URL.

### Security and Leak Scan

- Client env/config scan found only public client-side Firebase/Google API config variables in `.env*`, `app.json`, and `google-services.json`.
- No private key, service-account, database URL, Stripe secret, GitHub token, or similar server-secret pattern was found by the local scan.
- Important: Firebase/Google API keys are still visible to anyone inspecting the app bundle because they are client config. Keep Firebase rules strict and restrict API keys in Google Cloud/Firebase console.
- Firestore rules remain owner/admin scoped for user data and public-read only for public catalog/promotions, with a deny-all fallback.
- Android manifest has `allowBackup="false"` and `usesCleartextTraffic="false"`.
- Stale Android Auto service metadata is no longer present in the release manifest path checked by the build.

### Remaining Release Blockers

1. Real Play Store signing is not configured locally. The rebuilt APK is release-variant but debug-certificate signed. Configure `MAVRIXFY_UPLOAD_STORE_FILE`, `MAVRIXFY_UPLOAD_STORE_PASSWORD`, `MAVRIXFY_UPLOAD_KEY_ALIAS`, and `MAVRIXFY_UPLOAD_KEY_PASSWORD`, or use EAS-managed credentials.
2. `expo-doctor` still reports native config drift. Since native folders are checked in, every relevant `app.json` native config change must be synced into `android/` and `ios/`, or the project should return to a clean CNG/prebuild flow.
3. Moderate transitive dependency advisories remain. Fix plan should be an Expo SDK/dependency upgrade plan, not forced npm audit rewrites.
4. Runtime observability is incomplete. Firebase Analytics exists, but no Sentry/Crashlytics-style crash reporting package was found. Add crash/error reporting before real production rollout.
5. Render smoothness needs physical-device profiling. The emulator smoke test showed around `14%` janky frames and `353 MB` PSS after launch/play.
6. The release build still prints Expo config warnings about root-level Expo config and `react-native-google-mobile-ads`. Removing that root block is not safe while the checked-in Android build depends on it to generate Google Mobile Ads BuildConfig values, so clean this only as part of a CNG/prebuild migration or a native Gradle replacement.

Date: 2026-06-14  
Project: React Native / Expo music streaming app  
Audit mode: static code audit plus local verification commands

## Measurement Notes

I could not produce trustworthy cold start, warm start, FPS, or RAM numbers without a profiled release build on a physical low-end Android device. The scores below are risk scores based on the actual source, dependency tree, build config, and generated debug APK present in the repository.

Local verification run:

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npx expo-doctor`: failed 1 check. Native folders exist, so several `app.json` fields will not automatically sync to Android/iOS native projects.
- `npm audit --omit=dev --json`: 27 production vulnerabilities: 1 critical, 1 high, 25 moderate.
- `npm outdated --depth=0`: current project is on Expo SDK 54, while npm reports Expo 56.0.11 as latest.
- Existing debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`, 155,669,743 bytes. No release AAB/APK size was found from the audit commands.

## Implementation Status

An implementation pass was applied after this audit on 2026-06-14.

Fixed or improved:

- Release builds no longer use the debug signing config.
- Android app backup is disabled.
- Release APK architecture defaults are ARM-only.
- Dev client network inspector is disabled by default.
- Home and playlist detail use virtualized outer lists instead of eager vertical `ScrollView` rendering.
- Player queue rows are virtualized.
- `SongRow` no longer builds O(n) queue signatures during memo comparison.
- Search restores YouTube results from cache, stages YouTube enrichment after primary results, and cancels autocomplete/search requests with `AbortSignal`.
- YouTube Music endpoint probing is sequential and abortable instead of full `Promise.all` fan-out.
- High-risk production logs for push tokens, notification payloads, media URL previews, and search diagnostics were moved to the dev-only logger or redacted.
- Native player setup is deferred until playback instead of being eagerly initialized at startup.
- Android queue blur was replaced with a solid surface fallback in the player screen.
- Direct `expo-file-system` and `@react-navigation/native` dependency declarations were corrected; unsafe critical/high transitive audit issues were patched with npm overrides.

Remaining:

- `npx expo-doctor` still reports native app-config ownership drift because `android/` and `ios/` exist while `app.json` still contains native config fields.
- `npm audit --omit=dev --audit-level=high` now passes, but the full audit still reports moderate Expo config/prebuild issues that require an Expo SDK upgrade plan.
- A real release build and low-end Android profiling pass are still required to measure cold start, RAM, FPS, and APK/AAB size.

## A. Executive Summary

Mavrixfy now has a stronger production baseline than the initial audit: Hermes/new architecture are enabled, R8/resource shrinking are active, hot list screens have been virtualized, search and YouTube requests are more abortable, high-risk logs are routed through the dev-only logger, Android backup is disabled, and TypeScript/lint pass.

The remaining production risks are now narrower:

- Local release builds still need real Play upload signing credentials; the current local APK was built with debug-keystore properties for testing.
- `expo-doctor` still reports native app-config drift because native folders are checked in while `app.json` still owns native configuration.
- Runtime observability is not release-grade yet because no Crashlytics/Sentry-style crash reporter was found.
- Physical low-end Android profiling is still required; emulator smoke testing showed about `14%` janky frames and about `353 MB` PSS after launch/play.
- Moderate transitive audit advisories remain in Expo's config/prebuild stack and should be handled through an Expo/dependency upgrade plan, not a forced audit rewrite.

The app is no longer in the "major hot-path cleanup required" state from the first audit, but it is not Play-production perfect until signing, observability, dependency advisories, and physical-device performance are closed.

## B-J. Scores

| Area | Score | Reason |
| --- | ---: | --- |
| B. Overall Performance | 79/100 | Hot screens are now more virtualized, request fan-out is reduced, and a native palette dependency was removed; emulator profiling still showed measurable jank, so physical-device profiling remains required. |
| C. Startup | 79/100 | Hermes/new architecture are enabled, cold launch measured `2704ms`, and native color extraction no longer loads; native config drift and notification/update startup work remain watch items. |
| D. Memory | 70/100 | Large list pressure and native palette overhead were reduced, but media playback still uses multiple WebViews and measured about `353 MB` PSS after launch/play. |
| E. UI | 74/100 | Home/player list rendering, Android blur pressure, and native-ad warning sources improved; sampled jank around `14%` means the UI still needs low-end-device tuning. |
| F. Network | 74/100 | Production proxy endpoints are healthy and YouTube calls are more abortable/sequential; first YouTube search smoke check was still slow at about `5.8s`. |
| G. Android | 76/100 | Hermes, R8, shrink, ARM ABIs, no-backup, no-cleartext, stale Android Auto cleanup, and the ad config plugin are in place; store signing and native config drift still block perfect readiness. |
| H. Security | 80/100 | No private server-secret patterns were found, Firestore rules are scoped, backup is disabled, production logs were redacted, and the `file-type` advisory chain was removed; client Firebase/Google keys must stay restricted. |
| I. Bundle Size | 70/100 | Release APK is verified at `70,343,216` bytes with ARM ABIs and shrink enabled, and one native palette dependency was removed; Play AAB size and deeper dependency slimming still need a separate pass. |
| J. Production Readiness | 73/100 | Build, typecheck, lint, API smoke tests, and crash smoke test pass; release signing, crash reporting, remaining moderate advisories, and physical-device performance remain before full production. |

### 95+ Target Gate

The current evidence does not support honest 95+ scores yet. To reach 95+ across B-J, close these release gates and then remeasure:

1. Build and verify the production AAB/APK with real Play upload signing or EAS-managed credentials.
2. Add Sentry, Firebase Crashlytics, or equivalent crash/error reporting and confirm release crashes arrive in the dashboard.
3. Resolve `expo-doctor` native config ownership by either migrating to CNG/prebuild or documenting and enforcing native-file ownership in CI.
4. Clear the remaining moderate audit advisories through a planned Expo SDK/dependency upgrade.
5. Capture physical low-end Android traces for cold/warm/hot start, Home/Search/Playlist/Player scroll, memory, and playback.
6. Re-run API smoke tests with latency budgets and backend logs to prove proxy stability under realistic traffic.

## K. Historical Critical Issues From Initial Audit

The detailed issue list below is retained from the original 2026-06-14 audit for traceability. For the current release verdict, use the "Final Official Scan - 2026-06-15" and the updated B-J scores above.

### 1. Release builds use debug signing

Severity: Critical  
Impact: APKs produced locally by release tasks are not production-signing safe. This can block Play distribution and creates a release process risk.  
Affected files:

- `android/app/build.gradle:100-118`

Root cause:

- `release` uses `signingConfig signingConfigs.debug` at `android/app/build.gradle:115`.

Exact fix:

```gradle
android {
    signingConfigs {
        release {
            storeFile file(System.getenv("MAVRIXFY_UPLOAD_STORE_FILE") ?: "mavrixfy-upload-key.jks")
            storePassword System.getenv("MAVRIXFY_UPLOAD_STORE_PASSWORD")
            keyAlias System.getenv("MAVRIXFY_UPLOAD_KEY_ALIAS")
            keyPassword System.getenv("MAVRIXFY_UPLOAD_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
            crunchPngs (findProperty("android.enablePngCrunchInReleaseBuilds")?.toBoolean() ?: true)
        }
    }
}
```

For EAS cloud builds, prefer EAS-managed credentials and remove local release secrets from the repo entirely.

### 2. Playlist detail screen renders every song at once

Severity: Critical  
Impact: Long playlists can cause long JS work, high memory, slow screen transitions, dropped frames, and possible low-end Android ANRs.  
Affected files:

- `app/playlist/[id].tsx:648-779`
- `app/playlist/[id].tsx:760-765`

Root cause:

- The main screen uses `ScrollView`.
- Songs are rendered with `songs.map`.
- Each row receives the full `songs` array as `queue`, which increases comparison and prop pressure.

Exact fix:

```tsx
const renderSong = useCallback(
  ({ item, index }: { item: Song; index: number }) => (
    <SongRow
      song={item}
      index={index}
      queue={songs}
      queueKey={playlistQueueKey}
      optionContext="playlist"
      playlistId={id}
      playlistSource={playlistSource}
      playlistName={playlist?.name}
    />
  ),
  [songs, playlistQueueKey, id, playlistSource, playlist?.name]
);

return (
  <FlatList
    data={songs}
    keyExtractor={(item, index) => `${item.id}-${index}`}
    renderItem={renderSong}
    ListHeaderComponent={playlistHeader}
    ListEmptyComponent={loading ? songSkeleton : emptyPlaylistState}
    initialNumToRender={10}
    maxToRenderPerBatch={8}
    updateCellsBatchingPeriod={40}
    windowSize={7}
    removeClippedSubviews={Platform.OS === "android"}
  />
);
```

If row height becomes fixed, add `getItemLayout` to make jumps and scroll restoration cheaper.

### 3. Home feed eagerly mounts all vertical sections

Severity: Critical  
Impact: Home is the first major screen and can mount every section, multiple nested horizontal lists, ads, images, and video in one vertical `ScrollView`. This is a startup, memory, and scroll-FPS risk.  
Affected files:

- `app/(tabs)/index.tsx:2523-2542`
- `app/(tabs)/index.tsx:2131-2445`
- `app/(tabs)/index.tsx:168`
- `app/(tabs)/index.tsx:940-971`

Root cause:

- The outer home container is `ScrollView`.
- It maps `sections.map(...)`, so all section components are created eagerly.
- `INITIAL_PUBLIC_LIMIT = 100` fetches and prepares more playlist content than the first viewport needs.

Exact fix:

```tsx
const renderHomeSection = useCallback(
  ({ item, index }: { item: HomeSection; index: number }) => (
    <>
      {getSectionElement({ item })}
      {index === 0 ? <AdMobBanner /> : null}
    </>
  ),
  [getSectionElement]
);

return (
  <FlatList
    data={sections}
    keyExtractor={(section) => section.id}
    renderItem={renderHomeSection}
    ListHeaderComponent={homeHeader}
    ListEmptyComponent={isLoading ? homeSkeleton : emptyHomeState}
    refreshControl={refreshControl}
    onScroll={handleHomeScrollEvent}
    scrollEventThrottle={16}
    initialNumToRender={3}
    maxToRenderPerBatch={2}
    updateCellsBatchingPeriod={50}
    windowSize={5}
    removeClippedSubviews={Platform.OS === "android"}
  />
);
```

Also reduce first load:

```ts
const INITIAL_PUBLIC_LIMIT = 24;
const MAX_ROW_ITEMS = 10;
```

Load the next public playlist page only after the public playlist section approaches the end.

### 4. YouTube playback can mount multiple WebViews for one song

Severity: Critical  
Impact: WebViews are among the heaviest components in the app. On the player screen, YouTube playback can involve the hidden audible iframe from the provider plus visible/detail/background muted iframes. That is a high memory, battery, and frame-drop risk on 2 GB or Android Go devices.  
Affected files:

- `contexts/PlayerContext.tsx:1733-1749`
- `contexts/PlayerContext.tsx:3474-3558`
- `app/player.tsx:361-553`
- `app/player.tsx:562-687`
- `app/player.tsx:2231-2237`

Root cause:

- The provider keeps a hidden `YoutubePlayer` offscreen for audio.
- The player screen separately renders `VisibleYoutubeVideo` and `BackgroundYoutubeVideo`.
- Progress is polled from the YouTube iframe every 500 ms.

Exact fix direction:

1. Prefer native audio playback for YouTube-derived audio through the backend, then play that stream with React Native Track Player.
2. Allow at most one visual YouTube WebView on the player screen.
3. Disable visual WebViews on low-end mode, battery saver, or when backgrounded.
4. Increase progress polling to 1000-2000 ms if iframe polling remains.

Guard visual WebViews:

```tsx
const shouldRenderYoutubeVisual =
  screenSongIsYouTube &&
  isFocused &&
  appState === "active" &&
  !lowEndMode &&
  !isBackgroundVideoEnabled;

{shouldRenderYoutubeVisual ? (
  <VisibleYoutubeVideo ... />
) : null}
```

Throttle iframe progress:

```ts
const YOUTUBE_PROGRESS_POLL_MS = lowEndMode ? 2000 : 1000;

const intervalId = setInterval(async () => {
  if (!youtubePlayingRef.current) return;
  const position = await youtubePlayerRef.current?.getCurrentTime?.();
  const duration = await youtubePlayerRef.current?.getDuration?.();
  setYoutubePosition(position || 0);
  setYoutubeDuration(duration || 0);
}, YOUTUBE_PROGRESS_POLL_MS);
```

### 5. Search creates excessive network fan-out

Severity: Critical  
Impact: A single debounced query can trigger app API search, app songs, app artists, app playlists, YouTube songs, YouTube videos, YouTube albums, YouTube artists, and YouTube playlists. The YouTube service then probes multiple endpoint variants with `Promise.all`. This can flood the JS thread, radio, backend, and low-end devices.  
Affected files:

- `app/(tabs)/search.tsx:576-848`
- `app/(tabs)/search.tsx:725-747`
- `app/(tabs)/search.tsx:558-562`
- `app/(tabs)/search.tsx:883-891`
- `lib/youtubeMusicService.ts:365-383`

Root cause:

- Search starts all sources in one `Promise.all`.
- YouTube service uses timeout wrappers that do not abort the underlying fetch.
- `fetchFirstJson` starts all candidate URLs and waits for all candidates to settle.
- Search cache excludes `youtubeMusicResults`, so cached queries can lose the YouTube section.

Exact fix:

```ts
type SearchCacheEntry = {
  songs: Song[];
  youtubeSongs: Song[];
  albums: AlbumResult[];
  artists: ArtistResult[];
  playlists: PlaylistResult[];
  timestamp: number;
};

const searchCacheRef = useRef<Map<string, SearchCacheEntry> | null>(null);
```

Stage results:

```ts
const primaryResults = await Promise.all([
  safeFetch(`${apiUrl}api/search?query=${encodeURIComponent(searchTerm)}`),
  safeFetch(`${apiUrl}api/search/songs?query=${encodeURIComponent(searchTerm)}&limit=12`),
  safeFetch(`${apiUrl}api/search/artists?query=${encodeURIComponent(searchTerm)}&limit=8&page=1`),
  safeFetch(`${apiUrl}api/search/playlists?query=${encodeURIComponent(searchTerm)}&limit=6`),
]);

if (controller.signal.aborted || requestId !== searchRequestIdRef.current) return;

setPrimarySearchResults(primaryResults);

InteractionManager.runAfterInteractions(() => {
  void loadSecondaryYoutubeResults(searchTerm, controller.signal, requestId);
});
```

Make YouTube fetches abortable and truly first-success:

```ts
function createTimeoutSignal(ms: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  parent?.addEventListener("abort", () => controller.abort(), { once: true });
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function fetchJson<T>(url: string, parentSignal?: AbortSignal): Promise<T | null> {
  const timeout = createTimeoutSignal(REQUEST_TIMEOUT_MS, parentSignal);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: timeout.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } finally {
    timeout.cancel();
  }
}

async function fetchFirstJson<T>(urls: string[], signal?: AbortSignal): Promise<T | null> {
  for (const url of urls) {
    if (signal?.aborted) return null;
    const json = await fetchJson<T>(url, signal).catch(() => null);
    if (json) return json;
  }
  return null;
}
```

## L. High Priority Issues

### 6. Native Expo config drift

Severity: High  
Impact: `app.json` configuration changes may not affect the existing native projects. This creates release surprises for icons, splash, plugins, updates, Android settings, and permissions.  
Affected files:

- `app.json`
- `android/`
- `ios/`

Evidence:

- `npx expo-doctor` failed the native config sync check.

Fix:

- Either commit to continuous native generation and run `npx expo prebuild --clean` intentionally after config changes, or manage those settings directly in native files.
- Add this check to CI so config drift is visible before release.

### 7. Android backup is enabled

Severity: High  
Impact: User auth state, local preferences, downloaded metadata, cache indexes, or other app storage can be included in Android backup.  
Affected files:

- `android/app/src/main/AndroidManifest.xml:29`

Exact fix:

```xml
<application
  android:allowBackup="false"
  android:fullBackupContent="false"
  android:dataExtractionRules="@xml/data_extraction_rules"
  ...>
</application>
```

For Android 12+, add a `data_extraction_rules.xml` that excludes sensitive app storage.

### 8. `SongRow` comparator does O(n) queue work per row

Severity: High  
Impact: Lists that pass full queues cause row memo comparison to join every queue id. That can become O(rows * queue length) during renders.  
Affected files:

- `components/SongRow.tsx:42-44`
- `components/SongRow.tsx:335-352`
- `app/(tabs)/liked-songs.tsx:114`
- `app/(tabs)/search.tsx:1190-1196`
- `app/playlist/[id].tsx:760-765`

Root cause:

- `queueSignature(queue)` joins every queue id inside `React.memo` equality checks.

Exact fix:

```tsx
type SongRowProps = {
  song: Song;
  queue?: Song[];
  queueKey?: string;
  onSongPress?: (song: Song) => void;
};

export default memo(SongRow, (prevProps, nextProps) => {
  return (
    prevProps.song.id === nextProps.song.id &&
    prevProps.song.title === nextProps.song.title &&
    prevProps.song.artist === nextProps.song.artist &&
    prevProps.song.coverUrl === nextProps.song.coverUrl &&
    prevProps.index === nextProps.index &&
    prevProps.queueKey === nextProps.queueKey &&
    prevProps.onSongPress === nextProps.onSongPress
  );
});
```

Compute the queue key once per parent:

```tsx
const queueKey = useMemo(
  () => filteredSongs.map((song) => song.id).join("|"),
  [filteredSongs]
);
```

Better long-term fix: avoid passing queue arrays to every row. Provide `playSongFromQueue(songId, queueId)` from a queue registry/context.

### 9. Player queue renders all rows inside a `ScrollView`

Severity: High  
Impact: Large queues mount all queue rows and artwork while the player screen is already heavy with blur/video/artwork.  
Affected files:

- `app/player.tsx:2047-2071`
- `app/player.tsx:2518-2527`

Exact fix:

```tsx
<FlatList
  data={playingQueue}
  keyExtractor={(item, index) => `${item.id}-${index}`}
  renderItem={({ item, index }) => (
    <QueueSongRow
      song={item}
      index={index}
      isCurrent={currentSong?.id === item.id}
      onPress={handleQueueSongPress}
    />
  )}
  initialNumToRender={8}
  maxToRenderPerBatch={6}
  updateCellsBatchingPeriod={40}
  windowSize={5}
  removeClippedSubviews={Platform.OS === "android"}
/>
```

### 10. Sensitive production logs

Severity: High  
Impact: Push tokens, notification payloads, playback URL fragments, song metadata, and search details can appear in production logs. This creates privacy and security risk.  
Affected files:

- `services/notificationService.ts:98-99`
- `services/notificationService.ts:152-160`
- `contexts/PlayerContext.tsx:2347-2412`
- `app/(tabs)/search.tsx:770-772`
- `lib/youtubeMusicService.ts:543-1093`

Exact fix:

```ts
const debugLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.log(...args);
  }
};
```

Use the existing app logger consistently and redact tokens/URLs:

```ts
logger.debug("[Push] Registered token", {
  hasExpoToken: Boolean(expoPushToken),
  hasNativeToken: Boolean(nativePushToken),
});
```

Never log full push tokens, auth identifiers, full notification payloads, signed media URLs, or user library data in production.

### 11. Android APK architecture config inflates APK output

Severity: High  
Impact: Universal APK builds include emulator architectures, increasing APK size.  
Affected files:

- `android/gradle.properties:31`
- `eas.json`

Exact fix for APK distribution:

```properties
reactNativeArchitectures=armeabi-v7a,arm64-v8a
```

Preferred Play Store fix: use the AAB profile consistently and let Play split per device architecture.

### 12. Production dependency vulnerabilities

Severity: High  
Impact: `npm audit --omit=dev` reports production vulnerabilities, including critical/high transitive issues.  
Affected files:

- `package.json`
- `package-lock.json`

Findings:

- Critical: `shell-quote@1.8.3` through `react-native -> react-devtools-core`.
- High: `@grpc/grpc-js@1.9.15` through `firebase -> @firebase/firestore`.
- Moderate: multiple Expo SDK 54 package advisories.

Fix:

- Plan an Expo SDK 56 upgrade pass instead of one-off random upgrades.
- Upgrade Firebase to a version that pulls a fixed `@grpc/grpc-js`.
- Re-run `npm audit --omit=dev`, `npx expo-doctor`, Android release build, and smoke tests after the upgrade.

## M. Medium Priority Issues

### 13. Font loading blocks app mount

Severity: Medium  
Impact: First paint waits on `useFonts` before the provider tree renders.  
Affected files:

- `app/_layout.tsx:417-440`

Fix:

- Use system font fallback for the first paint, or keep splash only until absolutely required app state is ready.
- If brand typography must be loaded before UI, measure it with release builds and keep the number of font weights minimal.

### 14. Notification permission request happens early

Severity: Medium  
Impact: Permission work and possible prompts happen during root layout startup instead of user intent.  
Affected files:

- `app/_layout.tsx:214-221`

Fix:

- Defer permission requests until the user opts into notifications, follows an artist, enables reminders, or signs in and reaches a relevant screen.

### 15. Global console monkey-patch can hide errors

Severity: Medium  
Impact: Root-level console filtering affects all runtime logging and can hide related notification failures.  
Affected files:

- `app/_layout.tsx:43-65`

Fix:

- Move notification warning suppression into the notification module and leave global console behavior intact.

### 16. YouTube suggestions are not cancellable

Severity: Medium  
Impact: Suggestion responses can apply after the query changes.  
Affected files:

- `app/(tabs)/search.tsx:883-891`

Fix:

- Add request sequence checking and abortable service calls for suggestions.

### 17. Service timeout wrappers do not abort fetches

Severity: Medium  
Impact: `Promise.race` returns early but the underlying network request continues, wasting radio, JS callbacks, and backend resources.  
Affected files:

- `lib/youtubeMusicService.ts:365-383`
- `lib/jioSaavnService.ts:700-814`

Fix:

- Replace timeout-only helpers with `AbortController` based helpers and thread `AbortSignal` through public service methods.

### 18. Android blur/glass surfaces are expensive

Severity: Medium  
Impact: Blur effects increase overdraw and GPU work, especially when combined with video/artwork.  
Affected files:

- `app/player.tsx:2500-2506`
- `app/(tabs)/_layout.tsx`
- `components/AppTopHeader.tsx`

Fix:

- Add a low-end/Android fallback style using opaque or translucent solid surfaces.
- Disable realtime blur when video, queue sheet, or large lists are active.

### 19. Expo AV fallback audio sampling can be CPU-heavy

Severity: Medium  
Impact: Audio sample listeners can add CPU cost if enabled outside visualizer use cases.  
Affected files:

- `lib/expoAvPlayer.ts:95-121`

Fix:

- Enable sampling only when a visible visualizer is active.
- Keep sampling disabled for background playback and normal song rows.

### 20. Direct dependencies are imported but only installed transitively

Severity: Medium  
Impact: Future package changes can break installs because direct app imports rely on transitive dependencies.  
Affected imports:

- `expo-file-system`
- `expo-modules-core`
- `@react-navigation/native`

Exact fix:

```bash
npx expo install expo-file-system expo-modules-core @react-navigation/native
```

## N. Low Priority Issues

### 21. Debug APK size is large, release size unverified

Severity: Low  
Impact: The debug APK is 155.7 MB. Debug builds are expected to be larger, but release size must be measured before Play Store release.  
Fix:

```bash
eas build --platform android --profile production-aab
```

Then inspect the AAB in Android Studio APK Analyzer or Play Console bundle explorer.

### 22. Multiple EAS production profiles can drift

Severity: Low  
Affected files:

- `eas.json`

Fix:

- Keep one canonical Play Store AAB profile and one internal APK/testing profile.
- Ensure `SKIP_PATCH_PACKAGE` and release env values are consistent across profiles.

### 23. New Architecture should be compatibility-tested

Severity: Low  
Affected files:

- `android/gradle.properties:38`

Fix:

- Keep `newArchEnabled=true` only if release smoke tests pass for Track Player, Reanimated, bottom sheets, WebView/YouTube iframe, notifications, and downloads.

### 24. Dev client network inspector enabled in Gradle properties

Severity: Low  
Affected files:

- `android/gradle.properties:58`

Fix:

```properties
EX_DEV_CLIENT_NETWORK_INSPECTOR=false
```

Apply only to release/prod properties if you still need it for development.

## O. Exact Code Fixes Summary

Priority order:

1. Replace playlist detail `ScrollView` with `FlatList`.
2. Replace Home outer `ScrollView` with a vertical `FlatList`.
3. Restrict YouTube playback visuals to one WebView and disable on low-end mode.
4. Stage search requests and make YouTube/JioSaavn fetches abortable.
5. Remove debug signing from release builds.
6. Disable Android backup.
7. Remove sensitive production logs.
8. Remove `queueSignature(queue)` from row memo comparisons.
9. Convert player queue `ScrollView` to `FlatList`.
10. Upgrade Expo/Firebase/RN dependency set in one planned release branch.

## P. File-by-File Optimization Plan

### `app/(tabs)/index.tsx`

- Convert outer `ScrollView` to vertical `FlatList`.
- Reduce `INITIAL_PUBLIC_LIMIT` from 100 to 24 or lower.
- Keep the existing horizontal FlatList virtualization props.
- Lazy-load lower priority sections after interactions.
- Gate `ActiveHomeHeroVideo` strictly by focus, visibility, app state, and low-end mode.

### `app/playlist/[id].tsx`

- Convert main content to `FlatList`.
- Move header into `ListHeaderComponent`.
- Use row batching props.
- Stop passing unstable/full queue arrays to every row where possible.

### `app/player.tsx`

- Convert queue rows to `FlatList`.
- Replace Android blur with low-end fallback.
- Ensure only one visual YouTube iframe renders at a time.
- Disable background video on low-end mode and when app state is not active.

### `contexts/PlayerContext.tsx`

- Defer eager Track Player setup until first playback or after first home paint.
- Increase YouTube polling interval.
- Remove production playback logs.
- Keep the split contexts; that is a good existing optimization.

### `components/SongRow.tsx`

- Replace queue signature comparison with a parent-computed `queueKey` or queue registry.
- Keep memoization, but compare only cheap stable props.

### `app/(tabs)/search.tsx`

- Cache YouTube results alongside normal results.
- Stage secondary sources after primary app API results.
- Reduce `initialNumToRender` from 20 to about 10.
- Remove per-row queue array construction in `relatedQueue`.
- Add cancellation for suggestions.

### `lib/youtubeMusicService.ts`

- Replace `Promise.race` timeouts with real `AbortController` cancellation.
- Make candidate endpoint selection sequential or first-success with cancellation.
- Add request dedupe by query/type/limit.

### `lib/jioSaavnService.ts`

- Thread `AbortSignal` through all public service methods.
- Cap concurrent provider fallback requests.
- Keep existing cache/stagger logic, but add a total prefetch budget per screen.

### `lib/expoAvPlayer.ts`

- Gate audio sample listener by visible visualizer state.
- Avoid sample callbacks during background playback.

### `android/app/build.gradle`

- Replace debug signing in release builds.
- Keep minify and shrink enabled after smoke testing.

### `android/gradle.properties`

- Use only ARM ABIs for release APKs or prefer AAB.
- Verify New Architecture compatibility.
- Disable dev network inspector for release.

### `android/app/src/main/AndroidManifest.xml`

- Disable app backup.
- Keep `usesCleartextTraffic=false`.
- Review exported media services before release.

### `services/notificationService.ts`

- Remove push token and full payload logs.
- Use redacted debug logs gated by `__DEV__`.

### `package.json`

- Add direct dependencies for direct imports.
- Plan Expo SDK 56 upgrade branch.
- Re-run audit after upgrade.

## Q. Estimated Performance Gains

These are estimates for low-end Android after the high-impact fixes:

- Home first render JS work: 25-45 percent lower.
- Playlist screen mount work for long playlists: 70-90 percent lower.
- Search network requests per query: 40-70 percent lower.
- Player screen GPU/WebView pressure for YouTube tracks: 30-60 percent lower.

## R. Estimated RAM Reduction

Expected peak RAM reduction:

- Home screen: 30-70 MB lower after vertical virtualization and smaller first page.
- Playlist detail: 40-120 MB lower on large playlists.
- Player YouTube screen: 60-180 MB lower if duplicate WebViews/background video are avoided.
- Search screen: 10-35 MB lower from fewer result arrays, fewer in-flight responses, and smaller render batches.

## S. Estimated Startup Time Improvement

Expected startup improvement on low-end Android release builds:

- Defer notification permission and player eager setup: 150-500 ms.
- Reduce first Home mount work: 300-900 ms to interactive Home, depending on network/cache state.
- Keep font load from blocking first paint where possible: 100-300 ms.

Combined realistic target: 0.5-1.5 seconds faster perceived startup on 2 GB to 3 GB Android devices.

## T. Estimated FPS Improvement

Expected scroll/render improvements:

- Home vertical scroll: from likely 30-50 FPS under load to 50-60 FPS after vertical virtualization.
- Long playlist scroll: from likely janky/GC-prone to stable 55-60 FPS with FlatList batching.
- Player YouTube visual screen: from likely frame drops on low-end devices to 45-60 FPS after reducing WebViews/blur.
- Search results: smoother typing and list interaction once request fan-out and row queue work are reduced.

## Final Release Gate

Before production release, run this gate on a real low-end Android device and one mid-range Android device:

```bash
npm run lint
npx tsc --noEmit
npx expo-doctor
npm audit --omit=dev
eas build --platform android --profile production-aab
```

Then manually profile:

- Cold start from force stop.
- Warm start from background.
- Home scroll for 30 seconds.
- Search typing with 5 fast queries.
- Open a playlist with 100+ songs.
- Play native audio, YouTube audio, queue skip, background playback, lockscreen controls.
- Player screen with background video on and off.
- Downloaded/offline playback.
- Notification registration and tap navigation.

Production-ready target:

- No release debug signing.
- No sensitive production logs.
- `expo-doctor` clean or documented native config ownership.
- No critical/high production audit vulnerabilities.
- Home, playlist, search, and player pass low-end Android profiling without visible jank or ANRs.
