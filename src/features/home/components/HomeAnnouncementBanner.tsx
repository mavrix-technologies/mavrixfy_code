import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsFocused } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useAnimatedReaction, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { colorWithAlpha, normalizeHexColor } from "@/lib/colorMath";
import {
  openMiniPlayerBannerLink,
  type MiniPlayerBannerConfig,
} from "@/lib/miniPlayerBannerConfig";
import * as Animated from "@/lib/nativeAnimated";
import { useAppIsActive } from "@/lib/appActivity";

const DEFAULT_BACKGROUND = "#E5F4F3";
function isDarkBannerBackground(color: string): boolean {
  const hex = normalizeHexColor(color) || DEFAULT_BACKGROUND;
  return (parseInt(hex.slice(1, 3), 16) * 299 + parseInt(hex.slice(3, 5), 16) * 587
    + parseInt(hex.slice(5, 7), 16) * 114) / 1000 < 150;
}
// A repeating scallop follows the reference without stretching bitmap artwork.
const WAVE_PATH = `M0 0 H400 V4 ${Array.from({ length: 40 }, (_, i) =>
  `Q${395 - i * 10} ${i % 2 === 0 ? 12 : -4} ${390 - i * 10} 4`
).join(" ")} V0 Z`;

type HomeAnnouncementBannerProps = {
  config: MiniPlayerBannerConfig;
  edgeBackgroundColor?: string;
  scrollY?: SharedValue<number>;
  hiddenAfter?: number;
  presented?: boolean;
  onDismiss?: () => void;
};

export const HomeAnnouncementBanner = React.memo(function HomeAnnouncementBanner({
  config,
  edgeBackgroundColor = "transparent",
  scrollY,
  hiddenAfter = Infinity,
  presented = true,
  onDismiss,
}: HomeAnnouncementBannerProps) {
  const isFocused = useIsFocused();
  const foreground = useAppIsActive();
  const [scrollVisibility, setScrollVisibility] = useState(0);
  useAnimatedReaction(
    () => {
      const y = Math.max(0, scrollY?.value || 0);
      return y >= hiddenAfter ? 2 : y > 8 ? 1 : 0;
    },
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setScrollVisibility, next);
    },
    [scrollY, hiddenAfter]
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade] = useState(() => new Animated.Value(1));
  const [slide] = useState(() => new Animated.Value(0));
  const count = config.items.length;
  const visible = config.enabled && count > 0;

  useEffect(() => {
    fade.setValue(1);
    slide.setValue(0);
    if (!presented || !visible || !isFocused || !foreground || scrollVisibility === 2 || count <= 1) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const intervalMs = Math.max(2000, (config.intervalSeconds || 4.5) * 1000);
    const transition = (opacity: number, offset: number, duration: number) =>
      Animated.parallel([
        Animated.timing(fade, { toValue: opacity, duration, useNativeDriver: true, isInteraction: false }),
        Animated.timing(slide, { toValue: offset, duration, useNativeDriver: true, isInteraction: false }),
      ]);

    const cycleNext = () => {
      transition(0, -5, 150).start(({ finished }) => {
        if (!finished || cancelled) return;
        setCurrentIndex(index => (index + 1) % count);
        slide.setValue(5);
        transition(1, 0, 180).start(({ finished: entered }) => {
          if (entered && !cancelled) timer = setTimeout(cycleNext, intervalMs);
        });
      });
    };
    timer = setTimeout(cycleNext, intervalMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      fade.stopAnimation();
      slide.stopAnimation();
    };
  }, [presented, visible, isFocused, foreground, scrollVisibility, count, config.intervalSeconds, fade, slide]);

  const activeItem = config.items[currentIndex % (count || 1)];
  if (!visible || !activeItem) return null;

  const backgroundColor = activeItem.backgroundColor || DEFAULT_BACKGROUND;
  const darkBackground = isDarkBannerBackground(backgroundColor);
  const textColor = activeItem.textColor || (darkBackground ? "#FFFFFF" : "#146F73");
  const subtitleColor = darkBackground ? "rgba(255,255,255,0.72)" : "#758C90";
  const iconName = activeItem.iconName in Ionicons.glyphMap
    ? activeItem.iconName as keyof typeof Ionicons.glyphMap : "megaphone-outline";

  return (
    <View style={styles.root} accessibilityElementsHidden={!presented || scrollVisibility === 2}
      importantForAccessibility={!presented || scrollVisibility === 2 ? "no-hide-descendants" : "auto"}>
      <View style={[styles.noticeRow, { backgroundColor }]}>
        <Pressable
          android_disableSound
          onPress={() => { void openMiniPlayerBannerLink(activeItem.linkUrl); }}
          accessibilityRole="link"
          accessibilityLabel={[activeItem.text, activeItem.subtitle].filter(Boolean).join(". ")}
          style={({ pressed }) => [styles.notice, pressed && styles.pressed]}
        >
          <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
            <View style={styles.titleRow}>
              <Ionicons name={iconName} size={15} color={activeItem.iconColor || textColor} style={styles.icon} />
              <View style={styles.copy}>
                <Text style={[styles.title, { color: textColor }]}>
                  {activeItem.text}
                </Text>
                {activeItem.subtitle ? (
                  <Text style={[styles.subtitle, { color: subtitleColor }]}>
                    {activeItem.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          </Animated.View>
          {count > 1 ? (
            <View style={styles.dots} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {config.items.map((_, index) => (
                <View key={index} style={[styles.dot, {
                  backgroundColor: colorWithAlpha(textColor, index === currentIndex % count ? 0.9 : 0.24),
                }]} />
              ))}
            </View>
          ) : null}
        </Pressable>
        {onDismiss ? (
          <Pressable onPress={onDismiss} android_disableSound accessibilityRole="button"
            accessibilityLabel="Close announcement"
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={textColor} />
          </Pressable>
        ) : null}
      </View>
      <Svg width="100%" height={8} viewBox="0 0 400 8" preserveAspectRatio="none"
        style={{ backgroundColor: edgeBackgroundColor }} pointerEvents="none" accessible={false}>
        <Path d={WAVE_PATH} fill={backgroundColor} />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flexShrink: 0, width: "100%" },
  noticeRow: { flexDirection: "row", alignItems: "flex-start", width: "100%" },
  notice: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12 },
  closeButton: { flexShrink: 0, width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  pressed: { opacity: 0.75 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  icon: { flexShrink: 0, marginTop: 2 },
  copy: { flex: 1, minWidth: 0 },
  title: { textAlign: "center", fontSize: 14, lineHeight: 20, fontFamily: "Inter_700Bold" },
  subtitle: { textAlign: "center", fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular", marginTop: 3 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 8 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
