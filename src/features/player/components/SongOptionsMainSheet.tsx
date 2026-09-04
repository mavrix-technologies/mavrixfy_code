import React, { useCallback } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import DownloadButton from "@/components/DownloadButton";
import type { Song } from "@/lib/musicData";
import { styles } from "../styles/songOptionsStyles";
import {
  type SongOptionMenuItem,
  MainMenuOptionRow,
} from "./SongOptionsSubComponents";

export interface SongOptionsMainSheetProps {
  song: Song;
  menuItems: SongOptionMenuItem[];
  canShowDownload: boolean;
  bottomPad: number;
  androidSheetSwipeGesture: any;
  onDismiss: () => void;
}

export function SongOptionsMainSheet({
  song,
  menuItems,
  canShowDownload,
  bottomPad,
  androidSheetSwipeGesture,
  onDismiss,
}: SongOptionsMainSheetProps) {
  const renderItem = useCallback(
    ({ item }: { item: SongOptionMenuItem }) => <MainMenuOptionRow item={item} />,
    []
  );

  return (
    <View style={styles.root}>
      {Platform.OS === "android" && (
        <Pressable
          style={styles.backdrop}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss options"
        >
          <View pointerEvents="none" />
        </Pressable>
      )}
      <View style={styles.sheet}>
        <GestureDetector gesture={androidSheetSwipeGesture}>
          <View style={styles.headerContent}>
            <View style={styles.grabber} />
            <View style={styles.songHeader}>
              {song.coverUrl ? (
                <Image
                  recyclingKey={`options-${song.id}`}
                  source={{ uri: song.coverUrl }}
                  style={styles.artwork}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.artwork, styles.artworkFallback]}>
                  <Ionicons name="musical-note" size={22} color="#AFAFAF" />
                </View>
              )}
              <View style={styles.songText}>
                <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                <Text style={styles.songSubtitle} numberOfLines={1}>
                  {song.artist || "Unknown Artist"}
                  {song.album ? ` • ${song.album}` : ""}
                </Text>
              </View>
            </View>
          </View>
        </GestureDetector>

        <View style={styles.divider} />

        <FlatList
          data={menuItems}
          keyExtractor={(item) => item.label}
          renderItem={renderItem}
          style={styles.menu}
          contentContainerStyle={[styles.menuContent, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          ListHeaderComponent={
            canShowDownload ? (
              <DownloadButton song={song} size={22} showLabel={true} />
            ) : null
          }
        />
      </View>
    </View>
  );
}
