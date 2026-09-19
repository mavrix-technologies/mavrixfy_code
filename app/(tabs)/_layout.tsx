import { Redirect, Tabs, usePathname } from "expo-router";
import React from "react";
import { View } from "react-native";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import {
  AppNavBar,
  AuthRouteFallback,
  IOSNativeTabLayout,
} from "@/features/navigation/layoutView";

import { IS_IOS } from "@/constants/platform";

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

  // iOS-only: Apple UITabBarController with Liquid Glass pill
  if (IS_IOS) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <IOSNativeTabLayout hidden={shouldHideTabBar} />
      </View>
    );
  }

  // Android + Web: custom JS tab bar with AppNavBar
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
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
        <Tabs.Screen name="create" options={{ href: null }} />
      </Tabs>
      <AppNavBar hidden={shouldHideTabBar} />
    </View>
  );
}

