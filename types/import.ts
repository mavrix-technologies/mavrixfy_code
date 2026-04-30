export interface ParsedSong {
  title: string;
  artist: string;
  album?: string;
  duration?: string;
  imageUrl?: string;
  audioUrl?: string;
  status: 'ready' | 'added' | 'error' | 'searching';
  message?: string;
  matchConfidence?: 'high' | 'medium' | 'low';
  spotifyUri?: string;
  isrc?: string;
  popularity?: number;
  explicit?: boolean;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string }>;
  };
  duration_ms: number;
  preview_url?: string;
  added_at: string;
  status: 'ready' | 'added' | 'error' | 'searching' | 'skipped';
  message?: string;
}

export interface ImportProgress {
  total: number;
  processed: number;
  added: number;
  skipped: number;
  errors: number;
  percentage: number;
}

export interface MatchResult {
  song: any;
  confidence: number;
  matchScore: number;
}

export interface FileParseResult {
  songs: ParsedSong[];
  errors: string[];
  totalLines: number;
}
