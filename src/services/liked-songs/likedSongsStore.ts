import { create } from "zustand";
import type { Song } from "@/lib/musicData";

export interface LikedSongsState {
  songs: Song[];
  ids: Set<string>;
  status: "idle" | "loading" | "ready" | "error";
  initialized: boolean;

  setSongs: (songs: Song[], status?: "ready" | "loading") => void;
  addSongOptimistic: (song: Song) => void;
  removeSongOptimistic: (songId: string) => void;
  setStatus: (status: "idle" | "loading" | "ready" | "error") => void;
  reset: () => void;
}

export const useLikedSongsStore = create<LikedSongsState>((set) => ({
  songs: [],
  ids: new Set<string>(),
  status: "idle",
  initialized: false,

  setSongs: (songs, status = "ready") => {
    const validSongs = Array.isArray(songs)
      ? songs.filter((s) => Boolean(s && s.id && s.title))
      : [];
    const ids = new Set(validSongs.map((s) => s.id));
    set({
      songs: validSongs,
      ids,
      status,
      initialized: true,
    });
  },

  addSongOptimistic: (song) => {
    if (!song?.id) return;
    set((state) => {
      if (state.ids.has(song.id)) {
        return state;
      }
      const nextIds = new Set(state.ids);
      nextIds.add(song.id);
      return {
        songs: [song, ...state.songs.filter((s) => s.id !== song.id)],
        ids: nextIds,
      };
    });
  },

  removeSongOptimistic: (songId) => {
    if (!songId) return;
    set((state) => {
      if (!state.ids.has(songId)) {
        return state;
      }
      const nextIds = new Set(state.ids);
      nextIds.delete(songId);
      return {
        songs: state.songs.filter((s) => s.id !== songId),
        ids: nextIds,
      };
    });
  },

  setStatus: (status) => set({ status }),

  reset: () =>
    set({
      songs: [],
      ids: new Set<string>(),
      status: "idle",
      initialized: false,
    }),
}));
