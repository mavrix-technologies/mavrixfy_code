import { useCallback,useEffect,useMemo,useRef,useState,type ReactNode } from "react";
import {
Pressable,
StyleSheet,
Text,
View,
type NativeScrollEvent,
type NativeSyntheticEvent,
} from "react-native";

import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { colorWithAlpha } from "@/lib/colorExtractor";
import { triggerImpact } from "@/lib/haptics";
import * as Animated from "@/lib/nativeAnimated";
import { getSettings } from "@/lib/storage";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

export const APP_TOP_HEADER_HEIGHT = 48;
const DEFAULT_ELEVATION_SCROLL_THRESHOLD = 10;

type AppTopHeaderProps = {
  topInset: number;
  elevated?: boolean;
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
  iconName?: keyof typeof Ionicons.glyphMap;
  customIcon?: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  iconColor?: string;
  iconSize?: number;
  variant?: "default" | "primary";
  haptic?: boolean;
};

export function useAppTopHeaderScrollElevation(threshold = DEFAULT_ELEVATION_SCROLL_THRESHOLD) {
  const [isHeaderElevated, setIsHeaderElevated] = useState(false);
  const elevatedRef = useRef(false);

  const handleHeaderScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const shouldElevateHeader = event.nativeEvent.contentOffset.y > threshold;
      if (elevatedRef.current === shouldElevateHeader) return;

      elevatedRef.current = shouldElevateHeader;
      setIsHeaderElevated(shouldElevateHeader);
    },
    [threshold]
  );

  const resetHeaderElevation = useCallback(() => {
    elevatedRef.current = false;
    setIsHeaderElevated(false);
  }, []);

  return {
    isHeaderElevated,
    handleHeaderScroll,
    resetHeaderElevation,
  };
}

export default function AppTopHeader({
  topInset,
  elevated = false,
  ambientColor,
  title,
  titleNode,
  left,
  right,
  leftWidth = 40,
  rightWidth = 40,
  titleAlign = "center",
}: AppTopHeaderProps) {
  const [elevationOpacity] = useState(() => new Animated.Value(elevated ? 1 : 0));

  useEffect(() => {
    Animated.timing(elevationOpacity, {
      toValue: elevated ? 1 : 0,
      duration: elevated ? 140 : 110,
      useNativeDriver: true,
    }).start();
  }, [elevated, elevationOpacity]);

  const resolvedTitle = titleNode ?? (
    title ? (
      <Text style={[styles.titleText, titleAlign === "left" && styles.titleTextLeft]} numberOfLines={1}>
        {title}
      </Text>
    ) : null
  );

  const gradientColors = useMemo<readonly [string, string]>(() => {
    if (ambientColor) {
      return [
        colorWithAlpha(ambientColor, 0.45, "rgba(20, 23, 31, 0.90)"),
        Colors.background,
      ] as const;
    }
    return [Colors.surface, Colors.background] as const;
  }, [ambientColor]);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.header,
        {
          paddingTop: topInset,
          borderBottomColor: "rgba(223, 226, 235, 0.15)",
          borderBottomWidth: elevated ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.headerElevatedBg,
          { opacity: elevationOpacity },
        ]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      <View style={styles.content}>
        <View style={[styles.sideSlot, { width: leftWidth }]}>{left}</View>
        <View
          pointerEvents={titleNode ? "auto" : "none"}
          style={[
            styles.titleWrap,
            titleAlign === "left" && styles.titleWrapLeft,
            titleAlign === "center" && {
              position: "absolute",
              left: Math.max(leftWidth, rightWidth) + 12,
              right: Math.max(leftWidth, rightWidth) + 12,
              top: 0,
              bottom: 0,
            },
          ]}
        >
          {resolvedTitle}
        </View>
        <View style={[styles.sideSlot, styles.rightSlot, { width: rightWidth }]}>{right}</View>
      </View>
    </View>
  );
}

export function AppTopHeaderIconButton({
  iconName = "chevron-back",
  customIcon,
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
      {customIcon ? (
        customIcon
      ) : (
        <Ionicons
          name={iconName}
          size={iconSize}
          color={iconColor ?? (variant === "primary" ? "#06241a" : "#F8FBF9")}
        />
      )}
    </Pressable>
  );
}

export function AppTopHeaderProfileButton() {
  const { push: routerPush } = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [showNewDot, setShowNewDot] = useState(false);

  useEffect(() => {
    void getSettings().then((s) => setShowNewDot(!s.highQualityUnlocked));
  }, []);

  const handlePress = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    routerPush("/profile");
  }, [routerPush]);

  return (
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
    backgroundColor: Colors.background,
  },
  headerSeamless: {
    borderBottomWidth: 0,
    borderBottomColor: "transparent",
    backgroundColor: "transparent",
  },
  content: {
    minHeight: APP_TOP_HEADER_HEIGHT,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sideSlot: {
    minHeight: 40,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  buttonPrimary: {
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.96 }],
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
