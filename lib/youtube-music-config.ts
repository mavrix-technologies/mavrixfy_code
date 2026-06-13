import Constants from 'expo-constants';

/**
 * YouTube Music API Configuration
 * 
 * Configured via .env file or app.json extra config:
 * - Development: EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=http://localhost:8000 (or your local IP)
 * - Production: EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
 * - Standalone builds: app.json extra.youtubeMusicApiUrl
 * 
 * Priority: Environment variable > app.json extra > hardcoded fallback
 */

/**
 * YouTube Music API URL - reads from environment variable or app.json extra config
 */
export function getYouTubeMusicApiUrlForPlatform(): string {
  // Try environment variable first (works in development and if embedded in build)
  const envUrl = process.env.EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL;
  
  if (envUrl) {
    return envUrl;
  }
  
  // Fallback to app.json extra config for standalone builds
  const configUrl = Constants.expoConfig?.extra?.youtubeMusicApiUrl;
  
  if (configUrl) {
    return configUrl;
  }
  
  // Final fallback to production URL
  console.warn('[YouTube Music Config] Using fallback production URL. Consider setting EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL in .env');
  return 'https://mavrixfy-api-drab.vercel.app/api/youtube-music';
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
