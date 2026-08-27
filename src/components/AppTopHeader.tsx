import React, { type ReactNode, useCallback, useState, useRef, useEffect, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { triggerImpact } from "@/lib/haptics";
import { getSettings } from "@/lib/storage";
import { colorWithAlpha } from "@/lib/colorExtractor";

export const APP_TOP_HEADER_HEIGHT = 44;
const DEFAULT_ELEVATION_SCROLL_THRESHOLD = 10;

type AppTopHeaderProps = {
  topInset: number;
  elevated?: boolean;
  elevationProgress?: number;
  ambientColor?: string;
  title?: string;
  titleNode?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  leftWidth?: number;
  rightWidth?: number;
  titleAlign?: "center" | "left";
};

type AppTopHeaderIconButtonProps = {
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  iconColor?: string;
  iconSize?: number;
  variant?: "default" | "primary";
  haptic?: boolean;
};

export function useAppTopHeaderScrollElevation(threshold = 28) {
  const [isHeaderElevated, setIsHeaderElevated] = useState(false);
  const [elevationProgress, setElevationProgress] = useState(0);

  const handleHeaderScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const shouldElevateHeader = offsetY > threshold;
      setIsHeaderElevated((current) => (
        current === shouldElevateHeader ? current : shouldElevateHeader
      ));
      // Smooth linear-to-ease curve over 100px range starting after 18px scroll
      const progress = Math.min(1, Math.max(0, (offsetY - 18) / 90));
      setElevationProgress(progress);
    },
    [threshold]
  );


  const resetHeaderElevation = useCallback(() => {
    setIsHeaderElevated(false);
    setElevationProgress(0);
  }, []);

  return {
    isHeaderElevated,
    elevationProgress,
    handleHeaderScroll,
    resetHeaderElevation,
  };
}

export default function AppTopHeader({
  topInset,
  elevated = false,
  elevationProgress,
  ambientColor,
  title,
  titleNode,
  left,
  right,
  leftWidth = 40,
  rightWidth = 40,
  titleAlign = "center",
}: AppTopHeaderProps) {
  const resolvedTitle = titleNode ?? (
    title ? (
      <Text style={[styles.titleText, titleAlign === "left" && styles.titleTextLeft]} numberOfLines={1}>
        {title}
      </Text>
    ) : null
  );

  const effectiveProgress = elevationProgress !== undefined
    ? elevationProgress
    : elevated
    ? 1
    : 0;

  const bgOpacity = effectiveProgress;
  const borderAlpha = 0.15 * effectiveProgress;

  const gradientColors = useMemo<readonly [string, string]>(() => {
    if (ambientColor) {
      return [
        colorWithAlpha(ambientColor, 0.45, "rgba(38, 225, 154, 0.35)"),
        "#0B0F14",
      ] as const;
    }
    return ["#14171F", "#0B0F14"] as const;
  }, [ambientColor]);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.header,
        {
          paddingTop: topInset,
          borderBottomColor: `rgba(223, 226, 235, ${borderAlpha})`,
          borderBottomWidth: borderAlpha > 0.01 ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.headerElevatedBg,
          { opacity: bgOpacity },
        ]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <View style={styles.content}>
        <View style={[styles.sideSlot, { width: leftWidth }]}>{left}</View>
        <View
          pointerEvents={titleNode ? "auto" : "none"}
          style={[styles.titleWrap, titleAlign === "left" && styles.titleWrapLeft]}
        >
          {resolvedTitle}
        </View>
        <View style={[styles.sideSlot, styles.rightSlot, { width: rightWidth }]}>{right}</View>
      </View>
    </View>
  );
}

export function AppTopHeaderIconButton({
  iconName,
  onPress,
  accessibilityLabel,
  iconColor,
  iconSize = 20,
  variant = "default",
  haptic = true,
}: AppTopHeaderIconButtonProps) {
  const handlePress = useCallback(() => {
    if (haptic) {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  }, [haptic, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        pressed && styles.buttonPressed,
      ]}
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons
        name={iconName}
        size={iconSize}
        color={iconColor ?? (variant === "primary" ? "#06241a" : "#F8FBF9")}
      />
    </Pressable>
  );
}

export function AppTopHeaderProfileButton() {
  const { push: routerPush } = useRouter();
  const { user, isAuthenticated } = useAuth();
  const buttonRef = useRef<View>(null);
  const [showNewDot, setShowNewDot] = useState(false);

  useEffect(() => {
    void getSettings().then((s) => setShowNewDot(!s.highQualityUnlocked));
  }, []);

  const handlePress = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    routerPush("/profile");
  }, [routerPush]);

  const handleLayout = useCallback(() => {
    // no-op — tour removed
  }, []);

  return (
    <View ref={buttonRef} onLayout={handleLayout} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handlePress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isAuthenticated && user?.picture ? (
          <Image source={{ uri: user.picture }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="person-circle-outline" size={28} color="#F8FBF9" />
          </View>
        )}
        {showNewDot && <View style={styles.newDot} />}
      </Pressable>
    </View>
  );
}

export function AppTopHeaderDownloadButton() {
  const { push: routerPush } = useRouter();

  const handlePress = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    routerPush("/downloaded-songs");
  }, [routerPush]);

  return (
    <AppTopHeaderIconButton
      iconName="arrow-down-circle-outline"
      iconSize={22}
      accessibilityLabel="Open downloads"
      onPress={handlePress}
      haptic={false}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    zIndex: 20,
  },
  headerElevated: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(223,226,235,0.15)",
  },
  headerElevatedBg: {
    backgroundColor: "#0E1016",
  },
  headerSeamless: {
    borderBottomWidth: 0,
    borderBottomColor: "transparent",
    backgroundColor: "transparent",
  },
  content: {
    minHeight: APP_TOP_HEADER_HEIGHT,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sideSlot: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rightSlot: {
    justifyContent: "flex-end",
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrapLeft: {
    alignItems: "flex-start",
  },
  titleText: {
    maxWidth: "100%",
    color: "#F8FBF9",
    fontSize: 17,
    lineHeight: 21,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  titleTextLeft: {
    fontSize: 18,
    lineHeight: 22,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  buttonPrimary: {
    backgroundColor: "#26E19A",
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.55)",
  },
  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.96 }],
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  newDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#E8115B",
    borderWidth: 1.5,
    borderColor: "#000",
  },
});
