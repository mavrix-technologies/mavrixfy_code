import * as Storage from "@/lib/storage";
import type { Song } from "@/lib/musicData";

export const playerPersistenceService = {
  loadPlayerState: () => Storage.loadPlayerState(),
  savePlayerState: (state: Parameters<typeof Storage.savePlayerState>[0]) => Storage.savePlayerState(state),
  addRecentlyPlayed: (song: Song) =>
    Storage.addRecentlyPlayed({
      id: song.id,
      name: song.title,
      imageUrl: song.coverUrl,
      type: "song",
      data: song,
    }),
  saveStreamingQuality: (quality: "low" | "medium" | "high") =>
    Storage.saveSettings({ streamingQuality: quality }),
  getUserPlaylists: () => Storage.getUserPlaylists(),
  getRecentlyPlayed: () => Storage.getRecentlyPlayed(),
};
