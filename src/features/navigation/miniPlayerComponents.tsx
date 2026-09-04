import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Animated from "@/lib/nativeAnimated";
import {
  Pressable,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useOptionalPlayerProgress } from "@/contexts/PlayerContext";
import type { MiniPlayerSecondaryControl } from "@/lib/storage";
import {
  openMiniPlayerBannerLink,
  type MiniPlayerBannerConfig,
} from "@/lib/miniPlayerBannerConfig";
import { styles } from "./layoutStyles";
import { toProgressWidth } from "./layoutUtils";

export type MiniPlayerSecondaryControlButtonProps = {
  control: MiniPlayerSecondaryControl;
  size: number;
  radius: number;
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
  shellStyle?: object | object[];
  onQueue: () => void;
  onNext: () => void;
  onPrev: () => void;
  onMore: () => void;
};

export function MiniPlayerSecondaryControlButton({
  control,
  size,
  radius,
  backgroundColor,
  borderColor,
  iconColor,
  shellStyle,
  onQueue,
  onNext,
  onPrev,
  onMore,
}: MiniPlayerSecondaryControlButtonProps) {
  const buttonRef = useRef<View>(null);
  const action = (() => {
    switch (control) {
      case "next":
        return { icon: "play-skip-forward" as const, onPress: onNext, label: "Next track" };
      case "prev":
        return { icon: "play-skip-back" as const, onPress: onPrev, label: "Previous track" };
      case "more":
        return { icon: "ellipsis-horizontal" as const, onPress: onMore, label: "More options" };
      default:
        return { icon: "list" as const, onPress: onQueue, label: "Open queue" };
    }
  })();

  return (
    <View ref={buttonRef} collapsable={false}>
      <Pressable
        android_disableSound
        onPress={action.onPress}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        style={({ pressed }) => [
          shellStyle,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor,
            borderColor,
          },
          pressed && styles.miniButtonPressed,
        ]}
      >
        <Ionicons
          name={action.icon}
          size={control === "more" ? 22 : 24}
          color={iconColor}
        />
      </Pressable>
    </View>
  );
}

export const MiniPlayerProgressBar = React.memo(function MiniPlayerProgressBar({
  fillColor,
}: {
  fillColor: string;
}) {
  const playerProgress = useOptionalPlayerProgress();
  const progress = playerProgress?.progress ?? 0;
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- `progress` is the destructured reactive value from playerProgress.progress
  const progressWidth = useMemo(() => toProgressWidth(progress), [progress]);

  return (
    <View pointerEvents="none" style={styles.playerProgressTrack}>
      <View
        style={[
          styles.playerProgressFill,
          {
            width: progressWidth,
            backgroundColor: fillColor,
          },
        ]}
      />
    </View>
  );
});
MiniPlayerProgressBar.displayName = "MiniPlayerProgressBar";

export const MiniPlayerBannerView = React.memo(function MiniPlayerBannerView({
  config,
}: {
  config: MiniPlayerBannerConfig;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const items = config.items;
  const count = items.length;

  const fadeAnimRef = useRef<Animated.Value | null>(null);
  if (fadeAnimRef.current === null) fadeAnimRef.current = new Animated.Value(1);
  const fadeAnim = fadeAnimRef.current;

  const slideAnimRef = useRef<Animated.Value | null>(null);
  if (slideAnimRef.current === null) slideAnimRef.current = new Animated.Value(0);
  const slideAnim = slideAnimRef.current;

  useEffect(() => {
    if (count <= 1) {
      setCurrentIndex(0);
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      return;
    }
    const intervalMs = Math.max(2500, (config.intervalSeconds || 4.5) * 1000);
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const cycleNext = () => {
      // Step 1: Smoothly fade and slide out upwards
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -6,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;
        // Step 2: Advance index and reset position to bottom offset
        setCurrentIndex((prev) => (prev + 1) % count);
        slideAnim.setValue(6);

        // Step 3: Smoothly fade and slide in from bottom
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start(() => {
          timerId = setTimeout(cycleNext, intervalMs);
        });
      });
    };

    timerId = setTimeout(cycleNext, intervalMs);

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [count, config.intervalSeconds, fadeAnim, slideAnim]);

  const activeItem = items[currentIndex % (count || 1)];
  if (!activeItem) return null;

  return (
    <Pressable
      android_disableSound
      onPress={() => {
        void openMiniPlayerBannerLink(activeItem.linkUrl);
      }}
      style={({ pressed }) => [
        styles.miniBannerRow,
        activeItem.backgroundColor ? { backgroundColor: activeItem.backgroundColor } : null,
        pressed && styles.miniBannerRowPressed,
      ]}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={`Banner: ${activeItem.text}`}
    >
      <Animated.View
        style={[
          styles.miniBannerContent,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <Ionicons
          name={(activeItem.iconName as any) || "paper-plane"}
          size={12.5}
          color={activeItem.iconColor || "#38BDF8"}
          style={styles.miniBannerIcon}
        />
        <Text
          style={[
            styles.miniBannerText,
            activeItem.textColor ? { color: activeItem.textColor } : null,
          ]}
          numberOfLines={1}
        >
          {activeItem.text}
        </Text>
      </Animated.View>

      {count > 1 ? (
        <View style={styles.miniBannerDots}>
          {items.map((item, idx) => (
            <View
              key={`${item.linkUrl}-${item.text}`}
              style={[
                styles.miniBannerDot,
                idx === (currentIndex % count) && styles.miniBannerDotActive,
              ]}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
});
MiniPlayerBannerView.displayName = "MiniPlayerBannerView";

export const IOSMiniPlayerProgressBar = React.memo(function IOSMiniPlayerProgressBar({
  fillColor,
}: {
  fillColor: string;
}) {
  const playerProgress = useOptionalPlayerProgress();
  const progress = playerProgress?.progress ?? 0;
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- `progress` is the destructured reactive value from playerProgress.progress
  const progressWidth = useMemo(() => toProgressWidth(progress), [progress]);

  return (
    <View pointerEvents="none" style={styles.iosMiniPlayerProgressTrack}>
      <View
        style={[
          styles.iosMiniPlayerProgressFill,
          { width: progressWidth, backgroundColor: fillColor },
        ]}
      />
    </View>
  );
});
IOSMiniPlayerProgressBar.displayName = "IOSMiniPlayerProgressBar";
