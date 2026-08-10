import * as Animated from "@/lib/nativeAnimated";
import {
  QueryClientProvider
} from "@tanstack/react-query";
import {
  DarkTheme,
  ThemeProvider
} from "@react-navigation/native";
import {
  Stack,
  useRouter,
  useSegments,
  router
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as SplashScreen from "expo-splash-screen";
import React,
{
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import {
  InteractionManager,
  LogBox,
  Platform,
  StyleSheet,
  View,
  Text,
  Pressable,
  AppState
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MD3DarkTheme, PaperProvider, Modal, Portal } from "react-native-paper";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Image } from "expo-image";
import { queryClient } from "@/lib/query-client";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DownloadProvider } from "@/contexts/DownloadContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import Colors from "@/constants/colors";
import { logAppOpen } from "@/lib/analytics";
import { getCachedHomePublicPlaylists } from "@/lib/homeCache";
import { getRecentlyPlayed, runOneTimeMigrations } from "@/lib/storage";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { MUSIC_PROVIDER_KEY } from "@/data/providers/IMusicProvider";
import { AUDIO_ENGINE_KEY } from "@/services/audio/IAudioEngine";
import { EmptyState, LoadingScreen, PressableRow, ScreenHeader } from "@/components";
import { GUEST_LOGIN_ENABLED } from "@/lib/authFeatures";
import QueueBottomSheet from "@/components/QueueBottomSheet";
import { globalQueueSheetRef } from "@/lib/queueRef";
import AddSongsBottomSheet from "@/components/AddSongsModal";
import { globalAddSongsSheetRef } from "@/lib/addSongsSheetRef";
import { logger } from "@/lib/logger";
import { AppNavBar } from "./(tabs)/_layout";

function isExpoGoRuntime(): boolean {
  return Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";
}

let splashPrevented = false;
let splashPreventFailed = false;
let splashHideRequested = false;

function isMissingNativeSplashError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("No native splash screen registered");
}

void SplashScreen.preventAutoHideAsync()
  .then(() => {
    splashPrevented = true;
  })
  .catch((error) => {
    splashPreventFailed = true;
    if (!isMissingNativeSplashError(error)) {
      logger.warn("[RootLayout] Failed to prevent splash auto-hide", error);
    }
  });

function hideSplashScreenSafely(reason: string) {
  if (splashHideRequested || splashPreventFailed) return;
  if (!splashPrevented) {
    setTimeout(() => hideSplashScreenSafely(reason), 50);
    return;
  }

  splashHideRequested = true;
  try {
    void SplashScreen.hideAsync().catch((error) => {
      if (!isMissingNativeSplashError(error)) {
        logger.warn("[RootLayout] Failed to hide splash screen", { reason, error });
      }
    });
  } catch (error) {
    if (!isMissingNativeSplashError(error)) {
      logger.warn("[RootLayout] Failed to hide splash screen", { reason, error });
    }
  }
}

if (!isExpoGoRuntime()) {
  SplashScreen.setOptions({ fade: false, duration: 0 });
}

// Filter out noisy expo-notifications warnings in the terminal console when testing in Expo Go
if (__DEV__) {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (
      args[0] &&
      typeof args[0] === "string" &&
      args[0].includes("expo-notifications")
    ) {
      return;
    }
    originalWarn(...args);
  };

  const originalError = console.error;
  console.error = (...args) => {
    if (
      args[0] &&
      typeof args[0] === "string" &&
      (args[0].includes("expo-notifications") ||
        args[0].includes("GO_BACK") ||
        args[0].includes("was not handled by any navigator"))
    ) {
      return;
    }
    originalError(...args);
  };
}

LogBox.ignoreLogs([
  "expo-notifications functionality is not fully supported in Expo Go",
  "expo-notifications: Android Push notifications",
  // expo-av triggers keep-awake internally; this fails during hot reload when
  // the activity briefly detaches. Harmless in production builds.
  "Unable to activate keep awake",
  // Same activity-detach race on hot reload — not a real error in production.
  "setBackgroundColorAsync",
  "The action 'GO_BACK' was not handled by any navigator",
]);

const NAV_UNMOUNT_SEGMENTS = new Set(["login", "onboarding", "import-songs", "downloads", "profile", "delete-account", "notifications"]);
const NAV_OVERLAY_SEGMENTS = new Set(["playlist", "artist"]);

import { showGlobalToast, subscribeGlobalToast } from "@/utils/globalToast";

const GLOBAL_TOAST_VISIBLE_MS = 1050;

function parseAppVersion(version: string) {
  return version
    .split(".")
    .map(Number)
    .reduce((acc, part, index) => acc + part * 10 ** (6 - index * 2), 0);
}

const IOS_VERTICAL_SHEET_OPTIONS = {
  presentation: "card" as const,
  animation: "slide_from_bottom" as const,
  animationMatchesGesture: true,
  gestureEnabled: true,
  gestureDirection: "vertical" as const,
  fullScreenGestureEnabled: true,
  contentStyle: { backgroundColor: Colors.background },
};

const paperTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    surface: Colors.surface,
    surfaceVariant: Colors.surfaceLight,
    onSurface: Colors.text,
    onSurfaceVariant: Colors.subtext,
  },
};

export { showGlobalToast };

function GlobalToast() {
  const insets = useSafeAreaInsets();
  const opacityRef = useRef<Animated.Value | null>(null);
  if (opacityRef.current === null) opacityRef.current = new Animated.Value(0);
  const opacity = opacityRef.current;
  const [message, setMessage] = useState("Added to queue");
  const [visible, setVisible] = useState(false);

  const showToast = useCallback((nextMessage: string) => {
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
    setMessage(nextMessage);
    setVisible(true);
  }, []);

  useEffect(() => {
    return subscribeGlobalToast(showToast);
  }, [showToast]);

  useEffect(() => {
    if (!visible) return;

    opacity.stopAnimation();
    opacity.setValue(0);

    const animation = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 120,
        isInteraction: false,
        useNativeDriver: true,
      }),
      Animated.delay(GLOBAL_TOAST_VISIBLE_MS),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        isInteraction: false,
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        setVisible(false);
      }
    });

    return () => {
      animation.stop();
    };
  }, [visible, message, opacity]);

  if (!visible) return null;

  const translateY = opacity.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
    extrapolate: "clamp",
  });

  return (
    <View pointerEvents="none" style={[styles.toastHost, { bottom: Math.max(142, insets.bottom + 126) }]}>
      <Animated.View
        style={[
          styles.toast,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
        <Text style={styles.toastText}>{message}</Text>
      </Animated.View>
    </View>
  );
}


// ─── Background content pre-warm ─────────────────────────────────────────────
// Kick off cache reads as early as possible so the home screen has data
// ready the moment it mounts — no waiting spinner for returning users.
let preWarmStarted = false;
// react-doctor-disable-next-line react-doctor/only-export-components -- intentional cache pre-warm export
export function preWarmHomeCache() {
  if (preWarmStarted) return;
  preWarmStarted = true;
  // Fire-and-forget — results land in AsyncStorage / memory cache
  // Also run one-time migrations to clean up stale data from old app versions
  Promise.allSettled([
    getCachedHomePublicPlaylists({ allowStale: true }),
    getRecentlyPlayed(),
    runOneTimeMigrations(),
  ]).catch(() => { });
}

function useRootLayoutNavigation() {
  useScreenTracking();
  const { replace: routerReplace } = useRouter();
  const segments = useSegments();
  const { loading, isAuthenticated, isGuest, firebaseUser } = useAuth();
  const isAllowedGuest = GUEST_LOGIN_ENABLED && isGuest;
  useEffect(() => {
    hideSplashScreenSafely("instant_mount");
  }, []);

  // ── Enterprise Notification Startup Sequence ────────────────────────────────
  // Runs once after auth resolves. Handles:
  //  1. Device registration (token + version + language + timezone → Firestore)
  //  2. Firestore activity feed sync
  //  3. Version check (force update / optional update)
  //  4. Notification listeners (foreground receive + tap → Activity store)
  useEffect(() => {
    if (loading) return;

    let isActive = true;
    let cleanupListeners: (() => void) | undefined;

    const run = async () => {
      const [notificationService, notificationStore] = await Promise.all([
        import("@/services/notificationService"),
        import("@/stores/notificationStore"),
      ]);
      const { registerForPushNotificationsAsync, registerNotificationListeners, checkAppVersion } =
        notificationService;
      const { addNotification, syncFromFirestore, loadNotifications } = notificationStore;

      if (!isActive) return;

      // Step 1 — Load local notification cache immediately
      await loadNotifications();

      // Step 2 — Register device (token + metadata) for authenticated users
      if (firebaseUser?.uid) {
        void registerForPushNotificationsAsync(firebaseUser.uid);
        // Step 3 — Sync activity feed from Firestore
        void syncFromFirestore(firebaseUser.uid);
      }

      // Step 4 — Version check (non-blocking)
      const versionInfo = await checkAppVersion().catch(() => null);
      if (versionInfo?.forceUpdate && isActive) {
        // Navigate to force update screen
        try { routerReplace("/force-update" as any); } catch { /* ignore */ }
        return;
      }

      // Step 5 — Notification listeners
      cleanupListeners = registerNotificationListeners(
        // Foreground received → add to Activity store
        (notification) => {
          const content = notification.request.content;
          const data = content.data as Record<string, string> | null;
          const notificationId = data?.notificationId ?? notification.request.identifier;
          void addNotification(
            content.title ?? "Mavrixfy",
            content.body ?? "",
            (data?.type as any) ?? "system",
            {
              deeplink: data?.route ?? undefined,
              notificationId,
              imageUrl: data?.imageUrl ?? undefined,
              minAppVersion: data?.minAppVersion ?? undefined,
              maxAppVersion: data?.maxAppVersion ?? undefined,
            },
            firebaseUser?.uid
          );
        },
        // Tap / click → add as read + deep link
        (response) => {
          const content = response.notification.request.content;
          const data = content.data as Record<string, string> | null;
          const notificationId = data?.notificationId ?? response.notification.request.identifier;

          // Add to activity feed (will dedup by notificationId)
          void addNotification(
            content.title ?? "Mavrixfy",
            content.body ?? "",
            (data?.type as any) ?? "system",
            {
              deeplink: data?.route ?? undefined,
              notificationId,
              minAppVersion: data?.minAppVersion ?? undefined,
              maxAppVersion: data?.maxAppVersion ?? undefined,
            },
            firebaseUser?.uid
          );

          // Deep link routing
          const route = data?.route;
          if (route) {
            try { routerReplace(route as any); } catch (err) {
              logger.error("[Layout] Deep link navigation failed:", err);
            }
          }
        }
      );
    };

    // Delay slightly to not block first paint
    const timer = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        run().catch((err) => logger.error("[Layout] Notification startup failed:", err));
      });
    }, 3000);

    return () => {
      isActive = false;
      clearTimeout(timer);
      cleanupListeners?.();
    };
  }, [loading, firebaseUser?.uid, routerReplace]);

  useEffect(() => {
    if (loading) return;

    const seg0 = segments[0] as string | undefined;
    const inProtected = seg0 === "(tabs)";
    const inAuthOnly = seg0 === "login";
    const inOnboarding = seg0 === "onboarding";

    if (isAuthenticated && inAuthOnly) {
      if (firebaseUser) {
        import("firebase/firestore").then(({ doc, getDoc }) => {
          import("@/lib/firebase").then(({ db }) => {
            getDoc(doc(db, "users", firebaseUser.uid))
              .then((snap) => {
                if (snap.exists() && snap.data()?.onboardingCompleted) {
                  routerReplace("/(tabs)");
                } else {
                  routerReplace("/login");
                }
              })
              .catch(() => routerReplace("/(tabs)"));
          });
        });
      } else {
        routerReplace("/(tabs)");
      }
    } else if (!isAuthenticated && !isAllowedGuest && inProtected) {
      routerReplace("/login");
    } else if (!isAuthenticated && !isAllowedGuest && inOnboarding) {
      routerReplace("/login");
    }
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive auth/routing deps (loading, isAuthenticated, isAllowedGuest, firebaseUser, segments, routerReplace) are listed
  }, [loading, isAuthenticated, isAllowedGuest, firebaseUser, segments, routerReplace]);

  const activeSegment = segments[0] as string;
  const unmountNavBar = NAV_UNMOUNT_SEGMENTS.has(activeSegment);
  const isPlayerScreen = activeSegment === "player";
  const showNavOverlay =
    !loading &&
    (isAuthenticated || isAllowedGuest) &&
    !unmountNavBar &&
    !isPlayerScreen &&
    NAV_OVERLAY_SEGMENTS.has(activeSegment);

  // Close queue sheet when navigating to screens where it shouldn't appear
  useEffect(() => {
    if (unmountNavBar) {
      globalQueueSheetRef.current?.collapse();
    }
  }, [unmountNavBar]);

  return { showNavOverlay };
}

function RootLayoutNav() {
  const { showNavOverlay } = useRootLayoutNavigation();

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="player"
          options={{
            presentation: "transparentModal",
            animation: "slide_from_bottom",
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
        <Stack.Screen
          name="queue"
          options={{
            presentation: Platform.OS === "android" ? "transparentModal" : "modal",
            animation: "slide_from_bottom",
            contentStyle: { backgroundColor: Platform.OS === "android" ? "transparent" : "#1E1E1E" },
          }}
        />
        <Stack.Screen
          name="song-options"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.88, 1],
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: "#1E1E1E" },
          }}
        />
        <Stack.Screen
          name="sleep-timer"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.62],
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: Colors.background },
          }}
        />
        <Stack.Screen name="notifications" />
        <Stack.Screen
          name="artist-mix"
          options={{
            presentation: Platform.OS === "android" ? "formSheet" : "card",
            ...(Platform.OS === "android" && {
              sheetAllowedDetents: [1],
              sheetCornerRadius: 24,
            }),
          }}
        />
        <Stack.Screen name="downloaded-songs" />
        <Stack.Screen name="downloads" />
        <Stack.Screen name="playlist" />
        <Stack.Screen name="artist" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="login" />
      </Stack>

      {showNavOverlay ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 998 }]} pointerEvents="box-none">
          <AppNavBar />
        </View>
      ) : null}

      {/* Queue & Add Songs sheets are mounted at root level above AppNavBar (zIndex: 999) */}
      <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="box-none">
        <QueueBottomSheet ref={globalQueueSheetRef} />
        <AddSongsBottomSheet ref={globalAddSongsSheetRef} />
      </View>
      <InAppPromotionPopup />
    </View>
  );
}

function InAppPromotionPopup() {
  const { firebaseUser } = useAuth();
  const firebaseUserUid = firebaseUser?.uid;
  const firebaseUserCreationTime = firebaseUser?.metadata?.creationTime;
  const [activePopup, setActivePopup] = useState<any>(null);
  const storeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!firebaseUserUid) return;

    let isActive = true;

    const checkPopup = async () => {
      try {
        const { getNotifications } = await import("@/stores/notificationStore");
        const items = getNotifications();

        const creationTimeMs = firebaseUserCreationTime
          ? new Date(firebaseUserCreationTime).getTime()
          : 0;

        const currentVersion = Constants.expoConfig?.version ?? "0.0.0";

        // Fetch last time activity screen was opened
        const lastViewedStr = await AsyncStorage.getItem("@Mavrixfy:lastNotificationScreenViewed");
        const lastViewedTimeMs = lastViewedStr ? new Date(lastViewedStr).getTime() : 0;

        // Filter: only unread promotions/updates sent after user creation
        const campaignPromos = items.filter((n) => {
          if (n.type !== "promotion" && n.type !== "update") return false;
          if (n.read) return false;

          const notifTimeMs = new Date(n.timestamp).getTime();

          // Skip if this notification was already received before user opened the activity feed screen
          if (lastViewedTimeMs > 0 && notifTimeMs <= lastViewedTimeMs) {
            return false;
          }

          // If this is an update, bypass if the user's version is already >= target max version
          if (n.type === "update" && n.meta?.maxAppVersion) {
            try {
              const current = parseAppVersion(currentVersion);
              const maxTarget = parseAppVersion(n.meta.maxAppVersion);
              if (current >= maxTarget) {
                return false;
              }
            } catch (err) {
              logger.warn("[InAppPromotionPopup] Failed to parse version for popup skip:", err);
            }
          }

          // Skip notifications sent before the user was registered (with 5s clock buffer)
          if (creationTimeMs > 0 && notifTimeMs < creationTimeMs - 5000) {
            return false;
          }
          return true;
        });

        if (campaignPromos.length === 0) return;

        // Sort newest first to ensure we pick the most recent one
        campaignPromos.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const promo = campaignPromos[0];

        // Check if we have already shown a popup for this notification ID
        const seenKey = `@Mavrixfy:seenPopup:${promo.id}`;
        const seen = await AsyncStorage.getItem(seenKey);
        if (seen === "true") return;

        if (isActive) {
          setActivePopup(promo);
        }
      } catch (err) {
        logger.error("[InAppPromotionPopup] Error checking popups:", err);
      }
    };

    // Check on mount (app start)
    checkPopup();

    // Recheck only when user opens/reopens the app (transitions back to active)
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        checkPopup();
      }
    });

    return () => {
      isActive = false;
      subscription.remove();
    };
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive deps (firebaseUserCreationTime, firebaseUserUid) are listed; storeUrlRef and AsyncStorage are stable
  }, [firebaseUserCreationTime, firebaseUserUid]);

  useEffect(() => {
    storeUrlRef.current = null;
    if (activePopup?.type !== "update") {
      return;
    }

    let isActive = true;
    import("@/services/notificationService")
      .then(({ checkAppVersion }) => checkAppVersion())
      .then((info) => {
        if (isActive && info?.storeUrl) {
          storeUrlRef.current = info.storeUrl;
        }
      })
      .catch(() => { });

    return () => {
      isActive = false;
    };
  }, [activePopup?.id, activePopup?.type]);

  if (!activePopup) return null;

  const imageUri = activePopup.imageUrl || activePopup.meta?.imageUrl || activePopup.meta?.coverUrl;
  const isUpdate = activePopup.type === "update";

  const handleClose = async () => {
    try {
      const seenKey = `@Mavrixfy:seenPopup:${activePopup.id}`;
      const [{ markNotificationAsRead }] = await Promise.all([
        import("@/stores/notificationStore"),
        AsyncStorage.setItem(seenKey, "true"),
      ]);
      await markNotificationAsRead(activePopup.id, firebaseUserUid);
    } catch { }
    setActivePopup(null);
  };

  const handlePressCta = async () => {
    await handleClose();
    if (isUpdate) {
      const targetUrl = storeUrlRef.current || (Platform.OS === 'ios'
        ? "https://apps.apple.com/app/mavrixfy/id123456789"
        : "https://play.google.com/store/apps/details?id=com.mavrixfy.app");
      try {
        const { Linking } = await import("react-native");
        await Linking.openURL(targetUrl);
      } catch (err) {
        logger.error("[InAppPromotionPopup] Failed to open store URL:", err);
      }
    } else {
      const route = activePopup.meta?.route || activePopup.meta?.deeplink;
      if (route) {
        try {
          router.push(route as any);
        } catch (err) {
          logger.error("[InAppPromotionPopup] Navigation to deep link failed:", err);
        }
      }
    }
  };

  return (
    <Portal>
      <Modal
        visible={true}
        onDismiss={handleClose}
        contentContainerStyle={styles.popupModalContainer}
      >
        <View style={styles.popupCard}>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.popupImage} contentFit="cover" />
          )}
          <View style={styles.popupContent}>
            <Text style={styles.popupTitle}>{activePopup.title}</Text>
            <Text style={styles.popupBody}>{activePopup.body}</Text>

            <View style={styles.popupActions}>
              <Pressable style={styles.popupCloseBtn} onPress={handleClose}>
                <Text style={styles.popupCloseBtnText}>Close</Text>
              </Pressable>
              {(isUpdate || activePopup.meta?.route || activePopup.meta?.deeplink) && (
                <Pressable style={styles.popupCtaBtn} onPress={handlePressCta}>
                  <Text style={styles.popupCtaBtnText}>
                    {isUpdate ? "Update Now" : "Check Out"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </Portal>
  );
}

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [safetyTimeoutActive, setSafetyTimeoutActive] = useState(false);
  const fontsLoadedRef = useRef(false);

  // Set Android nav bar color inside the component so the activity is guaranteed
  // to be alive. Top-level module calls fire before the activity is ready on
  // hot reload and throw "current activity is no longer available".
  useEffect(() => {
    if (Platform.OS === "android") {
      SystemUI.setBackgroundColorAsync(Colors.background).catch(() => { });
    }
  }, []);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    fontsLoadedRef.current = fontsLoaded;
  }, [fontsLoaded]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSafetyTimeoutActive(true);
      if (!fontsLoadedRef.current) {
        logger.warn("[RootLayout] Safety timeout triggered. Proceeding without waiting for fonts/assets.");
      }
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    async function prepare() {
      try {
        void logAppOpen(); // fire-and-forget, no await
      } catch {
        // Silent fail
      } finally {
        setAppIsReady(true);
      }
    }

    if (fontsLoaded) {
      prepare();
    }
  }, [fontsLoaded]);

  const isReady = safetyTimeoutActive || (appIsReady && fontsLoaded);

  useEffect(() => {
    if (isReady) {
      hideSplashScreenSafely("isReady");
    }
  }, [isReady]);

  const handleError = useCallback((err: Error) => {
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
    setError(err);
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#05070A', padding: 20 }}>
        <Text style={{ color: '#ff0000', fontSize: 20, marginBottom: 10 }}>Error Loading App</Text>
        <Text style={{ color: '#fff', fontSize: 14 }}>{error.message}</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000", justifyContent: "center", alignItems: "center" }}>
        <Image
          source={require("@/assets/images/mavrixfy_icone.png")}
          style={{ width: 110, height: 110, borderRadius: 26 }}
          contentFit="contain"
        />
      </View>
    );
  }

  return (
    <ErrorBoundary onError={handleError}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ThemeProvider value={DarkTheme}>
            <PaperProvider theme={paperTheme}>
              <NetworkProvider>
                <AuthProvider>
                  <DownloadProvider>
                    <PlayerProvider>
                      <StatusBar style="light" />
                      <RootLayoutNav />
                      <GlobalToast />
                    </PlayerProvider>
                  </DownloadProvider>
                </AuthProvider>
              </NetworkProvider>
            </PaperProvider>
          </ThemeProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  toastHost: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    maxWidth: "78%",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "rgba(24, 28, 34, 0.96)",
    borderWidth: 1,
    borderColor: Colors.cardBorderStrong,
  },
  toastText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  popupModalContainer: {
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  popupCard: {
    width: "100%",
    backgroundColor: "#181C22",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  popupImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  popupContent: {
    padding: 20,
  },
  popupTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  popupBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    lineHeight: 20,
    marginBottom: 20,
  },
  popupActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  popupCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  popupCloseBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  popupCtaBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  popupCtaBtnText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#000000",
  },
});
