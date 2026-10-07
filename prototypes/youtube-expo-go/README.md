# Mavrixfy YouTube — Expo Go prototype

A standalone Android/iOS test app using the same TypeScript service on both platforms. It has no Kotlin/Swift extractor, backend server, JioSaavn imports, account login or cross-provider song matching. It does not replace the main Mavrixfy app yet.

## Run on an iPhone or Android with Expo Go

From `Mavrixfy_App`:

```powershell
npm --prefix prototypes/youtube-expo-go install
npm run youtube:expo-go
```

Install/update Expo Go on your phone, then scan the terminal QR code with the iPhone Camera or Android Expo Go scanner. This opens **Mavrixfy YouTube Test**. Keep this terminal running. No custom iPhone build or Apple Developer membership is needed to open this prototype in Expo Go.

If the default port is already busy:

```powershell
npm run youtube:expo-go -- --port 8086
```

If tunnel service is unavailable, run `npm --prefix prototypes/youtube-expo-go run start:lan` with phone and computer on the same Wi-Fi.

## Check

1. Search `Majboor unplugged` (the default query).
2. Tap **Majboor (Unplugged)** by Sheheryar Rehan / Zoha Waseem. Check that audio is audible and elapsed time advances.
3. Pause/resume, then tap **Seek +10s**.
4. Tap **Playlists** and open one to load its first page of songs.
5. If audio fails, tap **Fresh stream** and capture the displayed error and video ID. No signed stream URLs are displayed or logged by the prototype.

This is a foreground playback feasibility test. It does not implement the production queue, autoplay, full playlist pagination, downloads, lock-screen controls or background playback. Expo Go playback does not verify all behavior of a standalone signed app.

## Implementation

- `src/youtube.ts`: YouTube.js 18.1.0 React Native entry, explicit memory cache (avoids native MMKV), anonymous Music search/playlist parsing, same-video YouTube client resolution, AAC selection, signed URL expiry and HTTP availability check.
- Jinter interprets extracted player code in JavaScript, without native extraction or `Function`/`eval` compilation.
- `src/runtime.ts`: missing event/crypto runtime adapters using Expo Go compatible packages.
- `App.tsx`: Expo Audio playback with request identity guards, pause intent and controls.

## Verification

Typecheck, focused lint and Android/iOS Hermes bundle export passed. Android Expo Go 57 was launched on the emulator: search displayed 20 songs and 20 playlists. `dLAYG-TjnVQ` (**Majboor (Unplugged)** by Sheheryar Rehan / Zoha Waseem) resolved to AAC using the VISIONOS client profile; elapsed audio time advanced past 16 seconds. A later run sought from 20 seconds to 30 seconds and continued advancing. Pause displayed the paused state. This checks the actual Expo Audio renderer, not just a native bridge or Node HTTP request. Actual iPhone execution remains to be checked in Expo Go.

The first partial-range validation produced a false positive: ANDROID_VR/IOS URLs could pass a tiny range request but returned 403 for the full player request. The final resolver validates a full GET, uses matching client headers and playback nonce, and prefers the VISIONOS profile that passed full and range requests in this test. Signed URLs are temporary, and these results do not guarantee every song/network/client will remain playable.

```powershell
cd prototypes/youtube-expo-go
npm run typecheck
npm run probe
```

Sources: [YouTube.js](https://github.com/LuanRT/YouTube.js), [Jinter](https://github.com/LuanRT/Jinter), [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/).
