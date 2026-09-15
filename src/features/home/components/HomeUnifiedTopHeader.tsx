import React, { useCallback, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  type ListRenderItemInfo,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
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

export const UNIFIED_HEADER_TOP_BAR_HEIGHT = 48;
export const UNIFIED_HEADER_MENU_HEIGHT = 58;
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

interface CategoryTabItemProps {
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

const CategoryTabItem = React.memo(function CategoryTabItem({
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
    const isDocked = clampedY >= UNIFIED_HEADER_TOP_BAR_HEIGHT - 0.5;
    return {
      height: topInset + UNIFIED_HEADER_TOTAL_HEIGHT - clampedY,
      elevation: isDocked ? 3 : 0,
      shadowOpacity: isDocked ? 0.25 : 0,
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
      <Animated.View
        style={[
          styles.topBarContainer,
          topBarAnimatedStyle,
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.topBarRow}>
          {/* Profile Avatar */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            onPress={handleProfilePress}
            hitSlop={8}
            style={({ pressed }) => [
              styles.avatarButton,
              pressed && styles.buttonPressed,
            ]}
          >
            {isAuthenticated && user?.picture ? (
              <Image
                source={{ uri: user.picture }}
                style={styles.avatarImage}
                contentFit="cover"
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={16} color={headerIconColor} />
              </View>
            )}
          </Pressable>

          {/* App Branding */}
          <View style={styles.titleContainer}>
            <Text
              allowFontScaling={false}
              style={[
                styles.appTitle,
                { color: titleColor },
              ]}
            >
              {titleText}
            </Text>
          </View>

          {/* Downloads Action */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Downloads"
            onPress={handleDownloadPress}
            hitSlop={8}
            style={({ pressed }) => [
              styles.downloadButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons name="arrow-down-circle-outline" size={23} color={headerIconColor} />
          </Pressable>
        </View>
      </Animated.View>

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
          bounces={true}
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
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
  },
  topBarContainer: {
    height: UNIFIED_HEADER_TOP_BAR_HEIGHT,
    overflow: "hidden",
    zIndex: 2,
  },
  topBarRow: {
    height: UNIFIED_HEADER_TOP_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  avatarButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  appTitle: {
    color: "#FFFFFF",
    fontSize: 16.5,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 2.2,
  },
  downloadButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  menuRailRow: {
    height: UNIFIED_HEADER_MENU_HEIGHT,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.16)",
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

export default HomeUnifiedTopHeader;
