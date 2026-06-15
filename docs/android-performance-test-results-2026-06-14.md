# Android Performance Test Results - 2026-06-14

Project: Mavrixfy Android app
Package: `com.mavrixfy.app`

## Scope

This report captures the local Android performance checks performed from CLI against the connected emulator. It is a useful baseline, but it is not a final production performance certificate because the tested APK was an x86_64 emulator build signed with the debug keystore and built with minify/resource shrinking disabled to get a runnable release-like APK for measurement.

For final release approval, repeat these checks on a physical low-end Android device and the actual Play Store/AAB build.

## Official Guidance Used

- Android Studio performance profiling: https://developer.android.com/studio/profile
- Android Studio system trace: https://developer.android.com/studio/profile/cpu-profiler
- Google Play Android vitals startup thresholds: https://support.google.com/googleplay/android-developer/answer/9844486
- React Native performance overview: https://reactnative.dev/docs/performance
- React Native profiling: https://reactnative.dev/docs/profiling
- Firebase Performance Monitoring app lifecycle traces: https://firebase.google.com/docs/perf-mon/app-start-foreground-background-traces

Key expectations from those docs:

- Profile release/profileable builds for realistic performance, not debug builds.
- Android vitals treats slow startup as cold >= 5s, warm >= 2s, hot >= 1s.
- React Native targets 60 FPS, which means frame work should generally stay under about 16.67 ms.
- For React Native jank, inspect UI thread, JS thread, native modules thread, and RenderThread in Android Studio System Trace.
- Firebase Performance Monitoring can track real-world app start, foreground, background, custom traces, and HTTP/S network performance.

## Test Device

Connected device:

```text
emulator-5556
model: sdk_gphone16k_x86_64
screen: 720x1280
density: 320
package activity: com.mavrixfy.app/.MainActivity
installed versionCode: 20601
installed versionName: 2.6.0
installed ABI: x86_64
```

Available AVDs found:

```text
Pixel_10_Pro
Pixel_4
Small_Phone
```

## Build Installed

APK:

```text
android/app/build/outputs/apk/release/app-release.apk
size: 69,382,797 bytes
```

Build command used:

```powershell
cd android
$gradleArgs = @(
  ':app:assembleRelease',
  '--no-daemon',
  '-PreactNativeArchitectures=x86_64',
  '-Pandroid.enableMinifyInReleaseBuilds=false',
  '-Pandroid.enableShrinkResourcesInReleaseBuilds=false',
  '-PMAVRIXFY_UPLOAD_STORE_FILE=debug.keystore',
  '-PMAVRIXFY_UPLOAD_STORE_PASSWORD=android',
  '-PMAVRIXFY_UPLOAD_KEY_ALIAS=androiddebugkey',
  '-PMAVRIXFY_UPLOAD_KEY_PASSWORD=android'
)
.\gradlew.bat @gradleArgs
```

Install command:

```powershell
C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe -s emulator-5556 install -r -d android\app\build\outputs\apk\release\app-release.apk
```

Build/install result: passed.

Important build warnings observed:

- `NODE_ENV environment variable is required but was not specified.`
- Root-level Expo config warning about extra key `react-native-google-mobile-ads`.

## Startup Results

Command pattern:

```powershell
adb -s emulator-5556 shell am force-stop com.mavrixfy.app
adb -s emulator-5556 shell am start -W -n com.mavrixfy.app/.MainActivity
```

Cold starts:

| Run | TotalTime | WaitTime |
| --- | ---: | ---: |
| Cold 1 | 2860 ms | 2866 ms |
| Cold 2 | 2606 ms | 2613 ms |
| Cold 3 | 2861 ms | 2876 ms |

Warm/hot starts:

| State | TotalTime | WaitTime |
| --- | ---: | ---: |
| Warm-ish / HOT | 285 ms | 308 ms |
| Hot / already running | n/a | 31 ms |

Result: passed for this emulator baseline. Cold startup stayed around 2.6s to 2.9s, below the Android vitals slow cold-start threshold of 5s.

## Slow Network Results

Slow network profile:

```powershell
adb -s emulator-5556 emu network speed edge
adb -s emulator-5556 emu network delay gprs
```

Reset:

```powershell
adb -s emulator-5556 emu network speed full
adb -s emulator-5556 emu network delay none
```

Slow-network cold starts:

| Run | TotalTime | WaitTime |
| --- | ---: | ---: |
| Slow cold 1 | 2422 ms | 2424 ms |
| Slow cold 2 | 2984 ms | 2986 ms |

Deep-link slow-network search:

```powershell
adb -s emulator-5556 shell am start -W -a android.intent.action.VIEW -d "mavrixfy://search?q=arijit" com.mavrixfy.app
```

Result:

```text
LaunchState: COLD
TotalTime: 2461 ms
WaitTime: 2484 ms
```

Result: passed for startup. The app did not appear network-blocked during launch on the emulator. Search screen launched under slow network without app crash or ANR in the sampled logs.

## Memory Results

Home launch plus basic scrolling:

```text
TOTAL PSS: 236,420 KB
TOTAL RSS: 441,624 KB
Native Heap PSS: 71,844 KB
Java/Dalvik Heap PSS: about 19,616 KB
Code PSS: 47,444 KB
Private Other: 62,948 KB
System: 30,396 KB
```

Slow-network search after about 20 seconds:

```text
TOTAL PSS: 301,984 KB
TOTAL RSS: 505,804 KB
Native Heap PSS: 116,068 KB
Java/Dalvik Heap PSS: 37,252 KB
Code PSS: 47,204 KB
Stack: 4,528 KB
Private Other: 66,332 KB
System: 30,600 KB
```

Result: acceptable as a first emulator baseline, but the Search route uses noticeably more memory than Home. Re-check on a real low-RAM device after enabling minify/resource shrink and using the production ABI/build.

## Rendering / Jank

`adb shell dumpsys gfxinfo com.mavrixfy.app` returned zero rendered frames and no useful framestats on this emulator/build even while the app was focused. This is not proof of zero jank; it means this CLI metric was unavailable/unreliable in this setup.

Required follow-up: capture Android Studio Profiler System Trace on a profileable release build while scrolling Home, opening Search, playing audio, and navigating Player/Playlist screens.

## Logcat Findings

No app `FATAL EXCEPTION` or ANR was observed in sampled logs.

Warnings/noise observed:

- Google Mobile Ads SDK warning: Firebase integration is missing or out of date, so Mobile Ads will not integrate with Firebase.
- React Native warning: `RNGoogleMobileAdsNativeView` does not support property `borderRadius`.
- WebView/chromium messages such as seed/cache initialization.
- System Google/Chimera `TransactionTooLargeException` messages that appear unrelated to the app process.

## Pass / Needs Work

Passed in this run:

- Release-like APK built and installed.
- Cold startup stayed below 5s on emulator.
- Warm and hot startup were fast.
- Slow network did not block startup.
- Slow-network search opened without sampled crash or ANR.
- No app fatal crash found in sampled logcat.

Needs follow-up:

- Build the actual production AAB/APK with real upload signing and minify/resource shrink enabled.
- Profile on at least one physical low-end Android device, not only emulator.
- Use Android Studio Profiler System Trace because CLI `gfxinfo` did not provide frame data.
- Verify Firebase Performance Monitoring or another production telemetry path for real-world app start, network, and custom trace data.
- Fix or intentionally suppress the Google Mobile Ads/Firebase integration warning.
- Review the unsupported `borderRadius` prop on `RNGoogleMobileAdsNativeView`.
- Fix the `NODE_ENV` build warning and root Expo config extra-key warning before final release.

