import * as Animated from "@/lib/nativeAnimated";
import { safeGoBack } from "@/utils/navigation";
import React, { memo } from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { CircularBackButton, CircularShareButton } from "./CircularNavButton";

export interface DetailFloatingNavProps {
  topInset: number;
  opacity?: Animated.Value | Animated.AnimatedInterpolation<number>;
  isStickyVisible?: boolean;
  onBack?: () => void;
  backAccessibilityLabel?: string;
  onShare?: () => void;
  shareAccessibilityLabel?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  centerElement?: React.ReactNode;
  title?: string;
  style?: StyleProp<ViewStyle>;
}

export const DetailFloatingNav = memo(function DetailFloatingNav({
  topInset,
  opacity,
  isStickyVisible = false,
  onBack = safeGoBack,
  backAccessibilityLabel = "Go back",
  onShare,
  shareAccessibilityLabel = "Share",
  leftElement,
  rightElement,
  centerElement,
  title,
  style,
}: DetailFloatingNavProps) {
  const containerStyle = [
    styles.floatingContainer,
    { top: topInset + 6 },
    opacity ? { opacity } : undefined,
    style,
  ];

  const content = (
    <View style={styles.navRow}>
      {/* Left Slot */}
      <View style={styles.leftSlot}>
        {leftElement ? (
          leftElement
        ) : (
          <CircularBackButton
            onPress={onBack}
            accessibilityLabel={backAccessibilityLabel}
          />
        )}
      </View>

      {/* Center Slot */}
      <View style={styles.centerSlot}>
        {centerElement ? (
          centerElement
        ) : title ? (
          <Text style={styles.titleText} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>

      {/* Right Slot */}
      <View style={styles.rightSlot}>
        {rightElement ? (
          rightElement
        ) : onShare ? (
          <CircularShareButton
            onPress={onShare}
            accessibilityLabel={shareAccessibilityLabel}
          />
        ) : null}
      </View>
    </View>
  );

  if (opacity) {
    return (
      <Animated.View
        style={containerStyle}
        pointerEvents={isStickyVisible ? "none" : "box-none"}
      >
        {content}
      </Animated.View>
    );
  }

  return (
    <View
      style={containerStyle}
      pointerEvents={isStickyVisible ? "none" : "box-none"}
    >
      {content}
    </View>
  );
});

const styles = StyleSheet.create({
  floatingContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 90,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftSlot: {
    flexDirection: "row",
    alignItems: "center",
  },
  centerSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  rightSlot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  titleText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    textAlign: "center",
  },
});
