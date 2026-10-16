import { useAuth } from "@/contexts/AuthContext";
import { GUEST_LOGIN_ENABLED } from "@/lib/authFeatures";
import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { AppNavBar } from "./AppNavBar";

// Keep the dock inside its native screen so modal routes cover it without a
// pathname-driven unmount/remount above the root stack.
export function ScreenWithNavigation({ children }: PropsWithChildren) {
  const { loading, isAuthenticated, isGuest } = useAuth();
  return (
    <View style={{ flex: 1 }}>
      {children}
      {!loading && (isAuthenticated || (GUEST_LOGIN_ENABLED && isGuest)) && <AppNavBar />}
    </View>
  );
}
