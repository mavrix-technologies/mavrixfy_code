import type { Song } from "@/lib/musicData";
import { likedSongDocumentIds, mergeLikedSongIdentities } from "./likedSongFormat";
import { create } from "zustand";

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
      ? mergeLikedSongIdentities(songs.filter((s) => Boolean(s && s.id && s.title)))
      : [];
    const ids = new Set(validSongs.flatMap(likedSongDocumentIds));
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
      const songs = mergeLikedSongIdentities([song, ...state.songs]);
      return { songs, ids: new Set(songs.flatMap(likedSongDocumentIds)) };
    });
  },

  removeSongOptimistic: (songId) => {
    if (!songId) return;
    set((state) => {
      if (!state.ids.has(songId)) {
        return state;
      }
      const songs = state.songs.filter(s => !likedSongDocumentIds(s).includes(songId));
      return { songs, ids: new Set(songs.flatMap(likedSongDocumentIds)) };
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
