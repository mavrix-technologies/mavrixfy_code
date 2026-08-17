export async function trackPlayerService() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const trackPlayerModule = require("react-native-track-player");
    const TrackPlayer = trackPlayerModule.default || trackPlayerModule;
    const Event = trackPlayerModule.Event;
    if (!TrackPlayer?.addEventListener || !Event) return;

    // Remote control events (notification, lock screen, Android Auto)
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
    TrackPlayer.addEventListener(Event.RemoteDuck, async (event: { paused?: boolean; permanent?: boolean; ducking?: boolean }) => {
      if (event?.permanent) {
        TrackPlayer.stop().catch(() => {});
      } else if (event?.paused) {
        TrackPlayer.pause().catch(() => {});
      } else if (!event?.ducking) {
        TrackPlayer.play().catch(() => {});
      }
    });

    // CRITICAL: Handle playback errors (network failures, invalid URLs, codec issues)
    // Without this, songs silently stop when streams fail
    TrackPlayer.addEventListener(Event.PlaybackError, async (error: any) => {
      console.error('[TrackPlayer] Playback error:', error);
      
      // Log detailed error information for debugging
      if (error?.code) console.error('[TrackPlayer] Error code:', error.code);
      if (error?.message) console.error('[TrackPlayer] Error message:', error.message);
      
      // TrackPlayer will automatically stop on error
      // The PlayerContext will handle UI updates and user notification
    });
  } catch {
    // Non-fatal fallback
  }
}
