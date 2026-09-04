import React from "react";
import * as Animated from "@/lib/nativeAnimated";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { unescapeHtml } from "@/utils/stringUtils";
import { styles } from "../styles/playerScreenStyles";

export interface PlayerStickyHeaderProps {
  topInset: number;
  topBarHeight: number;
  isShortScreen: boolean;
  headerBgOpacity: Animated.AnimatedInterpolation<number>;
  topTitleOpacity: Animated.AnimatedInterpolation<number>;
  topTitleTranslateY: Animated.AnimatedInterpolation<number>;
  scrolledTitleOpacity: Animated.AnimatedInterpolation<number>;
  scrolledTitleTranslateY: Animated.AnimatedInterpolation<number>;
  sheetTextColor: string;
  albumName: string;
  songTitle: string;
  songArtist: string;
  onClose: () => void;
  onOptionsPress: () => void;
}

export const PlayerStickyHeader = React.memo(function PlayerStickyHeader({
  topInset,
  topBarHeight,
  isShortScreen,
  headerBgOpacity,
  topTitleOpacity,
  topTitleTranslateY,
  scrolledTitleOpacity,
  scrolledTitleTranslateY,
  sheetTextColor,
  albumName,
  songTitle,
  songArtist,
  onClose,
  onOptionsPress,
}: PlayerStickyHeaderProps) {
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.stickyHeaderContainer,
        {
          top: 0,
          height: topInset + topBarHeight,
          paddingTop: topInset,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: "rgba(10, 14, 20, 0.96)",
            opacity: headerBgOpacity,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: "rgba(255, 255, 255, 0.08)",
          },
        ]}
      />

      <View
        style={[
          styles.topBar,
          {
            height: topBarHeight,
            paddingHorizontal: isShortScreen ? 14 : 18,
          },
        ]}
      >
        <View style={styles.headerSideGroup}>
          <Pressable
            style={({ pressed }) => [
              styles.headerIconButton,
              pressed && styles.headerIconButtonPressed,
            ]}
            onPress={onClose}
            hitSlop={12}
          >
            <Ionicons name="chevron-down" size={30} color={sheetTextColor} />
          </Pressable>
        </View>

        <View style={styles.headerCenter}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.headerTitleWrap,
              {
                opacity: topTitleOpacity,
                transform: [{ translateY: topTitleTranslateY }],
              },
            ]}
          >
            <Text style={styles.headerCaption} numberOfLines={1}>
              PLAYING FROM ALBUM
            </Text>
            <Text style={[styles.headerAlbum, { fontSize: isShortScreen ? 12 : 13 }]} numberOfLines={1}>
              {unescapeHtml(albumName || "Single")}
            </Text>
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.headerTitleWrap,
              styles.headerTitleAbsolute,
              {
                opacity: scrolledTitleOpacity,
                transform: [{ translateY: scrolledTitleTranslateY }],
              },
            ]}
          >
            <Text style={[styles.headerSongTitle, { fontSize: isShortScreen ? 12.5 : 13.5 }]} numberOfLines={1}>
              {unescapeHtml(songTitle || "")}
            </Text>
            <Text style={styles.headerSongArtist} numberOfLines={1}>
              {unescapeHtml(songArtist || "")}
            </Text>
          </Animated.View>
        </View>

        <View style={[styles.headerSideGroup, styles.headerRightGroup]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open song options"
            style={({ pressed }) => [
              styles.headerIconButton,
              pressed && styles.headerIconButtonPressed,
            ]}
            onPress={onOptionsPress}
            hitSlop={12}
          >
            <Ionicons name="ellipsis-horizontal" size={26} color={sheetTextColor} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
});

PlayerStickyHeader.displayName = "PlayerStickyHeader";
