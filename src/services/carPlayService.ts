import { NativeModules, NativeEventEmitter, Platform } from "react-native";
import { type Song } from "@/lib/musicData";
import { logger } from "@/lib/logger";

const { MavrixfyCarPlayModule } = NativeModules;

const carPlayEmitter =
  Platform.OS === "ios" && MavrixfyCarPlayModule
    ? new NativeEventEmitter(MavrixfyCarPlayModule)
    : null;

export interface CarPlayPlaySongEvent {
  songId: string;
  song?: Partial<Song>;
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

  onConnectionChanged(listener: (connected: boolean) => void): () => void {
    if (!carPlayEmitter) return () => {};
    const subscription = carPlayEmitter.addListener("onCarPlayConnectionChanged", (data: { connected: boolean }) => {
      listener(Boolean(data?.connected));
    });
    return () => subscription.remove();
  },
};
