import type { Song } from "@/lib/musicData";
import type { QueueOrderSnapshot } from "@/services/audio/queueDrag";

/** Duration in whole minutes, or stop at the end of the queue. */
export type SleepTimerSelection = number | "end-of-stack";

export interface SleepTimerState {
  mode: "duration" | "end-of-stack";
  label: string;
  endsAt: number | null;
}

export interface PlaybackQualityState {
  requested: "auto" | "low" | "medium" | "high";
  /** Reported source bitrate in kbps; 0 means not known, never an assumed quality tier. */
  actualBitrate: number;
  qualityLabel: string;
  unlocked: boolean;
  isFallback: boolean;
}

export interface PlayerProgressContextValue {
  progress: number;
  duration: number;
  positionMillis: number;
}

export interface PlayerBrowseContextValue {
  currentSong: Song | null;
  queue: Song[];
  isPlaying: boolean;
  likedSongs: Song[];
  playSong: (song: Song, queue?: Song[]) => void;
  shufflePlay: (songs: Song[], startSong?: Song) => void;
  togglePlay: () => void;
  toggleLike: (song: Song) => void;
  toggleShuffle: () => void;
}

export interface PlayerActionsContextValue {
  isShuffled: boolean;
  repeatMode: "off" | "all" | "one";
  likedSongIds: string[];
  likedSongs: Song[];
  albumColor: string;
  textColor: string;
  sleepTimer: SleepTimerState | null;
  playbackQuality: PlaybackQualityState;
  playSong: (song: Song, queue?: Song[]) => void;
  shufflePlay: (songs: Song[], startSong?: Song) => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  seekTo: (progress: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (song: Song) => void;
  isLiked: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number, expectedState?: QueueOrderSnapshot) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
  setSleepTimer: (selection: SleepTimerSelection) => void;
  clearSleepTimer: () => void;
  setAlbumColor: (color: string) => void;
  setTextColor: (color: string) => void;
  changeStreamingQuality: (quality: "auto" | "low" | "medium" | "high") => Promise<void>;
}

export interface ResolvedPlaybackResult {
  url: string | null;
  qualityState: PlaybackQualityState;
}
