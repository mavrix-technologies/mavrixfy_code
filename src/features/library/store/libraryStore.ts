import { create } from "zustand";
import type { DisplayPlaylist } from "../components/PlaylistListItem";
import type { FollowedArtist } from "@/lib/followedArtists";

export interface LibraryState {
  playlists: DisplayPlaylist[];
  followedArtists: FollowedArtist[];
  status: "idle" | "loading" | "ready" | "error";
  initialized: boolean;

  setPlaylists: (playlists: DisplayPlaylist[], status?: "ready" | "loading") => void;
  setFollowedArtists: (artists: FollowedArtist[]) => void;
  addPlaylistOptimistic: (playlist: DisplayPlaylist) => void;
  removePlaylistOptimistic: (playlistId: string) => void;
  updatePlaylistOptimistic: (playlistId: string, patch: Partial<DisplayPlaylist>) => void;
  setStatus: (status: "idle" | "loading" | "ready" | "error") => void;
  reset: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  playlists: [],
  followedArtists: [],
  status: "idle",
  initialized: false,

  setPlaylists: (playlists, status = "ready") => {
    const valid = Array.isArray(playlists) ? playlists.filter((p) => Boolean(p && p.id)) : [];
    set({
      playlists: valid,
      status,
      initialized: true,
    });
  },

  setFollowedArtists: (artists) => {
    const valid = Array.isArray(artists) ? artists.filter((a) => Boolean(a && a.id)) : [];
    set({ followedArtists: valid });
  },

  addPlaylistOptimistic: (playlist) => {
    if (!playlist?.id) return;
    set((state) => ({
      playlists: [playlist, ...state.playlists.filter((p) => p.id !== playlist.id)],
    }));
  },

  removePlaylistOptimistic: (playlistId) => {
    if (!playlistId) return;
    set((state) => ({
      playlists: state.playlists.filter((p) => p.id !== playlistId),
    }));
  },

  updatePlaylistOptimistic: (playlistId, patch) => {
    if (!playlistId) return;
    set((state) => ({
      playlists: state.playlists.map((p) => (p.id === playlistId ? { ...p, ...patch } : p)),
    }));
  },

  setStatus: (status) => set({ status }),

  reset: () =>
    set({
      playlists: [],
      followedArtists: [],
      status: "idle",
      initialized: false,
    }),
}));
