import AddSongsBottomSheet from "@/components/AddSongsModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import QueueBottomSheet from "@/components/QueueBottomSheet";
import { ShareModal } from "@/components/ShareModal";
import Colors from "@/constants/colors";
import { LaunchSplash } from "@/features/launch/LaunchSplash";
import { hideNativeSplash } from "@/features/launch/nativeSplash";
import { AuthProvider,useAuth } from "@/contexts/AuthContext";
import { DownloadProvider } from "@/contexts/DownloadContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { globalAddSongsSheetRef } from "@/lib/addSongsSheetRef";
import { logAppOpen } from "@/lib/analytics";
import { GUEST_LOGIN_ENABLED } from "@/lib/authFeatures";
import { logger } from "@/lib/logger";
import * as Animated from "@/lib/nativeAnimated";
import { queryClient } from "@/lib/query-client";
import { globalQueueSheetRef } from "@/lib/queueRef";
import { initRemoteConfig } from "@/lib/remoteConfig";
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
import { useFonts } from "expo-font";
import { DarkTheme,Stack,ThemeProvider,useRouter,useSegments } from "expo-router";
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
type LayoutChangeEvent,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MD3DarkTheme,PaperProvider } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

LogBox.ignoreLogs([
  "Unable to activate keep awake",
  "setBackgroundColorAsync",
]);

export const unstable_settings = { anchor: "(tabs)" };

const NAV_UNMOUNT_SEGMENTS = new Set(["login", "onboarding", "import-songs", "profile", "delete-account"]);

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
            void Linking.openURL(action.url).catch(() => showGlobalToast("Could not open the link."));
          }}>
          <Text style={{ color: Colors.primary, fontWeight: "600" }}>{action.label}</Text>
        </Pressable>}
      </Animated.View>
    </View>
  );
}

function useRootLayoutNavigation(launchComplete: boolean) {
  useScreenTracking();
  const { replace: routerReplace } = useRouter();
  const segments = useSegments();
  const { loading, isAuthenticated, isGuest, firebaseUser } = useAuth();
  const isAllowedGuest = GUEST_LOGIN_ENABLED && isGuest;

  // ── App Startup & Version Check Sequence ────────────────────────────────────
  useEffect(() => {
    if (loading || !launchComplete) return;

    let isActive = true;
    let cancelIdle: (() => void) | undefined;

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
      cancelIdle = runAfterIdle(() => {
        run().catch((err) => logger.error("[Layout] Startup check failed:", err));
      });
    }, 3000);

    return () => {
      isActive = false;
      clearTimeout(timer);
      cancelIdle?.();
    };
  }, [loading, launchComplete, firebaseUser?.uid, routerReplace]);

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

  useEffect(() => {
    if (unmountNavBar) {
      globalQueueSheetRef.current?.collapse();
    }
  }, [unmountNavBar]);

  const redirectPending = (isAuthenticated && activeSegment === "login") ||
    (!isAuthenticated && !isAllowedGuest && activeSegment === "(tabs)");
  return { launchReady: !loading && !!activeSegment && !redirectPending };
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

function RootLayoutNav({ launchComplete, onReady }: { launchComplete: boolean; onReady: () => void }) {
  const { launchReady } = useRootLayoutNavigation(launchComplete);
  const { loading } = useAuth();
  const [navigationLaidOut, setNavigationLaidOut] = useState(false);
  const markNavigationLaidOut = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width > 0 && layout.height > 0) setNavigationLaidOut(true);
  }, []);

  useEffect(() => {
    if (launchReady && navigationLaidOut) onReady();
  }, [launchReady, navigationLaidOut, onReady]);

  useEffect(() => {
    if (!loading && launchComplete) {
      const timer = setTimeout(() => {
        void showAppLaunchAd();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [loading, launchComplete]);

  return (
    <View style={{ flex: 1 }} onLayout={markNavigationLaidOut} accessibilityElementsHidden={!launchComplete}
      importantForAccessibility={launchComplete ? "auto" : "no-hide-descendants"}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: "slide_from_right",
          animationDuration: 240,
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
  // Owned above AuthProvider's keyed subtree: signing in must not replay startup.
  const [launchReady, setLaunchReady] = useState(false);
  const [launchComplete, setLaunchComplete] = useState(false);
  const markLaunchReady = useCallback(() => setLaunchReady(true), []);
  const finishLaunch = useCallback(() => setLaunchComplete(true), []);

  useEffect(() => {
    if (Platform.OS === "android") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Load optional Android SystemUI inside its platform guard.
        const SystemUI = require("expo-system-ui");
        SystemUI.setBackgroundColorAsync?.(Colors.background)?.catch?.(() => { });
      } catch {
        // SystemUI not available in current environment
      }
    }
  }, []);

  useEffect(() => {
    if (!launchComplete) return;
    return runAfterIdle(() => {
      void initRemoteConfig();
      void logAppOpen();
      void syncEqualizerWithNative();
    });
  }, [launchComplete]);

  const [fontsLoaded, fontError] = useFonts({
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
    void hideNativeSplash("rootError");
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

  return (
    <ErrorBoundary onError={handleError}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ThemeProvider value={DarkTheme}>
            <PaperProvider theme={paperTheme}>
              <NetworkProvider>
                <AuthProvider>
                  {(fontsLoaded || fontError) ? (
                    <DownloadProvider>
                      <PlayerProvider>
                        <RootLayoutNav launchComplete={launchComplete} onReady={markLaunchReady} />
                        <GlobalToast />
                        <ShareModal />
                      </PlayerProvider>
                    </DownloadProvider>
                  ) : null}
                </AuthProvider>
              </NetworkProvider>
            </PaperProvider>
          </ThemeProvider>
          <StatusBar style="light" />
          {!launchComplete && <LaunchSplash ready={launchReady} onComplete={finishLaunch} />}
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
