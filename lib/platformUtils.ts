import Constants from 'expo-constants';

/**
 * Check if running in Expo Go
 */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

/**
 * Check if native modules are available
 */
export function hasNativeModules(): boolean {
  return !isExpoGo();
}
