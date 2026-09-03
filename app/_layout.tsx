import * as Animated from "@/lib/nativeAnimated";
import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  InteractionManager,
  LogBox,
  Platform,
  StyleSheet,
  View,
  Text,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons, MaterialIcons, MaterialCommunityIcons, Feather, FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MD3DarkTheme, PaperProvider } from "react-native-paper";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Constants from "expo-constants";
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
import { GUEST_LOGIN_ENABLED } from "@/lib/authFeatures";
import QueueBottomSheet from "@/components/QueueBottomSheet";
import { globalQueueSheetRef } from "@/lib/queueRef";
import AddSongsBottomSheet from "@/components/AddSongsModal";
import { globalAddSongsSheetRef } from "@/lib/addSongsSheetRef";
import { logger } from "@/lib/logger";
import { initializeMobileAds } from "@/lib/googleMobileAds";
import { initRemoteConfig } from "@/lib/remoteConfig";
import { showGlobalToast, subscribeGlobalToast } from "@/utils/globalToast";
import { checkAppVersion, registerForPushNotificationsAsync } from "@/services/notificationService";
import { AppNavBar } from "./(tabs)/_layout";
import PlayerScreen from "@/features/player/screens/PlayerScreen";

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
  "Unable to activate keep awake",
  "setBackgroundColorAsync",
  "The action 'GO_BACK' was not handled by any navigator",
]);

const NAV_UNMOUNT_SEGMENTS = new Set(["login", "onboarding", "import-songs", "downloads", "profile", "delete-account"]);
const NAV_OVERLAY_SEGMENTS = new Set(["playlist", "artist"]);

const GLOBAL_TOAST_VISIBLE_MS = 1050;

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
let preWarmStarted = false;
// react-doctor-disable-next-line react-doctor/only-export-components -- intentional cache pre-warm export
export function preWarmHomeCache() {
  if (preWarmStarted) return;
  preWarmStarted = true;
  Promise.allSettled([
    getCachedHomePublicPlaylists({ allowStale: true }),
    getRecentlyPlayed(),
    runOneTimeMigrations(),
    initializeMobileAds(),
  ]).catch(() => { });
}

function useRootLayoutNavigation() {
  useScreenTracking();
  const { replace: routerReplace } = useRouter();
  const segments = useSegments();
  const { loading, isAuthenticated, isGuest, firebaseUser } = useAuth();
  const isAllowedGuest = GUEST_LOGIN_ENABLED && isGuest;

  // ── App Startup & Version Check Sequence ────────────────────────────────────
  useEffect(() => {
    if (loading) return;

    let isActive = true;

    const run = async () => {
      if (!isActive) return;

      if (firebaseUser?.uid) {
        void registerForPushNotificationsAsync(firebaseUser.uid);
      }

      const versionInfo = await checkAppVersion().catch(() => null);
      if (versionInfo?.hasUpdate && isActive) {
        try { routerReplace("/force-update" as any); } catch { /* ignore */ }
      }
    };

    const timer = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        run().catch((err) => logger.error("[Layout] Startup check failed:", err));
      });
    }, 3000);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [loading, firebaseUser?.uid, routerReplace]);

  useEffect(() => {
    if (loading) return;

    const seg0 = segments[0] as string | undefined;
    const inProtected = seg0 === "(tabs)";
    const inAuthOnly = seg0 === "login";

    if (isAuthenticated && inAuthOnly) {
      routerReplace("/(tabs)");
    } else if (!isAuthenticated && !isAllowedGuest && inProtected) {
      routerReplace("/login");
    }
  }, [loading, isAuthenticated, isAllowedGuest, segments, routerReplace]);

  const activeSegment = segments[0] as string;
  const unmountNavBar = NAV_UNMOUNT_SEGMENTS.has(activeSegment);
  const isPlayerScreen = activeSegment === "player";
  const showNavOverlay =
    !loading &&
    (isAuthenticated || isAllowedGuest) &&
    !unmountNavBar &&
    !isPlayerScreen &&
    NAV_OVERLAY_SEGMENTS.has(activeSegment);

  useEffect(() => {
    if (unmountNavBar) {
      globalQueueSheetRef.current?.collapse();
    }
  }, [unmountNavBar]);

  return { showNavOverlay };
}

const isAndroid = Platform.OS === "android";

const playerScreenOptions = {
  presentation: "transparentModal" as const,
  animation: "slide_from_bottom" as const,
  animationDuration: 250,
  contentStyle: { backgroundColor: "transparent" },
};

const queueScreenOptions = {
  presentation: isAndroid ? ("transparentModal" as const) : ("modal" as const),
  animation: "slide_from_bottom" as const,
  animationDuration: 250,
  contentStyle: { backgroundColor: isAndroid ? "transparent" : "#1E1E1E" },
};

const songOptionsScreenOptions = {
  presentation: isAndroid ? ("transparentModal" as const) : ("formSheet" as const),
  animation: isAndroid ? ("none" as const) : ("slide_from_bottom" as const),
  animationDuration: 220,
  sheetAllowedDetents: [0.88, 1],
  sheetCornerRadius: 24,
  contentStyle: { backgroundColor: isAndroid ? "transparent" : "#1E1E1E" },
};

const sleepTimerScreenOptions = {
  presentation: isAndroid ? ("transparentModal" as const) : ("formSheet" as const),
  animation: isAndroid ? ("none" as const) : ("slide_from_bottom" as const),
  animationDuration: 220,
  sheetAllowedDetents: [0.62],
  sheetCornerRadius: 24,
  contentStyle: { backgroundColor: isAndroid ? "transparent" : Colors.background },
};

const artistMixScreenOptions = {
  presentation: isAndroid ? ("formSheet" as const) : ("card" as const),
  ...(isAndroid && {
    sheetAllowedDetents: [1],
    sheetCornerRadius: 24,
  }),
};

function RootLayoutNav() {
  const { showNavOverlay } = useRootLayoutNavigation();

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: "slide_from_right",
          animationDuration: 240,
          freezeOnBlur: true,
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="player" options={playerScreenOptions} />
        <Stack.Screen name="queue" options={queueScreenOptions} />
        <Stack.Screen name="song-options" options={songOptionsScreenOptions} />
        <Stack.Screen name="sleep-timer" options={sleepTimerScreenOptions} />
        <Stack.Screen name="artist-mix" options={artistMixScreenOptions} />
        <Stack.Screen name="downloaded-songs" />
        <Stack.Screen name="downloads" />
        <Stack.Screen name="playlist" />
        <Stack.Screen name="artist" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="login" />
      </Stack>

      {showNavOverlay ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 997 }]} pointerEvents="box-none">
          <AppNavBar />
        </View>
      ) : null}

      {/* Global Player Overlay — always mounted globally above all screens (tabs, playlist, artist, etc.) */}
      <PlayerScreen />

      <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="box-none">
        <QueueBottomSheet ref={globalQueueSheetRef} />
        <AddSongsBottomSheet ref={globalAddSongsSheetRef} />
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    void initRemoteConfig();
    void logAppOpen();
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
    ...Ionicons.font,
    ...MaterialIcons.font,
    ...MaterialCommunityIcons.font,
    ...Feather.font,
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      hideSplashScreenSafely("fontsLoaded");
    }
  }, [fontsLoaded]);

  const handleError = useCallback((err: Error) => {
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
    setError(err);
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#05070A", padding: 20 }}>
        <Text style={{ color: "#ff0000", fontSize: 20, marginBottom: 10 }}>Error Loading App</Text>
        <Text style={{ color: "#fff", fontSize: 14 }}>{error.message}</Text>
      </View>
    );
  }

  if (!fontsLoaded) {
    return null;
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
});
