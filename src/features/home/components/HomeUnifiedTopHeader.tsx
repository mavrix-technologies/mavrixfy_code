import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  type ListRenderItemInfo,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { triggerImpact } from "@/lib/haptics";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
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
  scrollY?: number;
  isElevated?: boolean;
  elevationProgress?: number;
}

export const HomeUnifiedTopHeader = React.memo(function HomeUnifiedTopHeader({
  topInset,
  selectedCategory,
  onSelectCategory,
  scrollY = 0,
  isElevated = false,
  elevationProgress = 0,
}: HomeUnifiedTopHeaderProps) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const flatListRef = useRef<FlatList<MusicCategoryItem> | null>(null);
  const isIOS = Platform.OS === "ios";

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

  const renderCategoryItem = useCallback(
    ({ item }: ListRenderItemInfo<MusicCategoryItem>) => {
      const active = selectedCategory === item.id;

      return (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          accessibilityLabel={`Category ${item.label}`}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          onPress={() => handleCategoryPress(item)}
          style={({ pressed }) => [
            styles.categoryItem,
            isIOS && styles.categoryItemIOS,
            pressed && styles.categoryItemPressed,
          ]}
        >
          {/* Expo Ionicons Tab Icon */}
          <View style={styles.iconWrap}>
            <Ionicons
              name={active ? item.focusedIcon : item.unfocusedIcon}
              size={21}
              color={active ? "#FFFFFF" : "rgba(255, 255, 255, 0.72)"}
            />
          </View>

          {/* Tab Label */}
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[
              styles.categoryText,
              active && styles.categoryTextActive,
              isIOS && styles.categoryTextIOS,
            ]}
          >
            {item.label}
          </Text>

          {/* Active White Underline Indicator */}
          {active && <View style={styles.activeIndicator} />}
        </Pressable>
      );
    },
    [handleCategoryPress, isIOS, selectedCategory]
  );

  const keyExtractor = categoryKeyExtractor;

  // Synchronized 1:1 scroll translation with background image
  const clampedScrollY = Math.max(0, scrollY);
  const headerTranslateY = -Math.min(UNIFIED_HEADER_TOP_BAR_HEIGHT, clampedScrollY);
  const scrollProgress = Math.min(1, clampedScrollY / UNIFIED_HEADER_TOP_BAR_HEIGHT);

  // Smooth continuous background fade for sticky dock state
  const bgOpacity = Math.min(1, Math.max(0, (clampedScrollY - 10) / 38));
  const headerBgColor = bgOpacity > 0.01 ? `rgba(11, 15, 20, ${bgOpacity.toFixed(3)})` : "transparent";
  const borderAlpha = Math.min(0.08, scrollProgress * 0.08);
  const topBarOpacity = Math.max(0, 1 - scrollProgress * 1.15);

  return (
    <View
      style={[
        styles.headerRoot,
        {
          paddingTop: topInset,
          backgroundColor: headerBgColor,
          borderBottomColor: borderAlpha > 0.005 ? `rgba(255, 255, 255, ${Math.max(0.08, borderAlpha).toFixed(3)})` : "rgba(255, 255, 255, 0.06)",
          borderBottomWidth: StyleSheet.hairlineWidth,
          transform: [{ translateY: headerTranslateY }],
        },
      ]}
    >
      {/* ── Top Bar Row: Moves up 1:1 with background image on scroll ── */}
      <View
        style={[
          styles.topBarRow,
          {
            opacity: topBarOpacity,
            overflow: "hidden",
          },
        ]}
      >
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
              <Ionicons name="person" size={16} color="#FFFFFF" />
            </View>
          )}
        </Pressable>

        {/* App Branding */}
        <View style={styles.titleContainer}>
          <Text allowFontScaling={false} style={styles.appTitle}>
            MAVRIXFY
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
          <Ionicons name="arrow-down-circle-outline" size={23} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* ── Sticky Menu Rail Row: Always cleanly visible and docked ── */}
      <View style={styles.menuRailRow}>
        <FlatList
          ref={flatListRef}
          data={MAVRIXFY_MUSIC_CATEGORIES}
          keyExtractor={keyExtractor}
          renderItem={renderCategoryItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          bounces={true}
          contentContainerStyle={styles.menuScrollContent}
          style={styles.menuFlatList}
        />
      </View>
    </View>
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
  },
  menuFlatList: {
    flexGrow: 0,
    height: UNIFIED_HEADER_MENU_HEIGHT,
  },
  menuScrollContent: {
    paddingHorizontal: 12,
    alignItems: "center",
  },
  categoryItem: {
    height: UNIFIED_HEADER_MENU_HEIGHT,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    marginRight: 6,
    position: "relative",
    paddingBottom: 4,
  },
  categoryItemIOS: {
    paddingHorizontal: 16,
  },
  categoryItemPressed: {
    opacity: 0.75,
  },
  iconWrap: {
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  categoryText: {
    color: "rgba(255, 255, 255, 0.68)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  categoryTextActive: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  categoryTextIOS: {
    fontSize: 12,
  },
  activeIndicator: {
    position: "absolute",
    bottom: -StyleSheet.hairlineWidth,
    left: 4,
    right: 4,
    height: 3.5,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
    zIndex: 10,
  },
});


export default HomeUnifiedTopHeader;
