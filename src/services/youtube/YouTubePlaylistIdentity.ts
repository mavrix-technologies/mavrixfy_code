import type { NativePlaylist } from "./YouTubeMusic";

// Verified 2026-10-07 from the canonical channel linked by youtube.com/music,
// which YouTube Help identifies as its Music playlist discovery entry point.
// A display name, title, thumbnail, or playlist ID prefix is not proof.
const YOUTUBE_MUSIC_CHANNEL_ID = "UC-9-kyTW8ZkZNDHQJ6FgpwQ";
export function youtubePlaylistPublisher(item: Pick<NativePlaylist, "ownerChannelId" | "ownerName">): {
  verified: boolean; label: string;
} {
  if (item.ownerChannelId === YOUTUBE_MUSIC_CHANNEL_ID) return { verified: true, label: "Verified publisher" };
  if (item.ownerChannelId && item.ownerName?.trim()) return { verified: false, label: `By ${item.ownerName.trim()}` };
  return { verified: false, label: "Playlist" };
}
