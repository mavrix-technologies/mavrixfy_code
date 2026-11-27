import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MusicArtwork } from "@/components/MusicArtwork";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { getBestImageUrl } from "@/lib/musicData";
import type { AlbumResult, ArtistResult, PlaylistResult } from "@/lib/searchRepository";
import { shareArtist, sharePlaylist } from "@/utils/shareUtils";
import { ImpactFeedbackStyle } from "expo-haptics";

export type SearchMenuTarget =
  | { kind: "artists"; item: ArtistResult; meta: string }
  | { kind: "albums"; item: AlbumResult; meta: string }
  | { kind: "playlists"; item: PlaylistResult; meta: string };

interface SearchResultMenuModalProps {
  target: SearchMenuTarget | null;
  onClose: () => void;
  onOpenArtist: (artist: ArtistResult) => void;
  onOpenAlbum: (album: AlbumResult, meta: string) => void;
  onOpenPlaylist: (playlist: PlaylistResult, meta: string) => void;
  onSearchQuery?: (query: string) => void;
}

interface MenuAction {
  id: string;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

export const SearchResultMenuModal = memo(function SearchResultMenuModal({
  target,
  onClose,
  onOpenArtist,
  onOpenAlbum,
  onOpenPlaylist,
  onSearchQuery,
}: SearchResultMenuModalProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom + 12, 24);

  const runAction = useCallback(
    (action: () => void) => {
      void triggerImpact(ImpactFeedbackStyle.Light);
      onClose();
      setTimeout(action, 120);
    },
    [onClose]
  );

  if (!target) return null;

  const coverUrl = getBestImageUrl(target.item.image);
  const title = target.item.name || "Untitled";
  const subtitle = target.meta;
  const isArtist = target.kind === "artists";

  const actions: MenuAction[] = [];

  if (target.kind === "artists") {
    const artist = target.item;
    actions.push({
      id: "open-artist",
      label: "Open artist",
      hint: `View ${artist.name} profile and top songs`,
      icon: "person-outline",
      onPress: () => onOpenArtist(artist),
    });
    if (onSearchQuery) {
      actions.push({
        id: "search-artist-songs",
        label: `Search songs by ${artist.name}`,
        hint: `Switch to Songs results for ${artist.name}`,
        icon: "musical-notes-outline",
        onPress: () => onSearchQuery(artist.name),
      });
    }
    actions.push({
      id: "share-artist",
      label: "Share artist",
      hint: `Share ${artist.name}`,
      icon: "share-outline",
      onPress: () => {
        shareArtist({ id: artist.id, name: artist.name, coverUrl });
      },
    });
  } else if (target.kind === "albums") {
    const album = target.item;
    actions.push({
      id: "open-album",
      label: "Open album",
      hint: `View tracks in ${album.name}`,
      icon: "disc-outline",
      onPress: () => onOpenAlbum(album, subtitle),
    });
    if (onSearchQuery) {
      const songQuery = album.artist ? `${album.name} ${album.artist}` : album.name;
      actions.push({
        id: "search-album-songs",
        label: "Search album tracks",
        hint: `Search songs from ${album.name}`,
        icon: "musical-notes-outline",
        onPress: () => onSearchQuery(songQuery),
      });
    }
    actions.push({
      id: "share-album",
      label: "Share album",
      hint: `Share ${album.name}`,
      icon: "share-outline",
      onPress: () => {
        sharePlaylist({
          id: album.id,
          name: album.name,
          coverUrl,
          songCount: album.songCount,
        });
      },
    });
  } else {
    const playlist = target.item;
    actions.push({
      id: "open-playlist",
      label: "Open playlist",
      hint: `View tracks in ${playlist.name}`,
      icon: "list-outline",
      onPress: () => onOpenPlaylist(playlist, subtitle),
    });
    actions.push({
      id: "share-playlist",
      label: "Share playlist",
      hint: `Share ${playlist.name}`,
      icon: "share-outline",
      onPress: () => {
        sharePlaylist({
          id: playlist.id,
          name: playlist.name,
          coverUrl,
          songCount: playlist.songCount,
        });
      },
    });
  }

  return (
    <Modal
      visible={Boolean(target)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close options menu"
        />
        <View style={[styles.sheet, { paddingBottom: bottomPad }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            {coverUrl ? (
              <MusicArtwork
                uri={coverUrl}
                size={56}
                style={[styles.artwork, isArtist && styles.artworkRound]}
                contentFit="cover"
                transition={0}
              />
            ) : (
              <View style={[styles.artwork, isArtist && styles.artworkRound, styles.artworkFallback]}>
                <Ionicons
                  name={isArtist ? "person" : target.kind === "albums" ? "disc" : "musical-notes"}
                  size={22}
                  color={Colors.subtext}
                />
              </View>
            )}
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.rowPressed]}
            >
              <Ionicons name="close" size={20} color={Colors.subtext} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          <View style={styles.actionList}>
            {actions.map((action) => (
              <Pressable
                key={action.id}
                onPress={() => runAction(action.onPress)}
                android_ripple={{ color: "rgba(255,255,255,0.1)" }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint={action.hint}
                style={({ pressed }) => [
                  styles.actionRow,
                  Platform.OS !== "android" && pressed && styles.rowPressed,
                ]}
              >
                <Ionicons name={action.icon} size={22} color={Colors.text} style={styles.actionIcon} />
                <Text style={styles.actionLabel} numberOfLines={1}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  sheet: {
    backgroundColor: "#141922",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.12)",
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 14,
    gap: 14,
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  artworkRound: {
    borderRadius: 28,
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    marginBottom: 6,
  },
  actionList: {
    paddingHorizontal: 8,
  },
  actionRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  rowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  actionIcon: {
    marginRight: 16,
  },
  actionLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
