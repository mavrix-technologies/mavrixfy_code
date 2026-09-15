import React, { useCallback, useRef, useMemo, useEffect } from "react";
import {
  StyleSheet,
  FlatList,
  Platform,
  type ListRenderItemInfo,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { triggerImpact } from "@/lib/haptics";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { colorWithAlpha } from "@/lib/colorExtractor";
import { useAuth } from "@/contexts/AuthContext";
import { type FestivalThemeConfig } from "@/services/festivalThemeService";
import {
  MAVRIXFY_MUSIC_CATEGORIES,
  type MusicCategoryItem,
} from "../constants/homeNavConstants";

import {
  CategoryTabItem,
  UNIFIED_HEADER_TOP_BAR_HEIGHT,
  UNIFIED_HEADER_MENU_HEIGHT,
} from "./CategoryTabItem";
import { HomeTopBarRow } from "./HomeTopBarRow";

export {
  UNIFIED_HEADER_TOP_BAR_HEIGHT,
  UNIFIED_HEADER_MENU_HEIGHT,
};

export const UNIFIED_HEADER_TOTAL_HEIGHT =
  UNIFIED_HEADER_TOP_BAR_HEIGHT + UNIFIED_HEADER_MENU_HEIGHT;

const categoryKeyExtractor = (item: MusicCategoryItem) => item.id;

interface HomeUnifiedTopHeaderProps {
  topInset: number;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  scrollY?: number | SharedValue<number>;
  isElevated?: boolean;
  elevationProgress?: number;
  themeConfig?: FestivalThemeConfig;
}

export const HomeUnifiedTopHeader = React.memo(function HomeUnifiedTopHeader({
  topInset,
  selectedCategory,
  onSelectCategory,
  scrollY = 0,
  themeConfig,
}: HomeUnifiedTopHeaderProps) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const flatListRef = useRef<FlatList<MusicCategoryItem> | null>(null);
  const isIOS = Platform.OS === "ios";

  // Dynamic remote Title customization
  const titleText = themeConfig?.titleText?.trim() || "MAVRIXFY";
  const isFestival = themeConfig?.enabled === true;
  const festiveAccent = isFestival ? themeConfig?.themeAccentColor || "#014D52" : null;

  // Active Color Logic: Unified remote customization from themeConfig
  const defaultWhite = "#FFFFFF";
  const activeColor = isFestival
    ? themeConfig?.activeColor || festiveAccent || defaultWhite
    : defaultWhite;

  // Main Header: applies active festival colour
  const titleColor = isFestival ? (themeConfig?.titleColor || activeColor) : defaultWhite;
  const headerIconColor = isFestival ? (themeConfig?.headerIconColor || activeColor) : defaultWhite;

  // Festive Category Header Colors (shown at rest before scroll)
  const festiveActiveTextColor = isFestival ? (themeConfig?.menuActiveTextColor || activeColor) : defaultWhite;
  const festiveActiveIconColor = isFestival ? (themeConfig?.menuActiveIconColor || activeColor) : defaultWhite;
  const festiveIndicatorColor = isFestival ? (themeConfig?.menuActiveIndicatorColor || activeColor) : defaultWhite;
  const festiveInactiveColor = isFestival
    ? (themeConfig?.menuTextColor || colorWithAlpha(activeColor, 0.72, "rgba(255, 255, 255, 0.72)"))
    : "rgba(255, 255, 255, 0.72)";

  const handleProfilePress = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    router.push("/profile");
  }, [router]);

  const handleDownloadPress = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    router.push("/downloads");
  }, [router]);

  // Production-Ready Official Method: Native FlatList scrollToIndex with viewPosition: 0.5 (Dead-center)
  const handleCategoryPress = useCallback(
    (item: MusicCategoryItem, index: number) => {
      if (item.id === selectedCategory) return;
      if (Platform.OS !== "web") {
        void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      }
      flatListRef.current?.scrollToIndex({
        index,
        viewPosition: 0.5,
        animated: true,
      });
      onSelectCategory(item.id);
    },
    [onSelectCategory, selectedCategory]
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      flatListRef.current?.scrollToOffset({
        offset: info.index * (info.averageItemLength || 75),
        animated: true,
      });
    },
    []
  );

  // 100% UI-Thread Reanimated Transforms (Seamless shrink, zero layout shifts, zero CPU frame drops)
  const headerContainerAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    const y = typeof scrollY === "number" ? scrollY : scrollY ? scrollY.value : 0;
    const clampedY = Math.min(UNIFIED_HEADER_TOP_BAR_HEIGHT, Math.max(0, y));
    return {
      height: topInset + UNIFIED_HEADER_TOTAL_HEIGHT - clampedY,
    };
  });

  const stickyDockBgAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    const y = typeof scrollY === "number" ? scrollY : scrollY ? scrollY.value : 0;
    const clampedY = Math.min(UNIFIED_HEADER_TOP_BAR_HEIGHT, Math.max(0, y));
    const progress = Math.min(1, Math.max(0, clampedY / UNIFIED_HEADER_TOP_BAR_HEIGHT));
    return {
      opacity: progress,
    };
  });

  const topBarAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    const y = typeof scrollY === "number" ? scrollY : scrollY ? scrollY.value : 0;
    const clampedY = Math.min(UNIFIED_HEADER_TOP_BAR_HEIGHT, Math.max(0, y));
    const opacity = Math.max(0, 1 - clampedY / (UNIFIED_HEADER_TOP_BAR_HEIGHT * 0.75));
    return {
      transform: [{ translateY: -clampedY }],
      opacity,
    };
  });

  const menuRailAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    const y = typeof scrollY === "number" ? scrollY : scrollY ? scrollY.value : 0;
    const clampedY = Math.min(UNIFIED_HEADER_TOP_BAR_HEIGHT, Math.max(0, y));
    return {
      transform: [{ translateY: -clampedY }],
    };
  });

  const festivalOverlayAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    const y = typeof scrollY === "number" ? scrollY : scrollY ? scrollY.value : 0;
    const clampedY = Math.min(UNIFIED_HEADER_TOP_BAR_HEIGHT, Math.max(0, y));
    const progress = clampedY / UNIFIED_HEADER_TOP_BAR_HEIGHT;
    return {
      opacity: Math.max(0, 1 - progress),
    };
  });

  // Dynamic Category Items (Custom categories or label overrides)
  const categoriesData = useMemo(() => {
    if (Array.isArray(themeConfig?.customCategories) && themeConfig.customCategories.length > 0) {
      return themeConfig.customCategories.map((cat) => ({
        id: cat.id,
        label: cat.label || cat.id,
        focusedIcon: (cat.icon as any) || "musical-notes",
        unfocusedIcon: (`${cat.icon || "musical-notes"}-outline` as any),
      }));
    }

    const labelOverrides = themeConfig?.menuLabels;
    if (labelOverrides && typeof labelOverrides === "object") {
      return MAVRIXFY_MUSIC_CATEGORIES.map((item) => ({
        ...item,
        label: labelOverrides[item.id] || labelOverrides[item.label] || item.label,
      }));
    }

    return MAVRIXFY_MUSIC_CATEGORIES;
  }, [themeConfig?.customCategories, themeConfig?.menuLabels]);

  // Auto-center category on load or external selection
  useEffect(() => {
    const index = categoriesData.findIndex((c) => c.id === selectedCategory);
    if (index >= 0) {
      flatListRef.current?.scrollToIndex({
        index,
        viewPosition: 0.5,
        animated: true,
      });
    }
  }, [selectedCategory, categoriesData]);

  const renderCategoryItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MusicCategoryItem>) => {
      const active = selectedCategory === item.id;

      return (
        <CategoryTabItem
          item={item}
          index={index}
          active={active}
          isIOS={isIOS}
          isFestival={isFestival}
          scrollY={scrollY}
          festiveActiveTextColor={festiveActiveTextColor}
          festiveActiveIconColor={festiveActiveIconColor}
          festiveInactiveColor={festiveInactiveColor}
          festiveIndicatorColor={festiveIndicatorColor}
          onPress={handleCategoryPress}
        />
      );
    },
    [
      handleCategoryPress,
      isFestival,
      isIOS,
      festiveActiveIconColor,
      festiveActiveTextColor,
      festiveInactiveColor,
      festiveIndicatorColor,
      scrollY,
      selectedCategory,
    ]
  );

  return (
    <Animated.View
      style={[
        styles.headerRoot,
        {
          paddingTop: topInset,
        },
        headerContainerAnimatedStyle,
      ]}
      pointerEvents="box-none"
    >
      {/* ── Solid #0B0F14 Base Dock Layer: Fades in on scroll so at rest (without festival) the ambient song backdrop shines through ── */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: "#0B0F14" },
          stickyDockBgAnimatedStyle,
        ]}
        pointerEvents="none"
      />

      {/* ── Soft Festival Ambient Tint (Smoothly cross-fades out into #0B0F14 on scroll) ── */}
      {festiveAccent && (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            festivalOverlayAnimatedStyle,
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={[
              colorWithAlpha(festiveAccent, 0.98),
              festiveAccent,
              festiveAccent,
            ]}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      )}

      {/* ── Collapsible Top Bar Row (GPU Translated on UI Thread) ── */}
      <HomeTopBarRow
        handleProfilePress={handleProfilePress}
        handleDownloadPress={handleDownloadPress}
        isAuthenticated={isAuthenticated}
        user={user}
        headerIconColor={headerIconColor}
        titleColor={titleColor}
        titleText={titleText}
        topBarAnimatedStyle={topBarAnimatedStyle}
      />

      {/* ── Sticky Menu Rail Row: Official High-Performance FlatList ── */}
      <Animated.View style={[styles.menuRailRow, menuRailAnimatedStyle]} pointerEvents="box-none">
        <FlatList
          ref={flatListRef}
          data={categoriesData}
          keyExtractor={categoryKeyExtractor}
          renderItem={renderCategoryItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          bounces={false}
          contentContainerStyle={styles.menuScrollContent}
          style={styles.menuFlatList}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          extraData={selectedCategory}
        />
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  headerRoot: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: "hidden",
  },
  menuRailRow: {
    height: UNIFIED_HEADER_MENU_HEIGHT,
    justifyContent: "center",
    position: "relative",
    zIndex: 2,
  },
  menuFlatList: {
    flexGrow: 0,
    height: UNIFIED_HEADER_MENU_HEIGHT,
  },
  menuScrollContent: {
    paddingHorizontal: 12,
    alignItems: "center",
    height: UNIFIED_HEADER_MENU_HEIGHT,
  },
});

export default HomeUnifiedTopHeader;
