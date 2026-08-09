import { JioSaavnSong } from "@/lib/musicData";

export interface SearchOptions {
  limit?: number;
  offset?: number;
  language?: string;
}

export interface SearchResult {
  songs: JioSaavnSong[];
  albums?: any[];
  artists?: any[];
  playlists?: any[];
}

export interface IMusicProvider {
  name: string;
  searchSongs(query: string, options?: SearchOptions): Promise<JioSaavnSong[]>;
  getSongDetails(id: string): Promise<JioSaavnSong | null>;
  getStreamUrl?(id: string, quality?: string): Promise<string | null>;
}

export const MUSIC_PROVIDER_KEY = "IMusicProvider";
