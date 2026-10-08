import type { JioSaavnImage, Song } from "@/lib/musicData";

export interface ArtistCard {
  id: string;
  name: string;
  image: JioSaavnImage[];
  url?: string;
  followerCount?: number | null;
  fanCount?: number | null;
  isVerified?: boolean;
  dominantLanguage?: string | null;
  rank?: number;
  rankingScore?: number;
}
export interface ArtistAlbum {
  id: string;
  name: string;
  image: JioSaavnImage[];
  url: string;
  year?: number | null;
  songCount?: number | null;
}
export interface ArtistDetails extends ArtistCard {
  url: string;
  bio?: { text: string | null; title: string | null }[];
  topSongs: Song[];
  topAlbums: ArtistAlbum[];
  similarArtists: ArtistCard[];
  hasMoreSongs: boolean;
}
export interface NativeArtist { id: string; name: string; coverUrl: string; subscribers?: string }
export interface NativeArtistDetails extends NativeArtist {
  description: string;
  songs: import("./YouTubeMusic").NativeTrack[];
  albums: import("./YouTubeMusic").NativePlaylist[];
  artists: NativeArtist[];
  hasMoreSongs: boolean;
}
export const artistChannelId = (id: string) => id.replace(/^youtube_artist_/, "");
export const validArtistChannelId = (id: unknown): id is string => typeof id === "string" && /^UC[\w-]{22}$/.test(artistChannelId(id));
