import * as Animated from "@/lib/nativeAnimated";
import {
  QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme,
  ThemeProvider } from "@react-navigation/native";
import { Stack,
  useRouter,
  useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React,
  { useCallback,
  useEffect,
  useRef,
  useState } from "react";
import { ActivityIndicator,
  InteractionManager,
  LogBox,
  Platform,
  StyleSheet,
  View,
  Text
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MD3DarkTheme, PaperProvider } from "react-native-paper";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DownloadProvider } from "@/contexts/DownloadContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import Colors from "@/constants/colors";
import { logAppOpen } from "@/lib/analytics";
import { getCachedHomePublicPlaylists } from "@/lib/homeCache";
import { getRecentlyPlayed } from "@/lib/storage";
import { AppNavBar } from "@/app/(tabs)/_layout";
import QueueBottomSheet from "@/components/QueueBottomSheet";
import { globalQueueSheetRef } from "@/lib/queueRef";
import { logger } from "@/lib/logger";

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
      args[0].includes("expo-notifications")
    ) {
      return;
    }
    originalError(...args);
  };
}

LogBox.ignoreLogs([
  "expo-notifications functionality is not fully supported in Expo Go",
  "expo-notifications: Android Push notifications",
]);

// Screens where the docked mini player and tab bar must not cover the route.
const NAV_UNMOUNT_SEGMENTS = new Set(["login", "onboarding", "import-songs", "downloads", "player", "profile", "delete-account"]);

// Set navigation bar color on Android
if (Platform.OS === "android") {
  SystemUI.setBackgroundColorAsync(Colors.background);
}

type GlobalToastListener = (message: string) => void;

const globalToastListeners = new Set<GlobalToastListener>();
const GLOBAL_TOAST_VISIBLE_MS = 1050;

const IOS_VERTICAL_SHEET_OPTIONS = {
  presentation: "card" as const,
  animation: "slide_from_bottom" as const,
  animationMatchesGesture: true,
  gestureEnabled: true,
  gestureDirection: "vertical" as const,
  fullScreenGestureEnabled: true,
  contentStyle: { backgroundColor: Colors.background },
};

const ANDROID_VERTICAL_SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  animation: "slide_from_bottom" as const,
  sheetAllowedDetents: [1.0],
  sheetInitialDetentIndex: 0,
  sheetCornerRadius: 32,
  sheetGrabberVisible: false,
  sheetExpandsWhenScrolledToEdge: false,
  gestureEnabled: true,
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

export function showGlobalToast(message = "Added to queue") {
  globalToastListeners.forEach((listener) => listener(message));
}

function subscribeGlobalToast(listener: GlobalToastListener) {
  globalToastListeners.add(listener);
  return () => {
    globalToastListeners.delete(listener);
  };
}

function GlobalToast() {
  const insets = useSafeAreaInsets();
  const opacityRef = useRef<Animated.Value | null>(null);
  if (opacityRef.current === null) opacityRef.current = new Animated.Value(0);
  const opacity = opacityRef.current;
  const [message, setMessage] = useState("Added to queue");
  const [visible, setVisible] = useState(false);

  const showToast = useCallback((nextMessage: string) => {
    opacity.stopAnimation();
    opacity.setValue(0);
    setMessage(nextMessage);
    setVisible(true);
    Animated.sequence([
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
    ]).start(({ finished }) => {
      if (finished) {
        setVisible(false);
      }
    });
  }, [opacity]);

  useEffect(() => {
    return subscribeGlobalToast(showToast);
  }, [showToast]);

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
export function preWarmHomeCache() {
  if (preWarmStarted) return;
  preWarmStarted = true;
  // Fire-and-forget — results land in AsyncStorage / memory cache
  Promise.allSettled([
    getCachedHomePublicPlaylists({ allowStale: true }),
    getRecentlyPlayed(),
  ]).catch(() => {});
}

function RootLayoutNav() {
  const { replace: routerReplace } = useRouter();
  const segments = useSegments();
  const { loading, isAuthenticated, isGuest, firebaseUser } = useAuth();

  // 1. Request notification permission after first paint so startup is not blocked.
  useEffect(() => {
    if (loading) return;

    let active = true;
    const timer = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        if (!active) return;
        import("@/services/notificationService")
          .then(({ requestNotificationPermission }) => {
            if (active) {
              requestNotificationPermission();
            }
          })
          .catch(err => logger.error("Failed to request permission:", err));
      });
    }, 5000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [loading]);

  // 2. Register push tokens in Firestore only for authenticated users
  useEffect(() => {
    let cleanupNotificationListeners: (() => void) | undefined;
    let isActive = true;

    import("@/services/notificationService")
      .then(({ registerForPushNotificationsAsync, registerNotificationListeners }) => {
        if (!isActive) {
          return;
        }

        // Only save to Firestore when a real user is signed in
        if (firebaseUser?.uid) {
          registerForPushNotificationsAsync(firebaseUser.uid);
        }

        cleanupNotificationListeners = registerNotificationListeners(
          (notification) => {
            // Notification received in foreground
            logger.debug("Foreground notification received", {
              identifier: notification.request.identifier,
            });
          },
          (response) => {
            // Notification tapped/clicked
            const data = response.notification.request.content.data;
            if (data?.route) {
              try {
                routerReplace(data.route as any);
              } catch (err) {
                logger.error("Navigation from notification failed:", err);
              }
            }
          }
        );
      })
      .catch((err) => {
        logger.error("Failed to load notification service:", err);
      });

    return () => {
      isActive = false;
      cleanupNotificationListeners?.();
    };
  }, [firebaseUser?.uid, routerReplace]);

  useEffect(() => {
    if (loading) return;

    const seg0 = segments[0] as string | undefined;
    const inProtected  = seg0 === "(tabs)";
    const inAuthOnly   = seg0 === "login";
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
                  routerReplace("/onboarding");
                }
              })
              .catch(() => routerReplace("/(tabs)"));
          });
        });
      } else {
        routerReplace("/(tabs)");
      }
    } else if (!isAuthenticated && !isGuest && inProtected) {
      routerReplace("/login");
    } else if (!isAuthenticated && !isGuest && inOnboarding) {
      routerReplace("/login");
    }
  }, [loading, isAuthenticated, isGuest, firebaseUser, segments, routerReplace]);

  const activeSegment = segments[0] as string;
  const unmountNavBar = NAV_UNMOUNT_SEGMENTS.has(activeSegment);

  // Close queue sheet when navigating to screens where it shouldn't appear
  useEffect(() => {
    if (unmountNavBar) {
      globalQueueSheetRef.current?.collapse();
    }
  }, [unmountNavBar]);

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          gestureEnabled: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="player"
          options={{
            ...(Platform.OS === "android"
              ? ANDROID_VERTICAL_SHEET_OPTIONS
              : IOS_VERTICAL_SHEET_OPTIONS),
          }}
        />
        <Stack.Screen
          name="queue"
          options={{
            presentation: Platform.OS === "android" ? "transparentModal" : "modal",
            animation: "slide_from_bottom",
            gestureEnabled: true,
            gestureDirection: "vertical",
            headerShown: false,
            fullScreenGestureEnabled: true,
            contentStyle: { backgroundColor: Platform.OS === "android" ? "transparent" : "#1E1E1E" },
          }}
        />
        <Stack.Screen
          name="song-options"
          options={{
            presentation: "formSheet",
            animation: "slide_from_bottom",
            sheetAllowedDetents: [0.88, 1],
            sheetInitialDetentIndex: 0,
            sheetCornerRadius: 24,
            sheetGrabberVisible: false,
            sheetExpandsWhenScrolledToEdge: false,
            gestureEnabled: true,
            contentStyle: { backgroundColor: "#1E1E1E" },
          }}
        />
        <Stack.Screen
          name="sleep-timer"
          options={{
            presentation: "formSheet",
            animation: "slide_from_bottom",
            sheetAllowedDetents: [0.62],
            sheetInitialDetentIndex: 0,
            sheetCornerRadius: 24,
            sheetGrabberVisible: false,
            gestureEnabled: true,
            contentStyle: { backgroundColor: Colors.background },
          }}
        />
        <Stack.Screen
          name="artist-mix"
          options={{
            ...(Platform.OS === "android"
              ? {
                  presentation: "formSheet",
                  animation: "slide_from_bottom",
                  sheetAllowedDetents: [1],
                  sheetInitialDetentIndex: 0,
                  sheetCornerRadius: 24,
                  sheetGrabberVisible: true,
                }
              : IOS_VERTICAL_SHEET_OPTIONS),
          }}
        />
        <Stack.Screen
          name="downloaded-songs"
          options={{
            presentation: "card",
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="downloads"
          options={{
            presentation: "card",
            animation: "default",
            gestureEnabled: true,
            contentStyle: { backgroundColor: Colors.background },
          }}
        />
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="onboarding/index"
          options={{ gestureEnabled: false }}
        />
      </Stack>
      {/* Keep the nav visible under utility sheets, but not over full player details. */}
      {!unmountNavBar && <AppNavBar />}
      {/* Queue sheet is always mounted but closed by default (index: -1) */}
      <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="box-none">
        <QueueBottomSheet ref={globalQueueSheetRef} />
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

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

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#05070A', padding: 20 }}>
        <Text style={{ color: '#ff0000', fontSize: 20, marginBottom: 10 }}>Error Loading App</Text>
        <Text style={{ color: '#fff', fontSize: 14 }}>{error.message}</Text>
      </View>
    );
  }

  if (!appIsReady || !fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.background,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 28,
        }}
      >
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.text, fontSize: 22, marginTop: 16, fontWeight: "700" }}>
          Mavrixfy
        </Text>
      </View>
    );
  }

  return (
    <ErrorBoundary onError={(err) => setError(err)}>
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
