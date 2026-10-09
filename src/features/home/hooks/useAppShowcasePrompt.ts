import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert, AppState, Platform } from "react-native";
import {
  accountStorageKey,
  getAccountScope,
} from "@/lib/accountScope";
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

      const timer = setTimeout(() => {
        void (async () => {
          if (!active) return;

          const currentScope = getAccountScope();
          // Ensure account scope has not changed while waiting
          if (
            initialScope.accountId !== null &&
            currentScope.accountId !== null &&
            initialScope.accountId !== currentScope.accountId
          ) {
            return;
          }

          // 2. Check Streaming Quality: If user is ALREADY on 320 kbps (high), NEVER show!
          const settings = await getSettings();
          if (settings.streamingQuality === "high") {
            return;
          }

          // 3. Remote master toggle & Remote Dev Testing flag strictly from Firestore
          let isPromptEnabled = true;
          let isDevRemoteTesting = false;
          try {
            const { isAppShowcaseEnabled, isAppShowcaseDevEnabled } = require("@/lib/appShowcaseConfig");
            isPromptEnabled = isAppShowcaseEnabled();
            isDevRemoteTesting = isAppShowcaseDevEnabled();
          } catch {
            // Guarded for non-mocked/standalone test environments
          }

          if (!isPromptEnabled) {
            return;
          }

          // 4. Official frequency limit & cooldown check (bypassed only when devEnabled is true in Firestore)
          const key = accountStorageKey(STORAGE_KEY, currentScope.accountId);
          const raw = await AsyncStorage.getItem(key);
          const history = raw ? JSON.parse(raw) : { count: 0, lastShownAt: 0 };

          if (!isDev || !isDevRemoteTesting) {
            if (shownThisSession) return;
            if (history.count >= MAX_SHOW_COUNT) return;
            if (Date.now() - history.lastShownAt < COOLDOWN_INTERVAL_MS) return;
          }

          // 5. Lifecycle state guard before presenting
          if (!active || AppState.currentState !== "active") {
            return;
          }

          // Mark session shown and persist history
          shownThisSession = true;
          await AsyncStorage.setItem(
            key,
            JSON.stringify({
              count: history.count + 1,
              lastShownAt: Date.now(),
            }),
          );

          if (!active || AppState.currentState !== "active") return;

          if (modalListeners.size > 0) {
            modalListeners.forEach((listener) => listener(true));
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
        })();
      }, PROMPT_DELAY_MS);

      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [ready, router])
  );
}
