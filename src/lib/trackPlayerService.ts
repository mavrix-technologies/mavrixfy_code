export async function trackPlayerService() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const trackPlayerModule = require("react-native-track-player");
    const TrackPlayer = trackPlayerModule.default || trackPlayerModule;
    const Event = trackPlayerModule.Event;
    if (!TrackPlayer?.addEventListener || !Event) return;

    TrackPlayer.addEventListener(Event.RemotePlay, () => { TrackPlayer.play().catch(() => {}); });
    TrackPlayer.addEventListener(Event.RemotePause, () => { TrackPlayer.pause().catch(() => {}); });
    TrackPlayer.addEventListener(Event.RemoteStop, () => { TrackPlayer.stop().catch(() => {}); });
    TrackPlayer.addEventListener(Event.RemoteNext, () => { TrackPlayer.skipToNext().catch(() => {}); });
    TrackPlayer.addEventListener(Event.RemotePrevious, () => { TrackPlayer.skipToPrevious().catch(() => {}); });
    TrackPlayer.addEventListener(Event.RemoteSeek, (event: { position: number }) => {
      if (typeof event?.position === "number") {
        TrackPlayer.seekTo(event.position).catch(() => {});
      }
    });
  } catch {
    // Non-fatal fallback
  }
}
