import { router } from 'expo-router';

/**
 * Return through the native navigation stack, with a home fallback.
 */
export const safeGoBack = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    // If can't go back, go to home
    router.replace('/(tabs)');
  }
};

