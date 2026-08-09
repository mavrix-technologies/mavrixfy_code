import TrackPlayer, { Event } from "react-native-track-player";

// Headless service registered via TrackPlayer.registerPlaybackService in index.js.
// autoHandleInterruptions (set in setupPlayer) owns audio-focus management natively,
// so no RemoteDuck handler is needed here.
export async function trackPlayerService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  // stop() (not pause()) lets the foreground service wind down via stopForegroundGracePeriod.
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));
}
