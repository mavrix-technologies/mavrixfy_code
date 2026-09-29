import AsyncStorage from "@react-native-async-storage/async-storage";
import { runRewardedAd } from "./rewardedAdService";

const DOWNLOAD_PASSES_KEY = "@mavrixfy_unlocked_download_passes";
const DEFAULT_INITIAL_PASSES = 2; // Initial free download slots

export async function getRemainingDownloadPasses(): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(DOWNLOAD_PASSES_KEY);
    if (val === null) {
      await AsyncStorage.setItem(DOWNLOAD_PASSES_KEY, String(DEFAULT_INITIAL_PASSES));
      return DEFAULT_INITIAL_PASSES;
    }
    return Math.max(0, parseInt(val, 10) || 0);
  } catch {
    return DEFAULT_INITIAL_PASSES;
  }
}

export async function addDownloadPasses(count: number): Promise<number> {
  try {
    const current = await getRemainingDownloadPasses();
    const next = current + count;
    await AsyncStorage.setItem(DOWNLOAD_PASSES_KEY, String(next));
    return next;
  } catch {
    return count;
  }
}

export async function consumeDownloadPass(): Promise<boolean> {
  try {
    const current = await getRemainingDownloadPasses();
    if (current <= 0) return false;
    await AsyncStorage.setItem(DOWNLOAD_PASSES_KEY, String(current - 1));
    return true;
  } catch {
    return true;
  }
}

/**
 * Checks if user has a download pass or directly runs the Rewarded Ad.
 * Returns true if the download should proceed.
 */
let requestQueue: Promise<unknown> = Promise.resolve();
export function requestDownloadWithRewardedAd(_songTitle: string): Promise<boolean> {
  const request = requestQueue.then(async () => {
    if (await consumeDownloadPass()) return true;
    const result = await runRewardedAd();
    if (result === "earned") {
      await addDownloadPasses(2);
      return true;
    }
    return result === "unavailable";
  });
  requestQueue = request.catch(() => undefined);
  return request;
}
