import { Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import type { Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import { showGlobalToast } from "@/utils/globalToast";
import { openShareSheet, type ShareSheetData } from "@/utils/shareSheet";
import { unescapeHtml } from "./stringUtils";

export interface ShareContentOptions {
  title: string;
  message: string;
  url?: string;
  dialogTitle?: string;
}

/**
 * Universal official share helper with platform-specific Android/iOS/Web handling
 */
export async function shareContent(options: ShareContentOptions): Promise<boolean> {
  try {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);

    const title = unescapeHtml(options.title || "Mavrixfy");
    const message = unescapeHtml(options.message || "");
    const url = options.url?.trim();

    // On Android, the system share sheet expects the URL to be included in the message string
    const fullMessage =
      Platform.OS === "android" && url
        ? `${message}\n\n${url}`
        : message;

    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title,
          text: message,
          url: url || undefined,
        });
        return true;
      }
      // Web clipboard fallback
      const copyText = url ? `${title} - ${message}\n${url}` : `${title}\n${message}`;
      await Clipboard.setStringAsync(copyText);
      showGlobalToast("Link copied to clipboard!");
      return true;
    }

    const result = await Share.share(
      {
        title,
        message: fullMessage,
        url: url || undefined,
      },
      {
        dialogTitle: options.dialogTitle || `Share ${title}`,
        tintColor: "#00E59B",
      }
    );

    if (result.action === Share.sharedAction) {
      return true;
    }
    return false;
  } catch (err: any) {
    if (err?.message !== "User did not share") {
      const fallbackText = options.url || `${options.title} - ${options.message}`;
      await Clipboard.setStringAsync(fallbackText);
      showGlobalToast("Link copied to clipboard");
    }
    return false;
  }
}

export const MAVRIXFY_WEB_BASE = "https://mavrixfy.site";

/**
 * Universal builder for clean, Spotify-style canonical share links
 */
export function buildShareUrl(options: {
  type: "song" | "playlist" | "artist" | "mix";
  id?: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  ids?: string[];
  names?: string[];
}): string {
  const base = MAVRIXFY_WEB_BASE;

  if (options.type === "playlist" && options.id) {
    const params = new URLSearchParams({ playlist: options.id });
    if (options.title) params.set("name", options.title);
    return `${base}/?${params.toString()}`;
  }

  if (options.type === "artist" && options.id) {
    const params = new URLSearchParams({ artist: options.id });
    if (options.title) params.set("name", options.title);
    return `${base}/?${params.toString()}`;
  }

  if (options.type === "mix" && options.ids?.length && options.names?.length) {
    const params = new URLSearchParams({
      mix: "1",
      ids: options.ids.join(","),
      names: options.names.join(","),
    });
    return `${base}/?${params.toString()}`;
  }

  if (options.id) {
    const params = new URLSearchParams({ track: options.id });
    if (options.title) params.set("title", options.title);
    if (options.subtitle && options.subtitle !== "Song" && options.subtitle !== "Artist") {
      params.set("artist", options.subtitle);
    }
    return `${base}/?${params.toString()}`;
  }

  return base;
}

/**
 * Share a track with visual Spotify-style share sheet
 */
export function shareSong(song: Song): boolean {
  if (!song) return false;
  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
  const title = unescapeHtml(song.title);
  const artist = unescapeHtml(song.artist || "Unknown Artist");
  const imageUrl = song.coverUrl || "";
  const shareUrl = buildShareUrl({
    type: "song",
    id: song.id,
    title,
    subtitle: artist,
    imageUrl,
  });

  openShareSheet({
    title,
    subtitle: artist,
    imageUrl,
    url: shareUrl,
    type: "song",
  });
  return true;
}

/**
 * Share a playlist with visual Spotify-style share sheet
 */
export function sharePlaylist(playlist: {
  id: string;
  name: string;
  coverUrl?: string;
  songCount?: number;
}): boolean {
  if (!playlist) return false;
  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
  const name = unescapeHtml(playlist.name);
  const countText = playlist.songCount ? `${playlist.songCount} songs` : "Playlist";
  const shareUrl = buildShareUrl({
    type: "playlist",
    id: playlist.id,
    title: name,
    subtitle: countText,
    imageUrl: playlist.coverUrl,
  });

  openShareSheet({
    title: name,
    subtitle: countText,
    imageUrl: playlist.coverUrl,
    url: shareUrl,
    type: "playlist",
  });
  return true;
}

/**
 * Share an artist profile with visual Spotify-style share sheet
 */
export function shareArtist(artist: {
  id: string;
  name: string;
  coverUrl?: string;
}): boolean {
  if (!artist) return false;
  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
  const name = unescapeHtml(artist.name);
  const shareUrl = buildShareUrl({
    type: "artist",
    id: artist.id,
    title: name,
    subtitle: "Artist",
    imageUrl: artist.coverUrl,
  });

  openShareSheet({
    title: name,
    subtitle: "Artist",
    imageUrl: artist.coverUrl,
    url: shareUrl,
    type: "artist",
  });
  return true;
}

/**
 * Share an Artist Mix with visual Spotify-style share sheet
 */
export function shareArtistMix(
  names: string[],
  ids: string[],
  images?: string[]
): boolean {
  if (!names.length) return false;
  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
  const title = names.length === 1 ? `${names[0]} Mix` : `${names.slice(0, 2).join(" & ")} Mix`;
  const shareUrl = buildShareUrl({
    type: "mix",
    title,
    subtitle: `${names.length} Artists Mix`,
    imageUrl: images?.[0],
    ids,
    names,
  });

  openShareSheet({
    title,
    subtitle: `${names.length} Artists Mix`,
    imageUrl: images?.[0],
    url: shareUrl,
    type: "mix",
  });
  return true;
}
