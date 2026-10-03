import { logger } from "@/lib/logger";
import { type Song } from "@/lib/musicData";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";

const { MavrixfyCarPlayModule } = NativeModules;

const carPlayEmitter =
  Platform.OS === "ios" && MavrixfyCarPlayModule
    ? new NativeEventEmitter(MavrixfyCarPlayModule)
    : null;

export interface CarPlayPlaySongEvent {
  songId: string;
  song?: Partial<Song>;
}

export interface CarPlayNowPlayingState {
  songId?: string;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  duration?: number;
  elapsedTime?: number;
  isPlaying?: boolean;
  isFavorite?: boolean;
  isShuffle?: boolean;
  repeatMode?: "off" | "all" | "one";
  queueCount?: number;
}

export const carPlayService = {
  isAvailable(): boolean {
    return Platform.OS === "ios" && Boolean(MavrixfyCarPlayModule);
  },

  async isConnected(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await MavrixfyCarPlayModule.isConnected();
    } catch {
      return false;
    }
  },

  async syncNowPlaying(state: CarPlayNowPlayingState): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await MavrixfyCarPlayModule.updateNowPlaying({
        songId: String(state.songId || ""),
        title: String(state.title || ""),
        artist: String(state.artist || ""),
        album: String(state.album || ""),
        coverUrl: state.coverUrl || "",
        duration: Number(state.duration) || 0,
        elapsedTime: Number(state.elapsedTime) || 0,
        isPlaying: Boolean(state.isPlaying),
        isFavorite: Boolean(state.isFavorite),
        isShuffle: Boolean(state.isShuffle),
        repeatMode: state.repeatMode || "off",
        queueCount: Number(state.queueCount) || 0,
      });
    } catch (err) {
      logger.warn("[CarPlayService] Failed to sync now playing state:", err);
    }
  },

  async syncPlaylists(playlists: any[]): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const sanitized = (playlists || []).map((p) => ({
        id: String(p.id || ""),
        title: String(p.name || p.title || "Playlist"),
        songs: (p.songs || []).map((s: any) => ({
          id: String(s.id || ""),
          title: String(s.title || "Unknown Track"),
          artist: String(s.artist || "Mavrixfy"),
          coverUrl: s.coverUrl || "",
        })),
      }));
      await MavrixfyCarPlayModule.updatePlaylists(sanitized);
    } catch (err) {
      logger.warn("[CarPlayService] Failed to sync playlists:", err);
    }
  },

  async syncFavorites(songs: Song[]): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const sanitized = (songs || []).map((s) => ({
        id: String(s.id || ""),
        title: String(s.title || "Unknown Track"),
        artist: String(s.artist || "Mavrixfy"),
        coverUrl: s.coverUrl || "",
      }));
      await MavrixfyCarPlayModule.updateFavorites(sanitized);
    } catch (err) {
      logger.warn("[CarPlayService] Failed to sync favorites:", err);
    }
  },

  async syncRecent(songs: Song[]): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const sanitized = (songs || []).map((s) => ({
        id: String(s.id || ""),
        title: String(s.title || "Unknown Track"),
        artist: String(s.artist || "Mavrixfy"),
        coverUrl: s.coverUrl || "",
      }));
      await MavrixfyCarPlayModule.updateRecent(sanitized);
    } catch (err) {
      logger.warn("[CarPlayService] Failed to sync recent songs:", err);
    }
  },

  onPlaySong(listener: (event: CarPlayPlaySongEvent) => void): () => void {
    if (!carPlayEmitter) return () => {};
    const subscription = carPlayEmitter.addListener("onCarPlayPlaySong", listener);
    return () => subscription.remove();
  },

  onToggleFavorite(listener: () => void): () => void {
    if (!carPlayEmitter) return () => {};
    const subscription = carPlayEmitter.addListener("onCarPlayToggleFavorite", listener);
    return () => subscription.remove();
  },

  onToggleShuffle(listener: () => void): () => void {
    if (!carPlayEmitter) return () => {};
    const subscription = carPlayEmitter.addListener("onCarPlayToggleShuffle", listener);
    return () => subscription.remove();
  },

  onToggleRepeat(listener: () => void): () => void {
    if (!carPlayEmitter) return () => {};
    const subscription = carPlayEmitter.addListener("onCarPlayToggleRepeat", listener);
    return () => subscription.remove();
  },

  onOpenQueue(listener: () => void): () => void {
    if (!carPlayEmitter) return () => {};
    const subscription = carPlayEmitter.addListener("onCarPlayOpenQueue", listener);
    return () => subscription.remove();
  },

  onConnectionChanged(listener: (connected: boolean) => void): () => void {
    if (!carPlayEmitter) return () => {};
    const subscription = carPlayEmitter.addListener("onCarPlayConnectionChanged", (data: { connected: boolean }) => {
      listener(Boolean(data?.connected));
    });
    return () => subscription.remove();
  },
};
