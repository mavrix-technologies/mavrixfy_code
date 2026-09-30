import Colors from "@/constants/colors";
import * as Animated from "@/lib/nativeAnimated";
import { safeGoBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import React, { memo } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

export interface DetailStickyHeaderProps {
  topInset: number;
  stickyOpacity: Animated.Value;
  title: string;
  isStickyVisible?: boolean;
  backgroundColor?: string;
  onBack?: () => void;
  rightElement?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const DetailStickyHeader = memo(function DetailStickyHeader({
  topInset,
  stickyOpacity,
  title,
  isStickyVisible = false,
  backgroundColor,
  onBack = safeGoBack,
  rightElement,
  style,
}: DetailStickyHeaderProps) {
  return (
    <Animated.View
      pointerEvents={isStickyVisible ? "auto" : "none"}
      style={[
        styles.stickyHeader,
        {
          paddingTop: topInset,
          opacity: stickyOpacity,
          backgroundColor: backgroundColor || Colors.background,
        },
        style,
      ]}
    >
      <View style={styles.headerBar}>
        {/* Back Button */}
        <Pressable
          style={styles.backButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>

        {/* Center Title */}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>

        {/* Right Slot */}
        <View style={styles.rightSlot}>
          {rightElement || <View style={styles.placeholder} />}
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  headerBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  headerTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  rightSlot: {
    width: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    width: 38,
    height: 38,
  },
});
