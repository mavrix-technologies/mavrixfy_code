import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { Typography, Spacing, Radius } from "./tokens";

export interface ScreenHeaderProps {
  title?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  transparent?: boolean;
}

export function ScreenHeader({
  title,
  onBack = safeGoBack,
  rightAction,
  transparent = false,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 16 : insets.top;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: topInset },
        transparent ? styles.transparent : styles.solid,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        onPress={onBack}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={24} color={Colors.text} />
      </Pressable>

      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.spacer} />
      )}

      {rightAction ? (
        <View style={styles.rightSlot}>{rightAction}</View>
      ) : (
        <View style={styles.rightSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: Platform.OS === "web" ? 64 : 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    zIndex: 10,
  },
  solid: {
    backgroundColor: Colors.background,
  },
  transparent: {
    backgroundColor: "transparent",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    flex: 1,
    textAlign: "center",
    ...Typography.title,
    marginHorizontal: Spacing.sm,
  },
  spacer: {
    flex: 1,
  },
  rightSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  rightSpacer: {
    width: 40,
  },
});
