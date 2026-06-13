/**
 * YouTube Music API Configuration
 * 
 * IMPORTANT: Update YOUTUBE_MUSIC_API_URL based on your setup:
 * 
 * - Physical Device (Android/iOS): Use your computer's network IP
 *   Example: "http://192.168.1.6:8000"
 *   Find your IP: Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
 * 
 * - Android Emulator: Use "http://10.0.2.2:8000"
 * 
 * - iOS Simulator: Use "http://localhost:8000"
 * 
 * - Web: Use "http://localhost:8000"
 */

import { Platform } from "react-native";
import * as Device from "expo-device";

/**
 * Get your computer's IP address:
 * Windows: ipconfig | findstr /i "IPv4"
 * Mac/Linux: ifconfig | grep "inet "
 */
const YOUR_COMPUTER_IP = "192.168.1.6"; // UPDATE THIS IF YOUR IP CHANGES

/**
 * Backend port (Python FastAPI runs on 8000)
 */
const BACKEND_PORT = 8000;

/**
 * YouTube Music API URL - automatically selects based on platform
 */
export function getYouTubeMusicApiUrlForPlatform(): string {
  // Check environment variable first
  const envUrl = process.env.EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL;
  if (envUrl) {
    return envUrl;
  }

  // Platform-specific defaults
  if (Platform.OS === "android") {
    // Check if running on emulator or physical device
    // Emulators need 10.0.2.2, physical devices need network IP
    const isPhysical = Device.isDevice;
    return !isPhysical 
      ? `http://10.0.2.2:${BACKEND_PORT}`  // Android Emulator
      : `http://${YOUR_COMPUTER_IP}:${BACKEND_PORT}`; // Physical Android device
  }

  if (Platform.OS === "ios") {
    // iOS Simulator can use localhost
    return `http://localhost:${BACKEND_PORT}`;
  }

  if (Platform.OS === "web") {
    return `http://localhost:${BACKEND_PORT}`;
  }

  // Fallback for physical devices
  return `http://${YOUR_COMPUTER_IP}:${BACKEND_PORT}`;
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
