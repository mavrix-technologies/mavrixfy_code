import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  type ListRenderItemInfo,
} from "react-native";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";

import {
  MAVRIXFY_TOP_CATEGORIES,
  HOME_TOP_MENU_HEIGHT,
} from "../constants/homeNavConstants";

interface HomeLiquidGlassNavProps {
  categories?: readonly string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  elevationProgress?: number;
  ambientColor?: string;
}

export const HomeLiquidGlassNav = React.memo(function HomeLiquidGlassNav({
  categories = MAVRIXFY_TOP_CATEGORIES,
  selectedCategory,
  onSelectCategory,
  elevationProgress = 0,
  ambientColor,
}: HomeLiquidGlassNavProps) {
  const isIOS = Platform.OS === "ios";
  const flatListRef = useRef<FlatList<string> | null>(null);

  const handleCategoryPress = useCallback(
    (item: string) => {
      if (item === selectedCategory) return;
      if (Platform.OS !== "web") {
        void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      }
      onSelectCategory(item);
    },
    [onSelectCategory, selectedCategory]
  );

  const renderCategoryItem = useCallback(
    ({ item }: ListRenderItemInfo<string>) => {
      const active = selectedCategory === item;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          accessibilityLabel={`Category ${item}`}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          onPress={() => handleCategoryPress(item)}
          style={({ pressed }) => [
            styles.categoryItem,
            isIOS && styles.categoryItemIOS,
            pressed && styles.categoryItemPressed,
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.categoryText,
              active && styles.categoryTextActive,
              isIOS && styles.categoryTextIOS,
            ]}
          >
            {item}
          </Text>
          {active && (
            <View
              style={[
                styles.activeIndicator,
                ambientColor ? { backgroundColor: ambientColor } : null,
              ]}
            />
          )}
        </Pressable>
      );
    },
    [ambientColor, handleCategoryPress, isIOS, selectedCategory]
  );

  const keyExtractor = useCallback((item: string) => item, []);

  // Subtle scroll-edge translucency for iOS 26 Liquid Glass navigation layer
  // Controls remain legible as content scrolls underneath without a giant blur container
  const bgOpacity = Math.min(1, Math.max(0, elevationProgress));
  const borderOpacity = Math.min(0.18, bgOpacity * 0.18);

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor:
            bgOpacity > 0.05
              ? isIOS
                ? `rgba(11, 15, 20, ${0.45 + bgOpacity * 0.4})`
                : `rgba(11, 15, 20, ${0.75 + bgOpacity * 0.25})`
              : "transparent",
          borderBottomColor: `rgba(255, 255, 255, ${borderOpacity})`,
          borderBottomWidth: borderOpacity > 0.02 ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      <FlatList
        ref={flatListRef}
        data={categories as string[]}
        keyExtractor={keyExtractor}
        renderItem={renderCategoryItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={true}
        contentContainerStyle={styles.scrollContent}
        style={styles.flatList}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    height: HOME_TOP_MENU_HEIGHT,
    width: "100%",
    justifyContent: "center",
    zIndex: 10,
  },
  flatList: {
    flex: 1,
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: Platform.OS === "ios" ? 22 : 18,
  },
  categoryItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    position: "relative",
  },
  categoryItemIOS: {
    paddingVertical: 5,
  },
  categoryItemPressed: {
    opacity: 0.7,
  },
  categoryText: {
    fontSize: 14.5,
    fontFamily: "Inter_500Medium",
    color: "rgba(248, 251, 249, 0.65)",
    letterSpacing: 0.1,
    includeFontPadding: false,
  },
  categoryTextIOS: {
    fontSize: 15,
  },
  categoryTextActive: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#FFFFFF",
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#26E19A",
  },
});
