export const State = { None: "none", Loading: "loading", Buffering: "buffering", Playing: "playing", Paused: "paused", Stopped: "stopped", Ended: "ended", Error: "error" } as const;
export const RepeatMode = { Off: "off", Queue: "queue", Track: "track" } as const;
export const Event = {
  RemotePlay: "remote-play", RemotePause: "remote-pause", RemoteStop: "remote-stop", RemoteNext: "remote-next", RemotePrevious: "remote-previous", RemoteSeek: "remote-seek",
  PlaybackInterruption: "playback-interruption", PlaybackState: "playback-state", PlaybackPlayWhenReadyChanged: "playback-play-when-ready", PlaybackError: "playback-error",
  PlaybackProgressUpdated: "playback-progress", PlaybackActiveTrackChanged: "playback-active-track", PlaybackQueueEnded: "playback-queue-ended",
} as const;
export type NativeTrack = { id?: string; url?: string; headers?: Record<string, string>; source?: string; youtubeVideoId?: string; title?: string; artist?: string; album?: string; artwork?: string; duration?: number; [key: string]: unknown };
