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
while backgrounded, plus pause/seek/reorder/resume. It does not prove remote
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
