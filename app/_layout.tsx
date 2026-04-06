import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect, useState } from "react";
import { Platform, View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { logAppOpen } from "@/lib/analytics";

// Set navigation bar color on Android
if (Platform.OS === 'android') {
  SystemUI.setBackgroundColorAsync(Colors.background);
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (loading) return;

    const isLoginScreen = segments[0] === "login";
    if (!isAuthenticated && !isLoginScreen) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, segments, router]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          gestureEnabled: true,
          animation: "default",
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="player"
          options={{
            ...(Platform.OS === "android"
              ? {
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.18, 1],
                  sheetInitialDetentIndex: "last",
                  sheetCornerRadius: 24,
                }
              : {
                  presentation: "modal",
                  animation: "slide_from_bottom",
                  animationDuration: 320,
                  gestureDirection: "vertical",
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                  animationMatchesGesture: true,
                }),
          }}
        />
        <Stack.Screen
          name="queue"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            animationDuration: 320,
            gestureDirection: "vertical",
            gestureEnabled: true,
            fullScreenGestureEnabled: Platform.OS === "ios",
            animationMatchesGesture: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="bluetooth"
          options={{
            presentation: "formSheet",
            gestureEnabled: true,
            sheetAllowedDetents: [0.5, 1],
            sheetInitialDetentIndex: 0,
            sheetGrabberVisible: true,
            sheetExpandsWhenScrolledToEdge: false,
            sheetCornerRadius: 24,
          }}
        />
        <Stack.Screen
          name="login"
          options={{
            gestureEnabled: false,
          }}
        />
      </Stack>
    </>
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
        await logAppOpen();
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

  // Show error screen if something went wrong
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', padding: 20 }}>
        <Text style={{ color: '#ff0000', fontSize: 20, marginBottom: 10 }}>Error Loading App</Text>
        <Text style={{ color: '#fff', fontSize: 14 }}>{error.message}</Text>
      </View>
    );
  }

  if (!appIsReady || !fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  return (
    <ErrorBoundary onError={(error, stackTrace) => {
      setError(error);
    }}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AuthProvider>
            <PlayerProvider>
              <StatusBar style="light" />
              <RootLayoutNav />
            </PlayerProvider>
          </AuthProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
