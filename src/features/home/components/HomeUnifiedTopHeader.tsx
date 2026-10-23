import Colors from "@/constants/colors";
import { getSettings, subscribeSettings } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { colorWithAlpha } from "@/lib/colorExtractor";
import { triggerImpact } from "@/lib/haptics";
import { type FestivalThemeConfig } from "@/services/festivalThemeService";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React,{ useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
Platform,
StyleSheet,
FlatList,
View,
type ListRenderItemInfo,
} from "react-native";
import Animated,{
useAnimatedStyle,
useDerivedValue,
type SharedValue,
} from "react-native-reanimated";
import {
MAVRIXFY_MUSIC_CATEGORIES,
UNIFIED_HEADER_MENU_HEIGHT,
UNIFIED_HEADER_TOP_BAR_HEIGHT,
type MavrixfyCategory,
type MusicCategoryItem,
} from "../constants/homeNavConstants";

import {
CategoryTabItem,
} from "./CategoryTabItem";
import { HomeTopBarRow } from "./HomeTopBarRow";

export {
UNIFIED_HEADER_MENU_HEIGHT,UNIFIED_HEADER_TOP_BAR_HEIGHT
};

export const UNIFIED_HEADER_TOTAL_HEIGHT =
  UNIFIED_HEADER_TOP_BAR_HEIGHT + UNIFIED_HEADER_MENU_HEIGHT;

const categoryKey = (item: MusicCategoryItem) => item.id;

interface HomeUnifiedTopHeaderProps {
  topInset: number;
  selectedCategory: MavrixfyCategory;
  onSelectCategory: (category: MavrixfyCategory) => void;
  scrollY?: number | SharedValue<number>;
  themeConfig?: FestivalThemeConfig;
  announcement?: ReactNode;
  /** Measured announcement height below the status-bar safe area. */
  announcementHeight?: number | SharedValue<number>;
}

export const HomeUnifiedTopHeader = React.memo(function HomeUnifiedTopHeader({
  topInset,
  selectedCategory,
  onSelectCategory,
  scrollY = 0,
  themeConfig,
  announcement,
  announcementHeight = 0,
}: HomeUnifiedTopHeaderProps) {
  const router = useRouter();
  const [enableSpotify, setEnableSpotify] = useState(true);
  useEffect(() => {
    void getSettings().then((s) => setEnableSpotify(s.enableSpotify));
    return subscribeSettings((s) => setEnableSpotify(s.enableSpotify));
  }, []);
  const { user, isAuthenticated } = useAuth();
  const isIOS = Platform.OS === "ios";
  const hasAnnouncement = Boolean(announcement);
  const noticeHeight = useDerivedValue(() => hasAnnouncement
    ? typeof announcementHeight === "number" ? announcementHeight : announcementHeight.value : 0);
  const collapseDistance = useDerivedValue(() => noticeHeight.value + UNIFIED_HEADER_TOP_BAR_HEIGHT);
  const categoryScrollY = useDerivedValue(() => {
    const y = typeof scrollY === "number" ? scrollY : scrollY?.value || 0;
    return Math.max(0, y - noticeHeight.value);
  });

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

  const handleCategoryPress = useCallback(
    (item: MusicCategoryItem) => {
      if (item.id === selectedCategory) return;
      if (Platform.OS !== "web") {
        void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      }
      onSelectCategory(item.id);
    },
    [onSelectCategory, selectedCategory]
  );

  // Keep scroll-driven header geometry on the UI thread.
  const headerContainerAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    const y = typeof scrollY === "number" ? scrollY : scrollY ? scrollY.value : 0;
    const clampedY = Math.min(collapseDistance.value, Math.max(0, y));
    return {
      height: topInset + noticeHeight.value + UNIFIED_HEADER_TOTAL_HEIGHT - clampedY,
    };
  });

  const movingContentStyle = useAnimatedStyle(() => {
    const y = typeof scrollY === "number" ? scrollY : scrollY?.value || 0;
    return { transform: [{ translateY: -Math.min(collapseDistance.value, Math.max(0, y)) }] };
  });

  const safeAreaProtectionStyle = useAnimatedStyle(() => {
    const y = typeof scrollY === "number" ? scrollY : scrollY?.value || 0;
    return { opacity: Math.min(1, Math.max(0, y) / 16) };
  });

  const stickyDockBgAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    const y = categoryScrollY.value;
    const clampedY = Math.min(UNIFIED_HEADER_TOP_BAR_HEIGHT, Math.max(0, y));
    const progress = Math.min(1, Math.max(0, clampedY / UNIFIED_HEADER_TOP_BAR_HEIGHT));
    return {
      opacity: progress,
    };
  });

  const topBarAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    const y = categoryScrollY.value;
    const clampedY = Math.min(UNIFIED_HEADER_TOP_BAR_HEIGHT, Math.max(0, y));
    const opacity = Math.max(0, 1 - clampedY / (UNIFIED_HEADER_TOP_BAR_HEIGHT * 0.75));
    return {
      opacity,
    };
  });

  const festivalOverlayAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    const y = categoryScrollY.value;
    const clampedY = Math.min(UNIFIED_HEADER_TOP_BAR_HEIGHT, Math.max(0, y));
    const progress = clampedY / UNIFIED_HEADER_TOP_BAR_HEIGHT;
    return {
      opacity: Math.max(0, 1 - progress),
    };
  });

  // Dynamic Category Items (Custom categories or label overrides)
  const categoriesData = useMemo(() => {
    if (Array.isArray(themeConfig?.customCategories) && themeConfig.customCategories.length > 0) {
      return MAVRIXFY_MUSIC_CATEGORIES.map((item) => {
        const cat = themeConfig.customCategories?.find(category => category.id === item.id);
        if (!cat) return item;
        return {
        id: item.id,
        label: cat.label || cat.id,
        focusedIcon: (cat.icon as any) || "musical-notes",
        unfocusedIcon: (`${cat.icon || "musical-notes"}-outline` as any),
        };
      });
    }

    const labelOverrides = themeConfig?.menuLabels;
    if (labelOverrides && typeof labelOverrides === "object") {
      const base = enableSpotify ? MAVRIXFY_MUSIC_CATEGORIES : MAVRIXFY_MUSIC_CATEGORIES.filter(c => c.id !== "Spotify");
    return base.map((item) => ({
        ...item,
        label: labelOverrides[item.id] || labelOverrides[item.label] || item.label,
      }));
    }

    return enableSpotify ? MAVRIXFY_MUSIC_CATEGORIES : MAVRIXFY_MUSIC_CATEGORIES.filter(c => c.id !== "Spotify");
  }, [enableSpotify, themeConfig?.customCategories, themeConfig?.menuLabels]);

  const renderCategoryItem = useCallback(
    ({ item }: ListRenderItemInfo<MusicCategoryItem>) => {
      const active = selectedCategory === item.id;

      return (
        <CategoryTabItem
          item={item}
          active={active}
          isIOS={isIOS}
          isFestival={isFestival}
          scrollY={categoryScrollY}
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
      categoryScrollY,
      selectedCategory,
    ]
  );

  return (
    <Animated.View
      style={[
        styles.headerRoot,
        headerContainerAnimatedStyle,
      ]}
      pointerEvents="box-none"
    >
      {/* ── Solid #0B0F14 Base Dock Layer: Fades in on scroll so at rest (without festival) the ambient song backdrop shines through ── */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: Colors.background },
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

      <Animated.View style={movingContentStyle} pointerEvents="box-none">
        <View style={{ height: topInset }} />
        {announcement}

        {/* The announcement and branding move together; only categories remain docked. */}
        <HomeTopBarRow
          handleProfilePress={handleProfilePress}
          handleDownloadPress={handleDownloadPress}
          isAuthenticated={isAuthenticated}
          user={user}
          headerIconColor={headerIconColor}
          titleColor={titleColor}
          titleText={titleText}
          topBarAnimatedStyle={topBarAnimatedStyle}
          scrollY={categoryScrollY}
        />

        {/* A small native scroll row keeps every menu option mounted without clipping. */}
        <View style={styles.menuRailRow} pointerEvents="box-none">
          <FlatList data={categoriesData} renderItem={renderCategoryItem} keyExtractor={categoryKey}
            horizontal showsHorizontalScrollIndicator={false} bounces={false}
            overScrollMode="never" removeClippedSubviews={false} contentContainerStyle={styles.menuScrollContent}
            initialNumToRender={categoriesData.length} maxToRenderPerBatch={categoriesData.length} />
        </View>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[
        styles.safeAreaProtection,
        { height: topInset },
        safeAreaProtectionStyle,
      ]} />
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
  safeAreaProtection: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    backgroundColor: Colors.background,
  },
  menuScrollContent: {
    flexDirection: "row",
    paddingHorizontal: 12,
    alignItems: "center",
    height: UNIFIED_HEADER_MENU_HEIGHT,
  },
});

export default HomeUnifiedTopHeader;
