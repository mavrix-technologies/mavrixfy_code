# Android Physical Device Performance Test - 2026-06-15

## Device And Build

- Device: vivo 1901, Android 11, arm64-v8a, 720x1544 @ 320 dpi.
- APK: `android/app/build/outputs/apk/release/app-release.apk`
- Final APK size: 70,344,548 bytes.
- App: `com.mavrixfy.app`, versionName `2.6.0`, versionCode `20601`, minSdk 24, targetSdk 35.
- Signing: local debug keystore for device performance testing only, not store-ready signing.

## Official Gates Used

- Android Vitals excessive startup: cold >= 5s, warm >= 2s, hot >= 1.5s.
- Android rendering: target frame budget is 16ms; frozen frames are > 700ms.
- React Native production guidance: remove/avoid bundled `console.*` work and optimize list rendering.
- Expo Updates guidance: `ON_ERROR_RECOVERY` disables the default every-launch update check.

References:
- https://developer.android.com/topic/performance/vitals/launch-time
- https://developer.android.com/topic/performance/vitals/render
- https://reactnative.dev/docs/performance
- https://docs.expo.dev/versions/latest/sdk/updates/

## Changes Applied During This Pass

- Changed Expo Updates launch checks from `ON_LOAD` / native `ALWAYS` to `ON_ERROR_RECOVERY` / `ERROR_RECOVERY_ONLY`.
- Deferred notification permission work until after first paint and interactions.
- Lazy-loaded AdMob native ad components after interactions.
- Moved/gated the home inline ad so it does not mount in the first viewport.
- Tuned home feed virtualization:
  - Lower offscreen horizontal row render counts.
  - Smaller vertical `FlatList` render window.
  - Disabled home-row image fade transitions.

## Before Vs After

| Area | Before | Final |
| --- | ---: | ---: |
| Cold start | 3.77-5.53s, 2/5 over 5s | 3.58-3.70s sampled |
| Warm resume | 0-209ms | 192-225ms |
| Fresh guest home memory | ~395 MB PSS, 5 WebViews | 271 MB PSS, 0 WebViews |
| Playback/home memory | ~398 MB PSS, 6 WebViews | Playback smoke passed; deep feed can still reach ~408 MB PSS |
| Top-feed render | up to 99.46% janky in earlier feed scroll | 94.16% janky, p50 21ms, p95 44ms |
| Crashes/ANRs | No fatal in sampled path | No fatal/ANR/ReactNativeJS crash in final sampled path |

## Final Physical Results

Startup:
- Cold samples: 3585ms, 3704ms, 3600ms, latest clean start 3704ms.
- Warm samples: 225ms, 217ms, 192ms.
- Result: passes Android Vitals startup thresholds in this sample.

Memory:
- Fresh guest home: 271,116 KB total PSS, 415,307 KB RSS, 0 WebViews, 509 views.
- Earlier clean login screen: 136,388 KB total PSS, 0 WebViews.
- Deep feed after many image rows: can still reach ~408-424 MB PSS.
- Result: improved, but not 95+ yet for long feed sessions.

Rendering:
- Final top-feed gesture sample: 651 frames, 613 janky frames (94.16%).
- Percentiles: p50 21ms, p90 34ms, p95 44ms, p99 69ms.
- No frozen-frame bucket >700ms was observed in the final sample.
- Result: still fails a 95+ smoothness target. The main remaining work is CPU/UI-thread render cost in the feed/mini-player/image rows.

Playback Smoke:
- Mini-player play tap succeeded.
- Final filtered logs showed no `FATAL EXCEPTION`, `AndroidRuntime`, ANR, or `ReactNativeJS` crash.

## Current Verdict

This build is materially better and starts cleanly on the physical device, but it is not honestly 95+ overall yet. Startup and crash smoke are good. Memory is improved. Rendering is the blocker: the home feed still misses the 16ms frame budget during real gestures.

Recommended next work:
- Convert repeated home row cards into memoized standalone components.
- Reduce image/card overdraw in the home feed and mini-player.
- Consider lower-resolution thumbnails for first-viewport rows.
- Profile JS/UI thread with Android Studio Perfetto/System Trace before any larger refactor.
