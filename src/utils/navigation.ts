import { playerUIStateStore } from '@/lib/playerUIState';
import { router } from 'expo-router';

/**
 * Safely navigate back, or collapse the persistent player sheet if open
 */
export const safeGoBack = () => {
  if (playerUIStateStore.current === 'expanded') {
    playerUIStateStore.collapsePlayer();
    return;
  }
  if (router.canGoBack()) {
    router.back();
  } else {
    // If can't go back, go to home
    router.replace('/(tabs)');
  }
};

