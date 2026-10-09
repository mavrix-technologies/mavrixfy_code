import type { Song } from "@/lib/musicData";

export interface ParsedSong {
  title: string;
  artist: string;
  album?: string;
  /** Source duration in seconds, never milliseconds or formatted display text. */
  duration?: number;
  status: "ready" | "error";
  message?: string;
  matchedSong?: Song;
}

export interface FileParseResult {
  songs: ParsedSong[];
  errors: string[];
  totalLines: number;
}
