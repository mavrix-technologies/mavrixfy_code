import type { Song } from "@/lib/musicData";
import * as Storage from "@/lib/storage";
import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import { toDurationSeconds } from "@/utils/timeFormatters";

function savedSong(value: unknown): Song | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const song = value as Partial<Song>;
  if (typeof song.id !== "string" || !song.id.trim()) return null;
  const { source, videoId, youtubeVideoId, ...metadata } = song;
  const validSource = typeof source === "string" && ["jiosaavn", "gaana", "local", "youtube", "spotify"].includes(source);
  return { ...metadata, id: song.id,
    ...(validSource ? { source } : {}),
    ...(typeof videoId === "string" && videoId.trim() ? { videoId } : {}),
    ...(typeof youtubeVideoId === "string" && youtubeVideoId.trim() ? { youtubeVideoId } : {}),
    title: typeof song.title === "string" ? song.title : "Unknown",
    artist: typeof song.artist === "string" ? song.artist : "Mavrixfy",
    album: typeof song.album === "string" ? song.album : "",
    coverUrl: typeof song.coverUrl === "string" ? song.coverUrl : "",
    genre: typeof song.genre === "string" ? song.genre : "",
    audioUrl: typeof song.audioUrl === "string" ? song.audioUrl : "",
    duration: toDurationSeconds(song.duration) };
}

/** Recover valid queue occurrences without trusting old/corrupt storage indexes. */
export function normalizePersistedPlayerState(value: unknown): Storage.PersistedPlayerState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const state = value as Partial<Storage.PersistedPlayerState>;
  const song = savedSong(state.currentSong);
  if (!song) return null;
  const entries = (Array.isArray(state.queue) ? state.queue : []).flatMap((item, index) => {
    const song = savedSong(item);
    return song ? [{ song, index }] : [];
  });
  const requestedIndex = state.queueIndex;
  let queueIndex = Number.isInteger(requestedIndex) ? entries.findIndex(entry =>
    entry.index === requestedIndex && entry.song.id === song.id) : -1;
  if (queueIndex < 0) queueIndex = entries.findIndex(entry => entry.song.id === song.id);
  const queue = entries.map(entry => entry.song);
  if (queueIndex < 0) { queue.push(song); queueIndex = queue.length - 1; }
  const rawPosition = state.positionSeconds;
  const duration = typeof song.duration === "number" && Number.isFinite(song.duration) && song.duration > 0 ? song.duration : 0;
  const positionSeconds = typeof rawPosition === "number" && Number.isFinite(rawPosition) && rawPosition >= 0 &&
    (duration <= 0 || rawPosition < duration) ? rawPosition : 0;
  return { currentSong: song, queue, queueIndex, positionSeconds,
    ...(typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt) && state.updatedAt >= 0 ? { updatedAt: state.updatedAt } : {}) };
}

export const playerPersistenceService = {
  loadPlayerState: async () => {
    const scope = getAccountScope();
    const saved = await Storage.loadPlayerState();
    // Progress restoration also reads here outside startup reconciliation.
    // An old account's result must not seed a newly mounted account's clock.
    return isCurrentAccount(scope) ? normalizePersistedPlayerState(saved) : null;
  },
  savePlayerState: (state: Parameters<typeof Storage.savePlayerState>[0]) => Storage.savePlayerState(state),
  addRecentlyPlayed: (song: Song) =>
    Storage.addRecentlyPlayed({
      id: song.id,
      name: song.title,
      imageUrl: song.coverUrl,
      type: "song",
      data: song,
    }),
  saveStreamingQuality: (quality: "auto" | "low" | "medium" | "high") =>
    Storage.saveSettings({ streamingQuality: quality }),
  getUserPlaylists: () => Storage.getUserPlaylists(),
  getRecentlyPlayed: () => Storage.getRecentlyPlayed(),
};
