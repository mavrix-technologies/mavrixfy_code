import React, { useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { UserPlaylist } from "@/lib/storage";
import { styles } from "../styles/songOptionsStyles";

export type MergedPlaylist = UserPlaylist & { isFirestore?: boolean };
export type MenuIconName = React.ComponentProps<typeof Ionicons>["name"];
export type SongOptionMenuItem = {
  label: string;
  icon: MenuIconName;
  chevron?: boolean;
  onPress: () => void;
};

// ─── Shared sub-view header with back button ──────────────────────────────────
export function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.subHeader, pressed && styles.rowPressed]}
      onPress={onBack}
      hitSlop={8}
    >
      <Ionicons name="chevron-back" size={22} color="#BDBDBD" />
      <Text style={styles.subHeaderTitle}>{title}</Text>
    </Pressable>
  );
}

export function AddToPlaylistRow({
  playlist,
  addingId,
  onAdd,
}: {
  playlist: MergedPlaylist;
  addingId: string | null;
  onAdd: (playlist: MergedPlaylist) => Promise<void>;
}) {
  const isAdding = addingId === playlist.id;
  const handlePress = useCallback(() => {
    void onAdd(playlist);
  }, [onAdd, playlist]);

  return (
    <Pressable
      style={({ pressed }) => [styles.playlistRow, pressed && styles.rowPressed]}
      onPress={handlePress}
      disabled={isAdding}
    >
      {playlist.coverUrl ? (
        <Image source={{ uri: playlist.coverUrl }} style={styles.playlistThumb} contentFit="cover" />
      ) : (
        <View style={[styles.playlistThumb, styles.playlistThumbFallback]}>
          <Ionicons name="musical-notes" size={18} color="#777" />
        </View>
      )}
      <View style={styles.playlistInfo}>
        <Text style={styles.playlistName} numberOfLines={1}>{playlist.name}</Text>
        <Text style={styles.playlistCount}>
          {playlist.songs?.length ?? 0} {playlist.songs?.length === 1 ? "song" : "songs"}
        </Text>
      </View>
      {isAdding ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
      )}
    </Pressable>
  );
}

export function ArtistNameOptionRow({
  name,
  searching,
  onPress,
}: {
  name: string;
  searching: string | null;
  onPress: (name: string) => void;
}) {
  const isSearching = searching === name;
  const handlePress = useCallback(() => onPress(name), [name, onPress]);

  return (
    <Pressable
      style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}
      onPress={handlePress}
      disabled={isSearching}
    >
      <View style={styles.artistIcon}>
        <Ionicons name="person-outline" size={22} color="#BDBDBD" />
      </View>
      <Text style={styles.menuText} numberOfLines={1}>{name}</Text>
      {isSearching ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Ionicons name="chevron-forward" size={20} color="#555" />
      )}
    </Pressable>
  );
}

export function SongCreditRow({ row }: { row: { label: string; value: string } }) {
  return (
    <View style={styles.creditRow}>
      <Text style={styles.creditLabel}>{row.label}</Text>
      <Text style={styles.creditValue} selectable>{row.value}</Text>
    </View>
  );
}

export function MainMenuOptionRow({ item }: { item: SongOptionMenuItem }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}
      onPress={item.onPress}
    >
      <Ionicons name={item.icon} size={24} color="#BDBDBD" style={styles.menuIcon} />
      <Text style={styles.menuText} numberOfLines={2}>{item.label}</Text>
      {item.chevron ? <Ionicons name="chevron-forward" size={22} color="#BDBDBD" /> : null}
    </Pressable>
  );
}
