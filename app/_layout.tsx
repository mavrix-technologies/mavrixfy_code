import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
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

// Screens where the nav bar must not appear
const NAV_HIDDEN_SEGMENTS = new Set(["login", "onboarding", "import-songs"]);

// Set navigation bar color on Android
if (Platform.OS === "android") {
  SystemUI.setBackgroundColorAsync(Colors.background);
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

// ─── Auth guard ───────────────────────────────────────────────────────────────
// Protected routes that require authentication
const PROTECTED_SEGMENTS = ["(tabs)"];
// Routes that are only for unauthenticated users
const AUTH_ONLY_SEGMENTS = ["login"];

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { loading, isAuthenticated, isGuest, firebaseUser } = useAuth();

  // Hide the nav bar on full-screen auth/onboarding/import screens
  const hideNavBar = NAV_HIDDEN_SEGMENTS.has(segments[0] as string);

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
                  router.replace("/(tabs)");
                } else {
                  router.replace("/onboarding");
                }
              })
              .catch(() => router.replace("/(tabs)"));
          });
        });
      } else {
        router.replace("/(tabs)");
      }
    } else if (!isAuthenticated && !isGuest && inProtected) {
      router.replace("/login");
    } else if (!isAuthenticated && !isGuest && inOnboarding) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, isGuest, firebaseUser, segments, router]);

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
              ? {
                  presentation: "formSheet",
                  sheetAllowedDetents: [1],
                  sheetInitialDetentIndex: 0,
                  sheetCornerRadius: 24,
                }
              : {
                  presentation: "modal",
                  gestureEnabled: true,
                  gestureDirection: "vertical",
                  fullScreenGestureEnabled: true,
                }),
          }}
        />
        <Stack.Screen
          name="queue"
          options={{
            ...(Platform.OS === "ios"
              ? {
                  presentation: "formSheet",
                  gestureEnabled: true,
                  sheetAllowedDetents: [0.6, 1],
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: true,
                  sheetCornerRadius: 28,
                  contentStyle: { backgroundColor: "transparent" },
                }
              : {
                  presentation: "modal",
                  gestureEnabled: false,
                }),
          }}
        />
        <Stack.Screen
          name="artist-mix"
          options={{
            ...(Platform.OS === "android"
              ? {
                  presentation: "formSheet",
                  sheetAllowedDetents: [1],
                  sheetInitialDetentIndex: 0,
                  sheetCornerRadius: 24,
                  sheetGrabberVisible: true,
                }
              : {
                  presentation: "modal",
                  gestureEnabled: true,
                  gestureDirection: "vertical",
                  fullScreenGestureEnabled: true,
                }),
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
            presentation: "modal",
            gestureEnabled: true,
          }}
        />
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="onboarding/index"
          options={{ gestureEnabled: false }}
        />
      </Stack>
      {/* Nav bar is hidden on login and onboarding screens */}
      {!hideNavBar && <AppNavBar />}
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
        // Pre-warm cache in background — do NOT await, never block startup
        preWarmHomeCache();
        logAppOpen(); // fire-and-forget, no await
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', padding: 20 }}>
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
            <NetworkProvider>
              <AuthProvider>
                <DownloadProvider>
                  <PlayerProvider>
                    <StatusBar style="light" />
                    <RootLayoutNav />
                  </PlayerProvider>
                </DownloadProvider>
              </AuthProvider>
            </NetworkProvider>
          </ThemeProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
