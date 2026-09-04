import { Redirect, Tabs, usePathname } from "expo-router";
import React from "react";
import { View } from "react-native";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import {
  AppNavBar,
  AuthRouteFallback,
  IOSNativeTabLayout,
  IOSMiniPlayerOverlay,
} from "@/features/navigation/layoutView";

export { AppNavBar } from "@/features/navigation/layoutView";

export default function TabLayout() {
  const pathname = usePathname();
  const { loading, isAuthenticated, isGuest } = useAuth();

  const shouldHideTabBar = pathname === "/import-songs-file" || pathname?.startsWith("/import-songs-file");

  if (loading) {
    return <AuthRouteFallback />;
  }

  if (!isAuthenticated && !isGuest) {
    return <Redirect href="/login" />;
  }

  // NativeTabs only work correctly when distributed via App Store or TestFlight.
  // Sideloaded / unsigned IPAs run with __DEV__ = false but lack the required
  // entitlements, causing an immediate crash. Disable NativeTabs entirely until
  // the app is properly signed and distributed through Apple channels.
  const isProductionBuild = false; // TODO: re-enable when distributing via App Store

  if (isProductionBuild) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <IOSNativeTabLayout />
        {!shouldHideTabBar ? <IOSMiniPlayerOverlay /> : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          lazy: true,
          animation: "none",
          sceneStyle: { backgroundColor: Colors.background },
        }}
        tabBar={() => null}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="search" options={{ title: "Search" }} />
        <Tabs.Screen name="library" options={{ title: "Library" }} />
        <Tabs.Screen name="liked-songs" options={{ title: "Liked" }} />
        <Tabs.Screen name="import-songs" options={{ title: "Import" }} />
      </Tabs>
      <AppNavBar hidden={shouldHideTabBar} />
    </View>
  );
}
