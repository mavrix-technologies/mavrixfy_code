import AddSongsBottomSheet from "@/components/AddSongsModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import QueueBottomSheet from "@/components/QueueBottomSheet";
import { ShareModal } from "@/components/ShareModal";
import Colors from "@/constants/colors";
import { AuthProvider,useAuth } from "@/contexts/AuthContext";
import { DownloadProvider } from "@/contexts/DownloadContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { globalAddSongsSheetRef } from "@/lib/addSongsSheetRef";
import { logAppOpen } from "@/lib/analytics";
import { GUEST_LOGIN_ENABLED } from "@/lib/authFeatures";
import { initializeMobileAds } from "@/lib/googleMobileAds";
import { getCachedHomePublicPlaylists } from "@/lib/homeCache";
import { logger } from "@/lib/logger";
import * as Animated from "@/lib/nativeAnimated";
import { queryClient } from "@/lib/query-client";
import { globalQueueSheetRef } from "@/lib/queueRef";
import { initRemoteConfig } from "@/lib/remoteConfig";
import { getRecentlyPlayed,runOneTimeMigrations } from "@/lib/storage";
import { showAppLaunchAd } from "@/services/ads/appLaunchAdService";
import { syncEqualizerWithNative } from "@/services/audio/audioEqualizer";
import { YouTubePoTokenHost } from "@/services/youtube/YouTubePoTokenHost";
import { checkAppVersion,registerForPushNotificationsAsync } from "@/services/notificationService";
import { showGlobalToast,subscribeGlobalToast,type ToastAction } from "@/utils/globalToast";
import { runAfterIdle } from "@/utils/idleTask";
import { Anton_400Regular } from "@expo-google-fonts/anton";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useFonts } from "expo-font";
import { DarkTheme,Stack,ThemeProvider,useRouter,useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback,useEffect,useState } from "react";
import {
LogBox,
Linking,
Platform,
Pressable,
StyleSheet,
Text,
View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MD3DarkTheme,PaperProvider } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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


}

LogBox.ignoreLogs([
  "expo-notifications functionality is not fully supported in Expo Go",
  "expo-notifications: Android Push notifications",
  "Unable to activate keep awake",
  "setBackgroundColorAsync",
]);

export const unstable_settings = { anchor: "(tabs)" };

const NAV_UNMOUNT_SEGMENTS = new Set(["login", "onboarding", "import-songs", "profile", "delete-account"]);
const NAV_OVERLAY_SEGMENTS = new Set(["playlist", "artist", "downloads", "downloaded-songs"]);

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
  const [opacity] = useState(() => new Animated.Value(0));
  const [message, setMessage] = useState("Added to queue");
  const [visible, setVisible] = useState(false);
  const [action, setAction] = useState<ToastAction>();

  const showToast = useCallback((nextMessage: string, nextAction?: ToastAction) => {
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
    setMessage(nextMessage);
    setAction(nextAction);
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
      Animated.delay(action ? 8000 : GLOBAL_TOAST_VISIBLE_MS),
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
  }, [visible, message, opacity, action]);

  if (!visible) return null;

  const translateY = opacity.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
    extrapolate: "clamp",
  });

  return (
    <View pointerEvents="box-none" style={[styles.toastHost, { bottom: Math.max(142, insets.bottom + 126) }]}>
      <Animated.View
        style={[
          styles.toast,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Ionicons name={action ? "information-circle" : "checkmark-circle"} size={16} color={Colors.primary} />
        <Text style={styles.toastText}>{message}</Text>
        {action && <Pressable accessibilityRole="link" accessibilityLabel={action.label}
          style={{ minHeight: 44, justifyContent: "center" }}
          onPress={() => {
            setVisible(false);
            void Linking.openURL(action.url).catch(() => showGlobalToast("Could not open YouTube."));
          }}>
          <Text style={{ color: Colors.primary, fontWeight: "600" }}>{action.label}</Text>
        </Pressable>}
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
      runAfterIdle(() => {
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

// The route hosts one shared gesture-driven player surface on both platforms.
const playerScreenOptions = {
  presentation: "transparentModal" as const,
  animation: "none" as const,
  gestureEnabled: false,
  contentStyle: { backgroundColor: "transparent" },
};

const queueScreenOptions = {
  presentation: "formSheet" as const,
  animation: "slide_from_bottom" as const,
  animationDuration: 250,
  sheetAllowedDetents: [1],
  sheetGrabberVisible: true,
  sheetCornerRadius: 24,
  contentStyle: { backgroundColor: "#1E1E1E" },
};

const songOptionsScreenOptions = {
  presentation: isAndroid ? ("transparentModal" as const) : ("formSheet" as const),
  animation: isAndroid ? ("none" as const) : ("slide_from_bottom" as const),
  animationDuration: 220,
  sheetAllowedDetents: [0.88, 1],
  sheetCornerRadius: 24,
  contentStyle: { backgroundColor: isAndroid ? "transparent" : "#1E1E1E" },
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
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      hideSplashScreenSafely("authReady");
      const timer = setTimeout(() => {
        void showAppLaunchAd();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [loading]);

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
        <Stack.Screen name="player" options={playerScreenOptions} dangerouslySingular />
        <Stack.Screen name="queue" options={queueScreenOptions} />
        <Stack.Screen name="song-options" options={songOptionsScreenOptions} />
        <Stack.Screen name="artist-mix" options={artistMixScreenOptions} />
        <Stack.Screen name="downloaded-songs" />
        <Stack.Screen name="downloads" />
        <Stack.Screen name="playlist" />
        <Stack.Screen name="artist" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="profile/[section]" />
        <Stack.Screen name="login" />
        <Stack.Screen name="equalizer" />
      </Stack>

      {showNavOverlay ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 997 }]} pointerEvents="box-none">
          <AppNavBar />
        </View>
      ) : null}

      <YouTubePoTokenHost />

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
    void syncEqualizerWithNative();
    if (Platform.OS === "android") {
      try {
        const SystemUI = require("expo-system-ui");
        SystemUI.setBackgroundColorAsync?.(Colors.background)?.catch?.(() => { });
      } catch {
        // SystemUI not available in current environment
      }
    }
  }, []);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    BebasNeue_400Regular,
    Anton_400Regular,
    ...Ionicons.font,
    ...MaterialIcons.font,
    ...MaterialCommunityIcons.font,
    ...Feather.font,
    ...FontAwesome.font,
  });

  const handleError = useCallback((err: Error) => {
    hideSplashScreenSafely("rootError");
    setError(err);
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background, padding: 20 }}>
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
                      <ShareModal />
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
    flexShrink: 1,
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
