# YouTube Playback Architecture

The React Native app does not extract YouTube streams.

YouTube Music playback is resolved by the Node backend at playback time:

1. The app stores and sends only YouTube video IDs.
2. The backend uses `youtubei.js` as the single music engine.
3. The backend returns a fresh stream URL for the active playback attempt.
4. The app gives that transient URL to native media controls.
5. If playback fails, the app reports the failure and asks the backend for a new URL.

Do not add `youtubei.js`, Piped, `streamingData` parsing, or any other stream extraction logic to the React Native app.

## Mobile Responsibilities

- Call backend YouTube Music APIs for search, metadata, queue, recommendations, playlists, artists, likes, history, autoplay, and playback.
- Use native playback, background playback, notifications, lock-screen controls, Bluetooth controls, and queue management.
- Keep stream URLs only in memory for the current playback queue.
- Never persist YouTube stream URLs to AsyncStorage, Firestore, or local cache.

## Backend Responsibilities

- Resolve all YouTube Music data through `youtubei.js`.
- Cache only metadata and recommendation data in Redis.
- Never cache stream URLs.
- Generate fresh stream URLs when playback starts or when the app reports a playback failure.
- Run the `youtubei:monitor` script to detect upstream YouTube compatibility issues.

## Useful Commands

```bash
cd Mavrixfy-web/backend
npm run youtubei:monitor
npm run youtubei:update
```
