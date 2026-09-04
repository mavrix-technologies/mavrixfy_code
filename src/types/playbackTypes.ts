import type { Song } from "@/lib/musicData";

export type SleepTimerSelection = 5 | 10 | 15 | 30 | 45 | 60 | "end-of-stack";

export interface SleepTimerState {
  mode: "duration" | "end-of-stack";
  label: string;
  endsAt: number | null;
}

export interface PlaybackQualityState {
  requested: "low" | "medium" | "high";
  actualBitrate: number;
  qualityLabel: string;
  unlocked: boolean;
  isFallback: boolean;
}

export interface PlayerState {
  currentSong: Song | null;
  queue: Song[];
  userQueuedSongIds: string[];
  sourceQueue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  progress: number;
  duration: number;
  positionMillis: number;
  isShuffled: boolean;
  repeatMode: "off" | "all" | "one";
  likedSongIds: string[];
  likedSongs: Song[];
  isLoading: boolean;
  albumColor: string;
  textColor: string;
  sleepTimer: SleepTimerState | null;
  playbackQuality: PlaybackQualityState;
}

export interface PlayerContextValue extends PlayerState {
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
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
  setSleepTimer: (selection: SleepTimerSelection) => void;
  clearSleepTimer: () => void;
  setAlbumColor: (color: string) => void;
  setTextColor: (color: string) => void;
  changeStreamingQuality: (quality: "low" | "medium" | "high") => Promise<void>;
}

export type PlayerLiteContextValue = Omit<PlayerContextValue, "progress" | "duration" | "positionMillis">;

export interface PlayerProgressContextValue {
  progress: number;
  duration: number;
  positionMillis: number;
}

export interface PlayerRowContextValue {
  currentSongId: string | null;
  isPlaying: boolean;
  playSong: (song: Song, queue?: Song[]) => void;
  toggleLike: (song: Song) => void;
  isLiked: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
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

export interface PlayerQueueContextValue {
  currentSong: Song | null;
  queue: Song[];
  userQueuedSongIds: string[];
  queueIndex: number;
  isShuffled: boolean;
  sleepTimer: SleepTimerState | null;
  playSong: (song: Song, queue?: Song[]) => void;
  shufflePlay: (songs: Song[], startSong?: Song) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
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
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
  setSleepTimer: (selection: SleepTimerSelection) => void;
  clearSleepTimer: () => void;
  setAlbumColor: (color: string) => void;
  setTextColor: (color: string) => void;
  changeStreamingQuality: (quality: "low" | "medium" | "high") => Promise<void>;
}

export interface PlayerLikedContextValue {
  likedSongs: Song[];
  likedSongIds: string[];
  likedSongsCount: number;
  isLiked: (songId: string) => boolean;
  toggleLike: (song: Song) => void;
}

export interface ResolvedPlaybackResult {
  url: string | null;
  qualityState: PlaybackQualityState;
}
