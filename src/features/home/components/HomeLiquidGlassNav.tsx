import React, {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  AccessibilityInfo,
  FlatList,
  UIManager,
  requireNativeComponent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";
import { colorWithAlpha } from "@/lib/colorExtractor";
import {
  AppTopHeaderProfileButton,
  AppTopHeaderDownloadButton,
} from "@/components/AppTopHeader";

export interface MusicCategory {
  id: string;
  name: string;
}

export const MAVRIXFY_MUSIC_CATEGORIES: MusicCategory[] = [
  { id: "all", name: "All" },
  { id: "trending", name: "Trending" },
  { id: "new-releases", name: "New Releases" },
  { id: "made-for-you", name: "Made for You" },
  { id: "recently-played", name: "Recently Played" },
  { id: "charts", name: "Charts" },
  { id: "hindi", name: "Hindi" },
  { id: "bollywood", name: "Bollywood" },
  { id: "punjabi", name: "Punjabi" },
  { id: "english", name: "English" },
  { id: "gujarati", name: "Gujarati" },
  { id: "tamil", name: "Tamil" },
  { id: "telugu", name: "Telugu" },
  { id: "indie", name: "Indie" },
  { id: "lo-fi", name: "Lo-fi" },
  { id: "romantic", name: "Romantic" },
  { id: "devotional", name: "Devotional" },
];

const CATEGORY_NAMES = MAVRIXFY_MUSIC_CATEGORIES.map((c) => c.name);

export interface HomeLiquidGlassNavProps {
  topInset: number;
  elevated?: boolean;
  elevationProgress?: number;
  ambientColor?: string;
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
}

interface NativeCategorySelectEvent {
  index: number;
}

interface NativeMavrixfyTopNavigationProps {
  categories: string[];
  selectedIndex: number;
  onCategorySelect: (event: NativeSyntheticEvent<NativeCategorySelectEvent>) => void;
  style?: object;
}

function resolveNativeTopNavigation(): React.ComponentType<NativeMavrixfyTopNavigationProps> | null {
  if (Platform.OS !== "ios") return null;
  try {
    const hasViewManager = Boolean(
      (UIManager.getViewManagerConfig &&
        (UIManager.getViewManagerConfig("MavrixfyTopNavigation") ||
          UIManager.getViewManagerConfig("MavrixfyTopNavigationManager") ||
          UIManager.getViewManagerConfig("MavrixfyTopNavigationNativeView"))) ||
        (UIManager as unknown as Record<string, unknown>)?.["MavrixfyTopNavigation"] ||
        (UIManager as unknown as Record<string, unknown>)?.["MavrixfyTopNavigationManager"]
    );

    if (!hasViewManager) {
      return null;
    }

    const component = requireNativeComponent<NativeMavrixfyTopNavigationProps>("MavrixfyTopNavigation");
    if (__DEV__) {
      console.log("[Mavrixfy] ✅ Active: Official Native Apple SwiftUI Categories Navigation");
    }
    return component;
  } catch {
    return null;
  }
}

const NativeMavrixfyTopNavigation = resolveNativeTopNavigation();

export function HomeLiquidGlassNav({
  topInset,
  elevated = false,
  elevationProgress,
  ambientColor,
  selectedCategory,
  onSelectCategory,
}: HomeLiquidGlassNavProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const categoriesListRef = useRef<FlatList<MusicCategory> | null>(null);

  const selectedIndex = Math.max(
    0,
    MAVRIXFY_MUSIC_CATEGORIES.findIndex((c) => c.id === selectedCategory)
  );

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      setReduceMotion(enabled);
    });
  }, []);

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

  const handleSelectCategory = useCallback(
    (item: MusicCategory, index: number) => {
      if (item.id === selectedCategory) return;
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      onSelectCategory(item.id);

      try {
        categoriesListRef.current?.scrollToIndex({
          index,
          viewPosition: 0.5,
          animated: !reduceMotion,
        });
      } catch {
        // FlatList fallback
      }
    },
    [onSelectCategory, reduceMotion, selectedCategory]
  );

  const handleNativeCategorySelect = useCallback(
    (event: NativeSyntheticEvent<NativeCategorySelectEvent>) => {
      const index = event.nativeEvent.index;
      if (index >= 0 && index < MAVRIXFY_MUSIC_CATEGORIES.length) {
        const item = MAVRIXFY_MUSIC_CATEGORIES[index];
        if (item.id !== selectedCategory) {
          onSelectCategory(item.id);
        }
      }
    },
    [onSelectCategory, selectedCategory]
  );

  const renderCategoryItem = useCallback(
    ({ item, index }: { item: MusicCategory; index: number }) => {
      const isSelected = item.id === selectedCategory;

      return (
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel={`Category ${item.name}`}
          accessibilityState={{ selected: isSelected }}
          onPress={() => handleSelectCategory(item, index)}
          style={({ pressed }) => [
            styles.categoryItem,
            pressed && styles.categoryItemPressed,
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        >
          <View style={styles.categoryInner}>
            <Text
              style={[
                styles.categoryText,
                isSelected && styles.categoryTextSelected,
              ]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <View
              style={[
                styles.categoryCapsule,
                isSelected ? styles.categoryCapsuleSelected : styles.categoryCapsuleHidden,
              ]}
            />
          </View>
        </Pressable>
      );
    },
    [handleSelectCategory, selectedCategory]
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          paddingTop: topInset + 4,
          borderBottomColor: `rgba(223, 226, 235, ${borderAlpha})`,
          borderBottomWidth: borderAlpha > 0.01 ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      {/* Seamless-to-Elevated Background Layer */}
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

      {/* Row 1: Brand & Top Actions */}
      <View style={styles.brandRow}>
        <View style={styles.sideSlot}>
          <AppTopHeaderProfileButton />
        </View>

        <View style={styles.brandTitleWrap}>
          <Text style={styles.brandTitle}>MAVRIXFY</Text>
        </View>

        <View style={[styles.sideSlot, styles.rightSlot]}>
          <AppTopHeaderDownloadButton />
        </View>
      </View>

      {/* Categories Menu */}
      {NativeMavrixfyTopNavigation && Platform.OS === "ios" ? (
        <NativeMavrixfyTopNavigation
          categories={CATEGORY_NAMES}
          selectedIndex={selectedIndex}
          onCategorySelect={handleNativeCategorySelect}
          style={styles.nativeComponent}
        />
      ) : (
        <View style={styles.categoriesRowWrapper}>
          <FlatList
            ref={categoriesListRef}
            data={MAVRIXFY_MUSIC_CATEGORIES}
            keyExtractor={(item) => item.id}
            renderItem={renderCategoryItem}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesContent}
            bounces={Platform.OS === "ios"}
            overScrollMode="never"
            decelerationRate="fast"
            initialNumToRender={8}
            maxToRenderPerBatch={8}
          />
        </View>
      )}
    </View>
  );
}

export default React.memo(HomeLiquidGlassNav);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 25,
    overflow: "hidden",
    paddingBottom: 4,
  },
  headerElevatedBg: {
    backgroundColor: "#0B0F14",
  },
  nativeComponent: {
    width: "100%",
    minHeight: 44,
  },
  brandRow: {
    minHeight: 40,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sideSlot: {
    width: 40,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
  },
  rightSlot: {
    justifyContent: "flex-end",
  },
  brandTitleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 6,
    textTransform: "uppercase",
    textAlign: "center",
  },
  categoriesRowWrapper: {
    minHeight: 40,
    paddingTop: 4,
    paddingBottom: 4,
  },
  categoriesContent: {
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 22,
  },
  categoryItem: {
    minHeight: 38,
    justifyContent: "center",
    alignItems: "center",
  },
  categoryItemPressed: {
    opacity: 0.7,
  },
  categoryInner: {
    alignItems: "center",
    gap: 7,
  },
  categoryText: {
    color: "rgba(255, 255, 255, 0.60)",
    fontSize: 15,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
  },
  categoryTextSelected: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  categoryCapsule: {
    height: 3,
    borderRadius: 1.5,
  },
  categoryCapsuleSelected: {
    width: 22,
    backgroundColor: "#FFFFFF",
  },
  categoryCapsuleHidden: {
    width: 0,
    backgroundColor: "transparent",
  },
});
