import { getExpoExtra } from "./expoExtra";

/**
 * API Configuration
 * Separates auth backend from music API backend
 */

/**
 * Gets the base URL for authentication and general API
 */
export function getAuthApiUrl(): string {
  const expoExtra = getExpoExtra();
  const host = (expoExtra.domain as string | undefined) || process.env.EXPO_PUBLIC_DOMAIN;
  
  if (!host) {
    const fallbackHost = 'spotify-api-drab.vercel.app';
    return `https://${fallbackHost}/`;
  }

  if (host.startsWith('http://') || host.startsWith('https://')) {
    const finalUrl = host.endsWith('/') ? host : `${host}/`;
    return finalUrl;
  }

  const isLocal = host.includes('localhost') || 
                  host.includes('127.0.0.1') || 
                  host.match(/^192\.168\.\d+\.\d+/) || 
                  host.match(/^10\.\d+\.\d+\.\d+/);
  
  const protocol = isLocal ? 'http' : 'https';
  const url = new URL(`${protocol}://${host}`);
  
  return url.href;
}

/**
 * Gets the base URL for music API (JioSaavn)
 */
export function getMusicApiUrl(): string {
  // Use the same backend for music API
  return getAuthApiUrl();
}

/**
 * Gets the base API URL (alias for getAuthApiUrl for compatibility)
 */
export function getApiUrl(): string {
  return getAuthApiUrl();
}
