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
function isPrivateDevelopmentUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '10.0.2.2' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    );
  } catch {
    return false;
  }
}

export function getYouTubeMusicApiUrlForPlatform(): string {
  // Try environment variable first (works in development and if embedded in build)
  const envUrl = process.env.EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL;
  
  if (envUrl && (__DEV__ || !isPrivateDevelopmentUrl(envUrl))) {
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
