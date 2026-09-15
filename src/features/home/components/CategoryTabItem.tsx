import React, { useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { type MusicCategoryItem } from "../constants/homeNavConstants";

export const UNIFIED_HEADER_TOP_BAR_HEIGHT = 48;
export const UNIFIED_HEADER_MENU_HEIGHT = 58;

export interface CategoryTabItemProps {
  item: MusicCategoryItem;
  index: number;
  active: boolean;
  isIOS: boolean;
  isFestival: boolean;
  scrollY?: number | SharedValue<number>;
  festiveActiveTextColor: string;
  festiveActiveIconColor: string;
  festiveInactiveColor: string;
  festiveIndicatorColor: string;
  onPress: (item: MusicCategoryItem, index: number) => void;
}

export const CategoryTabItem = React.memo(function CategoryTabItem({
  item,
  index,
  active,
  isIOS,
  isFestival,
  scrollY,
  festiveActiveTextColor,
  festiveActiveIconColor,
  festiveInactiveColor,
  festiveIndicatorColor,
  onPress,
}: CategoryTabItemProps) {
  const handlePress = useCallback(() => {
    onPress(item, index);
  }, [item, index, onPress]);

  // UI-thread opacity for festive active colors: 1 at rest (scrollY = 0), fades to 0 when scrolled to sticky dock
  const festiveAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    if (!isFestival) return { opacity: 0 };
    const y = typeof scrollY === "number" ? scrollY : scrollY ? scrollY.value : 0;
    const clampedY = Math.min(UNIFIED_HEADER_TOP_BAR_HEIGHT, Math.max(0, y));
    const progress = Math.min(1, Math.max(0, clampedY / UNIFIED_HEADER_TOP_BAR_HEIGHT));
    return {
      opacity: Math.max(0, 1 - progress),
    };
  });

  // UI-thread opacity for sticky docked white: 0 at rest, smoothly transitions to 1 when sticky header docks
  const whiteAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    if (!isFestival) return { opacity: 1 };
    const y = typeof scrollY === "number" ? scrollY : scrollY ? scrollY.value : 0;
    const clampedY = Math.min(UNIFIED_HEADER_TOP_BAR_HEIGHT, Math.max(0, y));
    const progress = Math.min(1, Math.max(0, clampedY / UNIFIED_HEADER_TOP_BAR_HEIGHT));
    return {
      opacity: progress,
    };
  });

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Category ${item.label}`}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.categoryItem,
        isIOS && styles.categoryItemIOS,
        pressed && styles.categoryItemPressed,
      ]}
    >
      {/* ── Festive Themed Layer (Active festival colors at rest, fades out on scroll) ── */}
      {isFestival && (
        <Animated.View style={[styles.categoryInner, festiveAnimatedStyle]} pointerEvents="none">
          <View style={styles.iconWrap}>
            <Ionicons
              name={active ? item.focusedIcon : item.unfocusedIcon}
              size={21}
              color={active ? festiveActiveIconColor : festiveInactiveColor}
            />
          </View>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[
              styles.categoryText,
              active && styles.categoryTextActive,
              isIOS && styles.categoryTextIOS,
              { color: active ? festiveActiveTextColor : festiveInactiveColor },
            ]}
          >
            {item.label}
          </Text>
          {active && (
            <View style={styles.activeIndicatorWrap} pointerEvents="none">
              <View
                style={[
                  styles.activeIndicator,
                  { backgroundColor: festiveIndicatorColor },
                ]}
              />
            </View>
          )}
        </Animated.View>
      )}

      {/* ── Docked Sticky White Layer (Smoothly fades in to 100% white when sticky header is visible) ── */}
      <Animated.View
        style={[
          styles.categoryInner,
          isFestival && StyleSheet.absoluteFillObject,
          whiteAnimatedStyle,
        ]}
        pointerEvents="none"
      >
        <View style={styles.iconWrap}>
          <Ionicons
            name={active ? item.focusedIcon : item.unfocusedIcon}
            size={21}
            color={active ? "#FFFFFF" : "rgba(255, 255, 255, 0.72)"}
          />
        </View>
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            styles.categoryText,
            active && styles.categoryTextActive,
            isIOS && styles.categoryTextIOS,
            { color: active ? "#FFFFFF" : "rgba(255, 255, 255, 0.72)" },
          ]}
        >
          {item.label}
        </Text>
        {active && (
          <View style={styles.activeIndicatorWrap} pointerEvents="none">
            <View
              style={[
                styles.activeIndicator,
                { backgroundColor: "#FFFFFF" },
              ]}
            />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  categoryItem: {
    height: UNIFIED_HEADER_MENU_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    marginRight: 4,
    position: "relative",
  },
  categoryItemIOS: {
    paddingHorizontal: 14,
  },
  categoryItemPressed: {
    opacity: 0.75,
  },
  categoryInner: {
    height: UNIFIED_HEADER_MENU_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 5,
  },
  iconWrap: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  categoryText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    letterSpacing: 0.15,
  },
  categoryTextActive: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  categoryTextIOS: {
    fontSize: 11.5,
  },
  activeIndicatorWrap: {
    position: "absolute",
    bottom: 2,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  activeIndicator: {
    width: 32,
    height: 3.2,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
});
