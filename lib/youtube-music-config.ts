/**
 * YouTube Music API Configuration
 * 
 * Configured via .env file:
 * - Development: EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://localhost:8000 (or your local IP)
 * - Production: EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
 * 
 * All configuration is controlled through .env - no hardcoded URLs!
 */

/**
 * YouTube Music API URL - reads from environment variable only
 */
export function getYouTubeMusicApiUrlForPlatform(): string {
  // Always use environment variable
  const envUrl = process.env.EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL;
  
  if (!envUrl) {
    throw new Error(
      'EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL is not set in .env file. ' +
      'Please add it to your .env file.'
    );
  }
  
  return envUrl;
}

/**
 * Backend server port
 */
export const YOUTUBE_MUSIC_PORT = 8000;

/**
 * Check if YouTube Music is enabled
 */
export const YOUTUBE_MUSIC_ENABLED = true;

/**
 * Request timeout in milliseconds
 */
export const YOUTUBE_MUSIC_TIMEOUT = 30000;

/**
 * Cache TTL in milliseconds
 */
export const YOUTUBE_MUSIC_CACHE_TTL = {
  search: 30 * 60 * 1000, // 30 minutes
  playlist: 2 * 60 * 60 * 1000, // 2 hours
  album: 2 * 60 * 60 * 1000, // 2 hours
  artist: 2 * 60 * 60 * 1000, // 2 hours
};
