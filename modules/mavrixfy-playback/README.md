# Mavrixfy native playback

Android uses Media3 ExoPlayer 1.9.0 and a MediaLibraryService. iOS uses
AVQueuePlayer (an AVPlayer subclass), AVAudioSession and MPRemoteCommandCenter.
Expo development builds and production builds use the same local Expo module.
The application remains on its installed Expo SDK 57 / React Native 0.86.

`src/services/audio/NativePlaybackPlayer.ts` is the shared application API.
Normal player, StandBy, queue, lyrics and car controls delegate to this API.
Screen mounting, rotation and dismissal must never create or destroy a player.
Native owns decoding, its timeline, buffering and automatic queue advancement.
JavaScript owns song resolution, account preferences and queue business rules.

Media3 preloads five seconds of the next playlist item. AVQueuePlayer prepares
its queued items. JavaScript resolves the next three signed streaming URLs and
updates only upcoming items; it creates no extra playback decoder. Signed URLs
still require the resolver: indefinite background playback beyond already
resolved items is not guaranteed if iOS suspends JavaScript. Resolve streams
before placing playable items in the queue, and validate expiry/network errors.

## Development

Rebuild the native client after this migration. A Metro reload or OTA update
cannot install the module. The runtime version changed to prevent this bundle
from reaching older binaries.

- Android: `npm run android`, then `npm start` when reusing the installed client.
- iOS on macOS/Xcode: `npm run ios`; alternatively use the existing EAS
  development profile to build an iPhone client.
- `npm run start:expo-go` provides a preview with expo-audio, not production
  playback verification. Its module is initialized only when the preview API
  is used. A native build missing MavrixfyPlayback fails with a rebuild message.

Configuration plugins preserve the single Android media service, release
signing environment variables and native build settings across Expo prebuild.
The previous AudioAPI renderer and independent car media session were removed
from the application. Their old renderer tests use a historical text fixture;
they do not verify the new native engine.

## Feature limits and verification

Android Equalizer uses the device's available AudioFX bands, mapping the saved
15-band curve to supported frequencies. Availability and resulting response
depend on the device. AVPlayer does not supply built-in EQ; iOS preferences
remain saved, but processing is disabled. Adding iOS EQ requires a separately
verified compatible processing implementation.

Native notification/lock-screen queue transport operates on the prepared native
queue. Android Auto browse/search/like/shuffle additionally needs the active
JavaScript catalog/resolver; cold-start catalog resolution is not implemented.

Run `npm test` and `npm run typecheck`. Native bridge regression tests are
mock-based. For actual Android decoder/foreground-service tests, connect an
Android device or emulator, then run from `android`:

```
gradlew.bat :mavrixfy-playback:connectedDebugAndroidTest
```

Instrumentation covers two complete generated audio files with automatic Next
while backgrounded, pause/seek/reorder/resume, named platform media-button
commands, and transient audio-focus loss/gain with explicit-pause protection.
It does not prove remote
stream reliability or audible physical-device output. Before release, compile
and exercise iOS on Xcode/iPhone and verify real streams, airplane mode,
screen lock, rotation/StandBy, headset disconnect, calls, Bluetooth, car
commands and explicit Pause during stream resolution on both platforms.

Official implementation references:

- https://developer.android.com/media/media3/exoplayer
- https://developer.android.com/media/media3/session/background-playback
- https://developer.android.com/media/media3/exoplayer/preloading-playlist
- https://developer.apple.com/documentation/avfoundation/avqueueplayer
- https://developer.apple.com/documentation/avfaudio/avaudiosession
- https://docs.expo.dev/develop/development-builds/introduction/

## Verification on 2026-10-12

- 514 JavaScript regression tests passed; TypeScript and changed playback-code
  lint passed. Historical renderer fixtures are included in that test count.
- Android arm64 release APK built and its signature verified. Autolinking
  includes MavrixfyPlaybackModule; the merged manifest disables the old
  expo-audio media service. The build still reports upstream R8 Kotlin metadata
  warnings; these were not hidden by disabling optimization.
- Both native Android emulator instrumentation tests passed, including two
  generated eight-second WAV files completed in order while backgrounded.
  These verify local native decoding/queue transport, not real-song streaming.
- The iOS production JavaScript bundle exported. Native Swift compilation,
  iPhone audio/session behavior and iOS EQ support remain unverified/unsupported
  as described above. This is a migration test candidate, not a certification
  that every production-device scenario has passed.

## Physical Android verification on 2026-10-12

USB device: vivo 1901, Android 11, arm64. Installed the rebuilt APK without
clearing application data. JavaScript regression coverage now totals 515
passing tests; TypeScript and changed-code lint pass.

Device testing uncovered and fixed three migration defects:

- Optional `undefined` fields in nested song metadata were rejected by Expo's
  Kotlin Object converter. Commands now send JSON-compatible payloads.
- The portrait bottom sheet could mount into the outgoing landscape viewport
  during StandBy exit. Its mounting now waits for the measured portrait layout,
  leaving native sheet sizing intact.
- Direct JavaScript player commands did not bind a MediaController, so the
  session was never implicitly added to its service. `addSession` now registers
  it explicitly for Media3 foreground-service and notification handling.

Both native phone tests passed again with an added assertion that the service
is foreground before backgrounding the player. Real streaming tests completed
Jeena Jeena (3:48) and Iktara (4:14), including automatic Next in StandBy and
while backgrounded/screen locked. Also exercised all three StandBy styles,
Queue/Lyrics/Back, Pause/Resume/Next/Previous, seek and portrait restoration.
The final APK reports `isForeground=true` and displays the native media
notification; its actual Pause, Play and Next controls passed.

One failure remains outside these passing paths: ADB anonymous media-key
dispatch on this Android 11 device crashed Media3's legacy controller with
`packageName should be nonempty`. The matching upstream issue remains open:
https://github.com/androidx/media/issues/3214 . No reflection shim, catch-all
crash handler or unverified dependency fork was added. Bluetooth/headset/call
behavior needs further physical testing; successful notification controls do
not establish that every external controller is safe.

A 60-second locked/background capture is in `outputs/performance/`.
`dumpsys cpuinfo` reported an older foreground sampling window on this device,
so its repeated CPU figures cannot establish current background CPU usage.
USB charging also prevents a meaningful battery-drain conclusion.

## External-controller verification on 2026-10-12

All four native instrumentation tests passed on the vivo Android 11 phone.
Named platform media-button Pause/Play/Next/headset-hook commands passed via
the application's own MediaBrowser session token. Simulated transient audio
focus paused and resumed playback; explicit user Pause during the interruption
prevented automatic resume. This is not a real incoming-call test.

boAt Rockerz 400 Bluetooth audio output was confirmed by the user and the
device's A2DP route. Physical headset transport results remain inconclusive:
another audio application was active during those checks.

Google's Android Auto Desktop Head Unit connected over the phone's head-unit
server and ADB port 5277. DHU checks passed for Pause/Resume, Next/Previous,
automatic track advance, Queue/Recently Played browsing and song selection,
and Liked Songs browsing. Selecting "Tu Meri Main Tera Main Tera Tu Meri"
outside the previous queue reached playing state. However, selecting "Apna
Bana Le" failed on retry: DHU displayed "Could not load your selection" and
the native session became stopped with empty metadata. A later retry of the
previously successful "Tu Meri" selection also ended stopped. This exposed a
race in the old `onAddMediaItems` callback: it emitted an asynchronous JavaScript
selection and immediately returned an empty list, allowing Media3 to clear the
shared controller's queue.
The selected tracks reached native playing state with advancing position;
title/artwork updates were observed after settling. The native service stayed
foreground and the application process remained alive. These checks do not
establish physical car audio, cold-start catalog availability, voice search,
or safety of anonymous ADB media-key dispatch (the upstream crash above).
Local screenshots and native-state/log captures are under `outputs/dhu-*`
and `outputs/android-auto-*`.

The fix uses `onSetMediaItems` with a pending `ListenableFuture`. The shared
controller completes its normal selection before acknowledging the request;
Media3 then receives the populated native playlist and current start position.
Unavailable selections fail the future instead of returning an empty playlist.
Request IDs reject stale acknowledgements, new selections supersede old ones,
and explicit Pause/Stop/reset, service destruction and a 30-second deadline
settle pending requests. No second audio engine or resolver was introduced.

All five physical-phone native instrumentation tests passed, including a new
legacy MediaBrowser/MediaController test with delayed selection, repeated
switching, unavailable media and Pause cancellation. TypeScript, changed-code
lint and all 515 JavaScript regression tests passed; the updated car-bridge test
also passed. The rebuilt APK was installed preserving app data. DHU selected
"Apna Bana Le", switched to "Tu Meri", and selected "Apna Bana Le" again; all
reached playing state with advancing position. The repeated "Apna" playback
reached 3:33 before an intentional DHU Pause. Foreground service and app process
remained alive, with no application crash/playback failure in the captured logs.
DHU Resume and Next subsequently passed. "Saiyaara" played to completion and
automatically advanced to "Naal Nachna" without touch; the next track reached
native playing state with an advancing position.
Native runtime version is now `3.3.0-33002-native-player2` to prevent an older
OTA JavaScript bundle from running with the new acknowledgement contract.
Expo regenerated the Android runtime resource from app config. The final
runtime-2 release APK built successfully, its signature/runtime resource were
verified, and it was installed without clearing app data. A fresh DHU selection
of "Apna Bana Le" reached playing state at 21 seconds with `error=null` and
`isForeground=true`; final app logs had no matching crash/playback failure.

## USB iPhone investigation on 2026-10-12

Connected an iPhone running iOS 27.0.1 using the existing trusted USB pairing.
Read-only checks verified the installed 3.3.0/33002 sideloaded app, audio
background mode and a successful `native-player2` embedded-update launch.
The user reproduced the "Salaam India" playback failure. Live Mavrixfy
AVFoundation logs included `NSURLErrorDomain -1001` (timeout) and `-1002`
(unsupported URL). The crash-report service returned no Mavrixfy crash reports.
Other media processes were also active; their audio/logs are not app test passes.

Source inspection found that iOS eagerly inserted the entire remaining logical
playlist into AVQueuePlayer, including synthetic unresolved URLs. Saved queues
contained 43–214 songs. The source fix limits inserted assets to the current
song and two resolved successors, replenishes that window on native transitions
and maps item identities to logical indices. Unresolved placeholders are no
longer sent to AVFoundation. Explicit Retry recreates a failed item. Item errors
now retain native/underlying error codes and log error-domain/code diagnostics
without logging stream URLs or headers. Duplicate notifications for the same
failed item are suppressed. This addresses confirmed unsafe loading behavior;
it does not prove that every reported timeout was caused by queue pressure.

USB logs also reported UIKit rejecting the legacy UIDevice orientation setter.
`patches/expo-screen-orientation+57.0.2.patch` retains that fallback only before
iOS 16 and updates supported orientations before requesting scene geometry on
modern iOS. Targeted patch-package application was verified.

TypeScript and all 515 JavaScript regressions passed. Swift compilation and the
new native behavior have NOT been verified on the phone: Windows lacks Xcode,
and the device's screenshot/developer service returned `InvalidService`.
Rebuild the unsigned IPA on the macOS CI runner, re-sign/install it, then retest
the reproduced failures, long queues, consecutive complete songs, native Next,
Pause/Resume, seek, repeat, background/lock, interruptions and StandBy rotation.
The installed iPhone app remains the previous native binary until that rebuild.

## Follow-up code verification on 2026-10-12

Reviewed the shared playback/event controller, native queue/transport handling,
StandBy activation/orientation/layout and the iOS workflow/config/patch inputs.
StandBy uses the shared playback actions and does not own a separate decoder or
pause/resume lifecycle on entry/exit.

Additional fixes from this review:

- iOS upcoming-window updates preserve the active interruption's resume token
  when retaining the current item. Actual source changes still invalidate it.
- Repeat completion checks the item, selection revision, interruption and play
  intent before resuming. Seek ignores cancelled/outgoing-item completions.
- An unresolved iOS successor requests resolution from the shared controller
  rather than failing an unsupported placeholder. It does not clear the
  end-of-stack timer or override explicit Pause/a pending selection.
- Android cancelled browse futures clear their stored request before notifying
  listeners; remote `setPlayWhenReady(false)` also cancels pending selection.
- Removed two unused player imports and corrected one array-type lint warning.

Final checks: all 517 JavaScript regressions passed (including two new unresolved
successor flow tests), TypeScript passed, full-app lint returned zero errors and
10 remaining require-import warnings, and Android module/test Kotlin compilation
passed. Workflow YAML, dependency lock consistency and installed orientation
patch checks passed. A Swift grammar parser reported no syntax errors in the
playback module or patched orientation source; this is NOT Swift type checking
or an Xcode build. Updated iOS compilation and real-device
playback/rotation/interruptions remain required after rebuilding the IPA.

## iOS repeated-first-song correction

The reported symptom was selecting a second song while the first song's audio
played again. Inspecting the installed Expo SDK's conversion source found a
platform-specific command bug: `DynamicDictionaryType` hydrates `[String: Any]`
through `DynamicRawType<Any>`, and `JavaScriptValue.getAny()` returns `Double`
for JS numbers. The player read `args["index"] as? Int ?? 0` and `args["to"] as?
Int. A supplied nonzero JS index could therefore fail its cast and select zero;
upcoming-track updates and queue moves were affected by the same conversion.
Android already converts through `Number.toInt()` and does not have this cast.

`PlaybackCommandValues.index` now accepts bridged numeric values, converts exact
finite integers, and rejects booleans/fractions/invalid values instead of
silently choosing the first song. Both `index` and `to` use that conversion.
Removed the duplicate stored AVPlayerItem array; AVQueuePlayer's own `items()`
is the native queue source, with the logical item-index map retained. This is
still one Apple AVQueuePlayer/AVAudioSession/MPRemoteCommandCenter implementation.
No Android engine changes were made for this reported iOS symptom.

The macOS workflow now compiles and runs the actual Foundation conversion helper
with `scripts/ios-playback-command-values.test.swift` before iOS prebuild. That
test reproduces Expo's Double dictionary values, checks indices 0–213, queue-move
indices, NSNumber/native integer inputs and invalid inputs. Windows syntax/YAML
checks, TypeScript and 517 JS regressions pass. The new Swift test and AVFoundation
behavior still require macOS CI execution and an updated signed IPA on the phone.
Pushing only older changes or applying a JS OTA cannot replace the installed
native implementation; include the new Swift helper and CI test in the rebuild.

## Latest local verification on 2026-10-12

The Medium_Phone Android emulator (x86_64, Android 17) ran all five native
instrumentation tests successfully. Added assertions verify native progress
advances on both complete eight-second audio fixtures, stays stable while
paused, and advances after resuming. The same suite covers automatic Next with
the activity backgrounded, foreground service ownership, named media-key
Play/Pause/manual Next, seek/reorder, simulated transient audio focus, and
asynchronous browse selection/cancellation. Results are in
`android/build/reports/androidTests/connected/debug/index.html` relative to this
module, with the invocation log at the repository's
`outputs/final-playback-native-tests.log`.

Full-app TypeScript and 517 JavaScript regressions passed; lint has zero errors
and ten existing require-import warnings. These checks exercise native decoder
state and shared controller logic, not audible remote-song playback or visual
progress-bar/StandBy rotation on a physical device. The emulator used no audio
output. No physical Android target was connected for this run.

The USB iPhone still has the earlier native binary. Windows has no Xcode/Swift
compiler, so the new Foundation helper test and full iOS build await macOS CI,
followed by installation and physical playback tests. Production readiness
remains unverified until that completes, along with actual headset/call and
network interruption coverage. The previously observed anonymous ADB media-key
crash remains an upstream Media3 issue; named controller tests do not cover it.

The native player uses Apple's AVQueuePlayer and Android's Media3 service APIs,
but iOS header-dependent streams still use the undocumented
`AVURLAssetHTTPHeaderFieldsKey` option. That path cannot be described as entirely
documented Apple API and requires explicit stream/device compatibility testing.
