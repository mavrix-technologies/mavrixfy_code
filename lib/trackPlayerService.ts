import TrackPlayer, { Event } from "react-native-track-player";

export async function trackPlayerService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play().catch(err => console.error("[trackPlayerService] RemotePlay failed:", err));
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause().catch(err => console.error("[trackPlayerService] RemotePause failed:", err));
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.pause().catch(err => console.error("[trackPlayerService] RemoteStop failed:", err));
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    TrackPlayer.skipToNext().catch(err => console.error("[trackPlayerService] RemoteNext failed:", err));
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    TrackPlayer.skipToPrevious().catch(err => console.error("[trackPlayerService] RemotePrevious failed:", err));
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
    TrackPlayer.seekTo(event.position).catch(err => console.error("[trackPlayerService] RemoteSeek failed:", err));
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    if (event.paused) {
      await TrackPlayer.pause().catch(err => console.error("[trackPlayerService] RemoteDuck pause failed:", err));
    } else {
      await TrackPlayer.play().catch(err => console.error("[trackPlayerService] RemoteDuck play failed:", err));
    }
  });
}
