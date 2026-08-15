export async function trackPlayerService() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const trackPlayerModule = require("react-native-track-player");
    const TrackPlayer = trackPlayerModule.default || trackPlayerModule;
    const Event = trackPlayerModule.Event;
    if (!TrackPlayer?.addEventListener || !Event) return;

    TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
    TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
    TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
    TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
    TrackPlayer.addEventListener(Event.RemoteSeek, (event: { position: number }) => TrackPlayer.seekTo(event.position));
  } catch {
    // Non-fatal fallback
  }
}
