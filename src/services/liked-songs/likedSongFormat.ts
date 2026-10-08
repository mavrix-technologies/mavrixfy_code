import type { Song } from "@/lib/musicData";

const validVideoId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{11}$/.test(value);
export function likedAtMillis(data: Record<string, any>): number {
  const stamp = data.likedAt || data.addedAt || data.syncedAt || data.createdAt;
  const value = typeof stamp?.toMillis === "function" ? stamp.toMillis() : typeof stamp === "number" ? stamp : Date.parse(stamp);
  return Number.isFinite(value) ? value : 0;
}
export function youtubeIdentity(song: Partial<Song>): string | null {
  if (song.source === "youtube" || song.id?.startsWith("youtube_")) {
    const id = song.youtubeVideoId || song.videoId || song.id?.slice(8);
    if (validVideoId(id)) return id;
  }
  // LastWave StoredTrack uses a permanent watch URL instead of a signed stream.
  const url = song.catalogUrl;
  if (!url) return null;
  if (song.source === "youtube" && validVideoId(url)) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const parts = parsed.pathname.split("/").filter(Boolean);
    const id = host === "youtu.be" ? parts[0] : host === "youtube.com" || host.endsWith(".youtube.com")
      ? parsed.searchParams.get("v") || (["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : null) : null;
    return validVideoId(id) ? id : null;
  } catch { return null; }
}
export function likedSongDocumentIds(song: Song): string[] {
  const aliases = Array.isArray(song.likedSongDocumentIds) ? song.likedSongDocumentIds : [];
  return [...new Set([song.id, ...aliases])].filter(id => typeof id === "string" && !!id && !id.includes("/"));
}
export function needsLikedSongMigration(song: Song): boolean {
  return !youtubeIdentity(song) && song.source !== "local" && song.source !== "gaana";
}
/** Durable metadata only: signed playback URLs must not be persisted for YouTube. */
export function youtubeLikedMetadata(song: Song) {
  const id = youtubeIdentity(song);
  if (!id) throw new Error("Select a valid song first.");
  return { id: `youtube_${id}`, source: "youtube" as const, youtubeVideoId: id, videoId: id,
    title: song.title, artist: song.artist, album: song.album || "", coverUrl: song.coverUrl || "",
    duration: Number.isFinite(song.duration) ? Math.max(0, song.duration) : 0, genre: song.genre || "", audioUrl: "",
    catalogUrl: `https://music.youtube.com/watch?v=${id}` };
}
export function readLikedSong(documentId: string, data: Record<string, any>): Song {
  const artistValue = data.artist || data.artists?.primary || data.artists || "";
  const artist = Array.isArray(artistValue) ? artistValue.map(value => typeof value === "string" ? value : value?.name || "").filter(Boolean).join(", ") : String(artistValue);
  const album = data.albumName || data.album || "";
  const image = data.imageUrl || data.coverUrl || data.image || "";
  const duration = typeof data.duration === "string" && /^\d+(?::\d{1,2}){1,2}$/.test(data.duration)
    ? data.duration.split(":").reduce((seconds: number, part: string) => seconds * 60 + Number(part), 0) : Number(data.duration) || 0;
  const original: Song = { id: documentId, title: String(data.title || data.name || ""), artist,
    album: typeof album === "string" ? album : String(album.name || ""), genre: data.genre || "", duration,
    coverUrl: typeof image === "string" ? image : Array.isArray(image) ? image[image.length - 1]?.url || "" : "",
    audioUrl: data.audioUrl || data.streamUrl || data.url || data.previewUrl || "",
    source: ["youtube", "jiosaavn", "gaana", "local"].includes(data.source) ? data.source : "jiosaavn", videoId: data.videoId, youtubeVideoId: data.youtubeVideoId, downloadUrl: data.downloadUrl,
    catalogUrl: data.catalogUrl || (/^https?:\/\/([^/]+\.)?((jiosaavn|saavn|youtube)\.com|youtu\.be)\//i.test(data.url || "") ? data.url : ""), likedSongDocumentIds: [documentId] };
  const mapping = data.playbackMapping;
  if (mapping?.version === 1 && mapping.song?.source === "youtube" && youtubeIdentity(mapping.song)
    && typeof mapping.song.title === "string" && !!mapping.song.title.trim()
    && typeof mapping.song.artist === "string" && !!mapping.song.artist.trim()) {
    const youtube = youtubeLikedMetadata(mapping.song);
    const enabled = mapping.enabled !== false;
    return { ...(enabled ? youtube : original), likedSongDocumentIds: [documentId] };
  }
  const id = youtubeIdentity(original);
  return id ? { ...original, ...youtubeLikedMetadata({ ...original, youtubeVideoId: id }) } : original;
}
export function mergeLikedSongIdentities(songs: Song[]): Song[] {
  const unique = new Map<string, Song>();
  const keys = new Map<string, string>();
  const identities = new Map<string, string>();
  for (const song of songs) {
    const key = likedSongIdentityKey(song);
    const videoId = youtubeIdentity(song);
    const strongId = videoId ? `youtube_${videoId}` : song.id;
    const identity = identities.get(strongId) || keys.get(key) || song.id;
    const existing = unique.get(identity);
    // Prefer an available YouTube identity for the new app, retaining every original like.
    const preferred = existing && youtubeIdentity(existing) ? existing : song;
    unique.set(identity, existing ? { ...preferred, likedSongDocumentIds: [...new Set([
      ...(existing.likedSongDocumentIds || [existing.id]), ...(song.likedSongDocumentIds || [song.id]),
    ])] } : song);
    keys.set(key, identity);
    identities.set(strongId, identity);
  }
  return [...unique.values()];
}
/** LastWave's whitespace-normalized title|artist identity; version words remain significant. */
export function likedSongIdentityKey(song: Song): string {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return song.title.trim() && song.artist.trim() ? `${normalize(song.title)}|${normalize(song.artist)}` : `id:${song.id}`;
}
