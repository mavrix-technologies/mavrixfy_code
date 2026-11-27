import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import {
AppNavBar,
AuthRouteFallback,
IOSMiniPlayerOverlay,
IOSNativeTabLayout,
} from "@/features/navigation/layoutView";
import { NavSwipeProvider } from "@/features/navigation/navSwipeContext";
import type { VisibleRoute } from "@/features/navigation/navTabConstants";
import { useActiveNavTab } from "@/features/navigation/useActiveNavTab";
import { Redirect,Tabs,usePathname,useRouter } from "expo-router";
import { useCallback,useMemo } from "react";
import { Easing,View,useWindowDimensions } from "react-native";

export { AppNavBar } from "@/features/navigation/layoutView";

export default function TabLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = useActiveNavTab();
  const { width: windowWidth } = useWindowDimensions();
  const { loading, isAuthenticated, isGuest } = useAuth();

  const shouldHideTabBar = pathname === "/import-songs-file" || pathname?.startsWith("/import-songs-file");

  const handleSwipeNavigate = useCallback(
    (href: string, _targetRoute: VisibleRoute) => {
      router.navigate(href as any);
    },
    [router]
  );

  const tabScreenOptions = useMemo(() => {
    const slideOffset = Math.max(240, windowWidth || 390);
    return {
      headerShown: false,
      lazy: true,
      animation: "shift" as const,
      transitionSpec: {
        animation: "timing" as const,
        config: {
          duration: 210,
          easing: Easing.out(Easing.cubic),
        },
      },
      sceneStyleInterpolator: ({ current }: { current: { progress: any } }) => ({
        sceneStyle: {
          transform: [
            {
              translateX: current.progress.interpolate({
                inputRange: [-1, 0, 1],
                outputRange: [-slideOffset, 0, slideOffset],
                extrapolate: "clamp",
              }),
            },
          ],
        },
      }),
      sceneStyle: { backgroundColor: Colors.background },
    };
  }, [windowWidth]);

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
    <NavSwipeProvider activeTab={activeTab} onNavigateHref={handleSwipeNavigate}>
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <Tabs
          screenOptions={tabScreenOptions}
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
    </NavSwipeProvider>
  );
}
