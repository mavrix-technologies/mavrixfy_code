import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert, AppState, Platform } from "react-native";
import {
  accountStorageKey,
  getAccountScope,
  isCurrentAccount,
} from "@/lib/accountScope";
import { isAppShowcaseEnabled, isAppShowcaseDevEnabled } from "@/lib/appShowcaseConfig";
import { getSettings } from "@/lib/storage";

const STORAGE_KEY = "@mavrixfy_app_showcase_prompt_v1";
const COOLDOWN_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days between showcase prompts
const MAX_SHOW_COUNT = 2; // Maximum times shown per account
const PROMPT_DELAY_MS = 3000; // 3 seconds official showcase delay
let shownThisSession = false;

const isDev = typeof __DEV__ !== "undefined" && Boolean(__DEV__);

type ShowcasePromptListener = (visible: boolean) => void;
const modalListeners = new Set<ShowcasePromptListener>();

export function subscribeAppShowcaseModal(listener: ShowcasePromptListener): () => void {
  modalListeners.add(listener);
  return () => {
    modalListeners.delete(listener);
  };
}

export function dismissAppShowcaseModal(): void {
  modalListeners.forEach((listener) => listener(false));
}

export function triggerAppShowcaseModal(): void {
  modalListeners.forEach((listener) => listener(true));
}

export function useAppShowcasePrompt(ready: boolean): void {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      // 1. Guard against unready state or web platform
      if (!ready || Platform.OS === "web") return;

      let active = true;
      const initialScope = getAccountScope();
      const canPresent = () => active && isCurrentAccount(initialScope) && AppState.currentState === "active";

      const timer = setTimeout(() => {
        void (async () => {
          if (!canPresent()) return;

          // Do not prompt when the best-available quality preference is selected.
          const settings = await getSettings();
          if (settings.streamingQuality === "high") {
            return;
          }

          if (!canPresent() || !isAppShowcaseEnabled()) return;

          // 4. Official frequency limit & cooldown check (bypassed only when devEnabled is true in Firestore)
          const key = accountStorageKey(STORAGE_KEY, initialScope.accountId);
          const raw = await AsyncStorage.getItem(key);
          const history = raw ? JSON.parse(raw) : { count: 0, lastShownAt: 0 };
          const count = Number.isSafeInteger(history?.count) && history.count >= 0 ? history.count : 0;
          const lastShownAt = typeof history?.lastShownAt === "number" && Number.isFinite(history.lastShownAt) ? history.lastShownAt : 0;

          if (!isDev || !isAppShowcaseDevEnabled()) {
            if (shownThisSession) return;
            if (count >= MAX_SHOW_COUNT) return;
            if (Date.now() - lastShownAt < COOLDOWN_INTERVAL_MS) return;
          }

          // 5. Lifecycle state guard before presenting
          if (!canPresent()) {
            return;
          }

          // Mark session shown and persist history
          shownThisSession = true;
          await AsyncStorage.setItem(
            key,
            JSON.stringify({
              count: count + 1,
              lastShownAt: Date.now(),
            }),
          );

          if (!canPresent()) return;

          if (modalListeners.size > 0) {
            triggerAppShowcaseModal();
          } else {
            Alert.alert(
              "Mavrixfy Showcase",
              "Discover new features and updates.",
              [
                { text: "Later", style: "cancel" },
                {
                  text: "Open",
                  onPress: () => {
                    router.push("/profile/streaming-downloads");
                  },
                },
              ],
            );
          }
        })().catch(() => {}); // Storage failures must not reject a Home focus effect.
      }, PROMPT_DELAY_MS);

      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [ready, router])
  );
}
