/**
 * OfflineBanner — a slim top bar shown when the device is offline with safe area support.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetwork } from "@/contexts/NetworkContext";

export default function OfflineBanner() {
  const { isOnline, recheck, isChecking } = useNetwork();
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <View style={[styles.banner, { paddingTop: Math.max(insets.top, 8) + 4 }]}>
      <Ionicons name="cloud-offline-outline" size={15} color="#26E19A" />
      <Text style={styles.text}>Offline mode · Cached content</Text>
      <Pressable
        onPress={recheck}
        disabled={isChecking}
        hitSlop={8}
        style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
      >
        <Text style={styles.retryText}>{isChecking ? "Checking…" : "Retry"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 27, 34, 0.95)",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    zIndex: 99,
  },
  text: {
    flex: 1,
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  retry: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(38, 225, 154, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(38, 225, 154, 0.3)",
  },
  retryPressed: {
    opacity: 0.8,
  },
  retryText: {
    color: "#26E19A",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
