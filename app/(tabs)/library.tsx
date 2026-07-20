import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import * as Animated from "@/lib/nativeAnimated";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import { useAuth } from "@/contexts/AuthContext";
import { getUserPlaylists, createUserPlaylist, deleteUserPlaylist, UserPlaylist } from "@/lib/storage";
import {
  getUserFirestorePlaylists,
  createFirestorePlaylist,
  deleteFirestorePlaylist,
  updateFirestorePlaylist,
  FirestorePlaylist,
} from "@/lib/firestore";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { triggerImpact } from "@/lib/haptics";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { getFollowedArtists, FollowedArtist } from "@/lib/followedArtists";
import OfflineBanner from "@/components/OfflineBanner";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderIconButton,
  AppTopHeaderProfileButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import { useNetwork } from "@/contexts/NetworkContext";
import { sortedCopy } from "@/lib/arrayUtils";

type Filter = "playlists" | "artists" | "favorite" | null;
type ViewMode = "list" | "grid";
type DisplayPlaylist = UserPlaylist & { isFirestore?: boolean };
type CreateTileItem = { id: "__library_create_tile__"; isCreateTile: true };
type LibraryListItem = DisplayPlaylist | CreateTileItem;
type LibrarySessionCache = {
  hydrated: boolean;
  userId: string | null;
  playlists: DisplayPlaylist[];
};

const LIBRARY_SESSION_CACHE: LibrarySessionCache = {
  hydrated: false,
  userId: null,
  playlists: [],
};

const UI = {
  bg: Colors.background,
  text: Colors.text,
  subtext: Colors.subtext,
  lowSurface: Colors.surface,
  highSurface: Colors.surfaceLight,
  outline: Colors.cardBorder,
  outlineStrong: Colors.cardBorderStrong,
  primary: Colors.primary,
  primaryStrong: "#00b87b",
  onPrimary: Colors.black,
  likedFrom: Colors.primary,
  likedTo: "#00b87b",
};

const CREATE_TILE_ID = "__library_create_tile__";

function isCreateTileItem(item: LibraryListItem): item is CreateTileItem {
  return (item as CreateTileItem).isCreateTile === true;
}

function toMillis(value: any): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Date.now();
  }

  if (value && typeof value.toMillis === "function") {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : Date.now();
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function getGridPattern(id: string, index: number) {
  const seed = Array.from(id).reduce((acc, char) => acc + char.charCodeAt(0), index * 31);
  return seed % 5;
}

function openLibrarySearch() {
  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
  router.push("/(tabs)/search");
}

function openLikedSongs() {
  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
  router.push("/(tabs)/liked-songs");
}

function openLibraryPlaylist(playlist: DisplayPlaylist) {
  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
  router.push({
    pathname: "/playlist/[id]",
    params: {
      id: playlist.id,
      firestore: playlist.isFirestore ? "true" : "false",
      jiosaavn: "false",
      title: playlist.name,
      description: playlist.description || "",
      cover: playlist.coverUrl || "",
      songCount: String(playlist.songs?.length || 0),
    },
  }, {
    withAnchor: true,
    dangerouslySingular: () => "playlist-details",
  });
}

export default function LibraryScreen() {
  return <LibraryScreenView />;
}

const LibraryEmptyState = React.memo(({ onAddPress }: { onAddPress: () => void }) => (
  <View style={styles.emptyState}>
    <Ionicons name="albums-outline" size={40} color={UI.subtext} />
    <Text style={styles.emptyTitle}>No playlists yet</Text>
    <Pressable style={styles.emptyButton} onPress={onAddPress}>
      <Text style={styles.emptyButtonText}>Create Playlist</Text>
    </Pressable>
  </View>
));
LibraryEmptyState.displayName = "LibraryEmptyState";

// react-doctor-disable-next-line react-doctor/no-giant-component -- acceptable component structure for this app
function LibraryScreenView() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const { likedSongs } = usePlayerActions();
  const activeUserId = user?.id ?? null;
  const hasCachedPlaylists =
    LIBRARY_SESSION_CACHE.hydrated && LIBRARY_SESSION_CACHE.userId === activeUserId;

  const [playlists, setPlaylists] = useState<DisplayPlaylist[]>(
    hasCachedPlaylists ? LIBRARY_SESSION_CACHE.playlists : []
  );
  const [followedArtists, setFollowedArtists] = useState<FollowedArtist[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isLoading, setIsLoading] = useState(!hasCachedPlaylists);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const {
    isHeaderElevated,
    handleHeaderScroll,
  } = useAppTopHeaderScrollElevation();

  // Animated opacity for the chip row — fades when a filter is active
  const chipRowOpacityRef = useRef<Animated.Value | null>(null);
  if (chipRowOpacityRef.current === null) chipRowOpacityRef.current = new Animated.Value(1);
  const chipRowOpacity = chipRowOpacityRef.current;
  const prevFilter = useRef<Filter>(null);

  // Animate chip row on filter change
  useEffect(() => {
    if (prevFilter.current === filter) return;
    prevFilter.current = filter;
    // Quick fade out → in so the cross icon appears smoothly
    Animated.sequence([
      Animated.timing(chipRowOpacity, { toValue: 0.6, duration: 80, useNativeDriver: true }),
      Animated.timing(chipRowOpacity, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [filter, chipRowOpacity]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const resetCreateModal = useCallback(() => {
    setNewPlaylistName("");
    setNewPlaylistDescription("");
    setSelectedImage(null);
    setShowCreateModal(false);
  }, []);

  const commitPlaylists = useCallback(
    (nextPlaylists: DisplayPlaylist[]) => {
      LIBRARY_SESSION_CACHE.hydrated = true;
      LIBRARY_SESSION_CACHE.userId = activeUserId;
      LIBRARY_SESSION_CACHE.playlists = nextPlaylists;
      // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
      setPlaylists(nextPlaylists);
    },
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- activeUserId is the stable normalized form of user?.id used by this callback.
    [activeUserId]
  );

  const loadPlaylists = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setIsLoading(true);
      }

      try {
        const localPlaylists = await getUserPlaylists();
        const formattedLocalPlaylists: DisplayPlaylist[] = localPlaylists.map(
          (p): DisplayPlaylist => ({
            ...p,
            isFirestore: false,
            coverUrl: p.coverUrl || p.songs?.[0]?.coverUrl || "",
          })
        );

        if (!activeUserId) {
          commitPlaylists(
            sortedCopy(
              formattedLocalPlaylists,
              (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
            )
          );
          return;
        }

        const firestorePlaylists = await getUserFirestorePlaylists(activeUserId);
        const formattedFirestorePlaylists: DisplayPlaylist[] = firestorePlaylists.map(
          (p: FirestorePlaylist): DisplayPlaylist => ({
            id: p.id,
            name: p.name,
            description: p.description || "",
            coverUrl: p.imageUrl || p.songs?.[0]?.imageUrl || "",
            songs: (p.songs || []).map((fs: any) => ({
              id: fs.id,
              title: fs.title,
              artist: fs.artist,
              coverUrl: fs.imageUrl,
              audioUrl: fs.audioUrl,
              duration: fs.duration,
              album: "",
              genre: "",
            })),
            createdAt: toMillis(p.createdAt),
            updatedAt: toMillis(p.updatedAt),
            isFirestore: true,
          })
        );

        const firestoreIds = new Set(
          firestorePlaylists.map((fp: FirestorePlaylist) => fp.id)
        );
        const localOnlyPlaylists = formattedLocalPlaylists.filter(
          (p) => !firestoreIds.has(p.id)
        );

        const merged = sortedCopy(
          formattedFirestorePlaylists.concat(localOnlyPlaylists),
          (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
        );
        commitPlaylists(merged);
      } catch {
        const localPlaylists = await getUserPlaylists();
        const formattedLocalPlaylists: DisplayPlaylist[] = localPlaylists.map(
          (p): DisplayPlaylist => ({
            ...p,
            isFirestore: false,
            coverUrl: p.coverUrl || p.songs?.[0]?.coverUrl || "",
          })
        );
        commitPlaylists(
          sortedCopy(
            formattedLocalPlaylists,
            (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
          )
        );
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- activeUserId is the stable normalized form of user?.id used by this callback.
    [activeUserId, commitPlaylists]
  );

  useEffect(() => {
    const cacheMatches =
      LIBRARY_SESSION_CACHE.hydrated && LIBRARY_SESSION_CACHE.userId === activeUserId;
    if (cacheMatches) {
      setPlaylists(LIBRARY_SESSION_CACHE.playlists);
      setIsLoading(false);
      return;
    }
    loadPlaylists();
  }, [activeUserId, loadPlaylists, user?.id]);

  // Load followed artists whenever the artists tab is active
  // react-doctor-disable-next-line react-doctor/no-fetch-in-effect -- local storage read, no cancellation needed
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- filter triggers re-fetch; getFollowedArtists is a stable import
  useEffect(() => {
    getFollowedArtists().then(setFollowedArtists);
  }, [filter]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPlaylists({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadPlaylists]);

  const handleSelectImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];

        if (asset.size && asset.size > 5 * 1024 * 1024) {
          Alert.alert("Error", "Image must be less than 5MB");
          return;
        }

        setSelectedImage(asset.uri);
      }
    } catch {
      Alert.alert("Error", "Failed to select image");
    }
  };

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;

    if (!selectedImage) {
      Alert.alert("Error", "Please select a cover image for your playlist");
      return;
    }

    try {
      setIsUploadingImage(true);
      const imageUrl = await uploadImageToCloudinary(selectedImage);

      if (!imageUrl) {
        Alert.alert("Error", "Failed to upload image. Please try again.");
        return;
      }

      if (user && user.id) {
        const newPlaylist = await createFirestorePlaylist(
          user.id,
          user.name || "Unknown User",
          name,
          newPlaylistDescription || ""
        );

        if (newPlaylist) {
          await updateFirestorePlaylist(newPlaylist.id, { imageUrl });
          await createUserPlaylist(name, newPlaylistDescription);
        }
      } else {
        await createUserPlaylist(name, newPlaylistDescription);
      }

      resetCreateModal();
      await loadPlaylists({ silent: true });
      Alert.alert("Success", "Playlist created successfully!");
    } catch {
      Alert.alert("Error", "Failed to create playlist. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDeletePlaylist = (playlist: DisplayPlaylist) => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Delete Playlist", `Are you sure you want to delete "${playlist.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (playlist.isFirestore) {
              await deleteFirestorePlaylist(playlist.id);
            } else {
              await deleteUserPlaylist(playlist.id);
            }
            await loadPlaylists({ silent: true });
          } catch {
            Alert.alert("Error", "Failed to delete playlist");
          }
        },
      },
    ]);
  };

  const handleAddPress = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setShowCreateModal(true);
  }, []);

  const filteredPlaylists = useMemo(() => playlists, [playlists]);
  const totalTrackCount = useMemo(
    () =>
      playlists.reduce((count, playlist) => {
        return count + (playlist.songs?.length || 0);
      }, 0),
    [playlists]
  );
  const likedSongCount = useMemo(
    () => likedSongs.filter((song) => song && song.id && song.title).length,
    [likedSongs]
  );

  const listData = useMemo<LibraryListItem[]>(() => {
    // Hide playlist rows when "artists" filter is active
    if (filter === "artists") return [];

    if (viewMode !== "grid") {
      return filteredPlaylists as LibraryListItem[];
    }

    return [
      ...filteredPlaylists,
      { id: CREATE_TILE_ID, isCreateTile: true },
    ];
  }, [filteredPlaylists, viewMode, filter]);

  const renderListPlaylistItem = ({ item }: { item: DisplayPlaylist }) => {
    const subtitle =
      item.description?.trim() ||
      `${item.songs?.length || 0} track${(item.songs?.length || 0) === 1 ? "" : "s"}`;

    return (
      <Pressable
        style={({ pressed }) => [styles.playlistCard, pressed && styles.pressed]}
        onPress={() => openLibraryPlaylist(item)}
        onLongPress={() => handleDeletePlaylist(item)}
      >
        {item.coverUrl ? (
          <Image 
            recyclingKey={item.id}
            source={{ uri: item.coverUrl }} 
            style={styles.playlistCover} 
            contentFit="cover" />
        ) : (
          <View style={[styles.playlistCover, styles.playlistCoverPlaceholder]}>
            <Ionicons name="musical-notes" size={22} color={UI.subtext} />
          </View>
        )}

        <View style={styles.playlistInfo}>
          <Text style={styles.playlistName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.playlistMeta} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={19} color={UI.subtext} style={styles.playlistActionIcon} />
      </Pressable>
    );
  };

  const renderGridPlaylistItem = ({
    item,
    index,
  }: {
    item: LibraryListItem;
    index: number;
  }) => {
    const pattern = getGridPattern(item.id, index);
    const rotationStyle =
      pattern === 1
        ? styles.gridCardRotateLeft
        : pattern === 2
          ? styles.gridCardRotateRight
          : pattern === 3
            ? styles.gridCardRotateSoftLeft
            : pattern === 4
              ? styles.gridCardRotateSoftRight
              : undefined;

    if (isCreateTileItem(item)) {
      return (
        <Pressable
          style={({ pressed }) => [
            styles.gridCard,
            rotationStyle,
            styles.createGridCard,
            pressed && styles.pressed,
          ]}
          onPress={handleAddPress}
        >
          <View style={[styles.gridImageWrap, styles.createGridArtwork]}>
            <View style={styles.createGridIconWrap}>
              <Ionicons name="add" size={18} color={UI.text} />
            </View>
          </View>
          <View style={styles.gridInfo}>
            <Text style={styles.gridName} numberOfLines={1}>
              Add New
            </Text>
            <Text style={styles.gridMeta} numberOfLines={1}>
              Create playlist
            </Text>
          </View>
        </Pressable>
      );
    }

    const subtitle = item.description?.trim() || "Playlist • Mavrixfy";

    return (
      <Pressable
        style={({ pressed }) => [
          styles.gridCard,
          rotationStyle,
          pressed && styles.pressed,
        ]}
        onPress={() => openLibraryPlaylist(item)}
        onLongPress={() => handleDeletePlaylist(item)}
      >
        {item.coverUrl ? (
          <View style={styles.gridImageWrap}>
            <Image 
              recyclingKey={item.id}
              source={{ uri: item.coverUrl }} 
              style={styles.gridImage} 
              contentFit="cover" />
            <View style={styles.gridFloatingPlay}>
              <Ionicons name="play" size={13} color={UI.onPrimary} />
            </View>
          </View>
        ) : (
          <View style={[styles.gridImageWrap, styles.gridPlaceholder]}>
            <Ionicons name="musical-notes" size={22} color={UI.subtext} />
          </View>
        )}
        <View style={styles.gridInfo}>
          <Text style={styles.gridName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.gridMeta} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
    );
  };

  const libraryHeaderActions = (
    <View style={styles.topHeaderActions}>
      <AppTopHeaderIconButton
        iconName="search-outline"
        accessibilityLabel="Search library"
        onPress={openLibrarySearch}
        haptic={false}
      />
      <AppTopHeaderIconButton
        iconName="add"
        accessibilityLabel="Create playlist"
        onPress={handleAddPress}
        iconSize={22}
        variant="primary"
        haptic={false}
      />
    </View>
  );

  const ListHeaderComponent = (
    <View style={[styles.headerBlock, { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 12 }]}>
      <Animated.View style={[styles.filterAndToggleRow, { opacity: chipRowOpacity }]}>
        {/* Chips — show × on left when active, tap active chip to deselect */}
        <View style={styles.filterRow}>
          {/* "Playlists" chip */}
          <Pressable
            style={[styles.filterChip, filter === "playlists" && styles.filterChipActive]}
            onPress={() => setFilter(filter === "playlists" ? null : "playlists")}
          >
            {filter === "playlists" ? (
              <Ionicons name="close" size={13} color={UI.onPrimary} style={styles.chipClose} />
            ) : null}
            <Text style={[styles.filterText, filter === "playlists" && styles.filterTextActive]}>Playlists</Text>
          </Pressable>

          {/* "Artists" chip */}
          <Pressable
            style={[styles.filterChip, filter === "artists" && styles.filterChipActive]}
            onPress={() => setFilter(filter === "artists" ? null : "artists")}
          >
            {filter === "artists" ? (
              <Ionicons name="close" size={13} color={UI.onPrimary} style={styles.chipClose} />
            ) : null}
            <Text style={[styles.filterText, filter === "artists" && styles.filterTextActive]}>Artists</Text>
          </Pressable>

          {/* "Liked" chip — navigates directly */}
          <Pressable
            style={[styles.filterChip, filter === "favorite" && styles.filterChipActive]}
            onPress={() => {
              if (filter === "favorite") { setFilter(null); return; }
              setFilter("favorite");
              openLikedSongs();
            }}
          >
            {filter === "favorite" ? (
              <Ionicons name="close" size={13} color={UI.onPrimary} style={styles.chipClose} />
            ) : null}
            <Text style={[styles.filterText, filter === "favorite" && styles.filterTextActive]}>Liked</Text>
          </Pressable>
        </View>

        {/* Compact icon-only toggle */}
        <View style={styles.viewToggleWrap}>
          <Pressable
            style={[styles.viewToggleButton, viewMode === "grid" && styles.viewToggleActive]}
            onPress={() => setViewMode("grid")}
          >
            <Ionicons name="grid-outline" size={16} color={viewMode === "grid" ? UI.primary : UI.subtext} />
          </Pressable>
          <Pressable
            style={[styles.viewToggleButton, viewMode === "list" && styles.viewToggleActive]}
            onPress={() => setViewMode("list")}
          >
            <Ionicons name="list-outline" size={16} color={viewMode === "list" ? UI.primary : UI.subtext} />
          </Pressable>
        </View>
      </Animated.View>

      <Pressable style={styles.likedCard} onPress={openLikedSongs}>
        <LinearGradient colors={[UI.likedFrom, UI.likedTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.likedCardGradient}>
          <Ionicons name="heart" size={82} color="rgba(223, 226, 235, 0.18)" style={styles.likedHeartBackdrop} />
          <Text style={styles.likedTitle}>Liked Songs</Text>
          <View style={styles.likedCountPill}>
            <Text style={styles.likedCount}>{likedSongCount.toLocaleString()} total songs</Text>
          </View>
          <View style={styles.likedPlayButton}>
            <Ionicons name="play" size={16} color="#ffffff" />
          </View>
        </LinearGradient>
      </Pressable>

      {/* ── Followed Artists section — shown when "Artists" or no filter ── */}
      {(filter === null || filter === "artists") ? (
        <View style={styles.artistsSection}>
          {followedArtists.length === 0 ? (
            <View style={styles.artistsEmpty}>
              <Ionicons name="person-add-outline" size={36} color={UI.subtext} />
              <Text style={styles.artistsEmptyTitle}>No followed artists yet</Text>
              <Text style={styles.artistsEmptySub}>
                Follow artists from their profile page to see them here.
              </Text>
              <Pressable style={styles.artistsEmptyBtn} onPress={() => router.push("/artists", { withAnchor: true })}>
                <Text style={styles.artistsEmptyBtnText}>Browse Artists</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.artistsHeader}>
                <Text style={styles.artistsTitle}>Following</Text>
                <Text style={styles.artistsCount}>{followedArtists.length}</Text>
              </View>
              {followedArtists.map((a) => (
                <Pressable
                  key={a.id}
                  style={({ pressed }) => [styles.artistRow, pressed && styles.pressed]}
                  onPress={() => router.push({ pathname: "/artist/[id]", params: { id: a.id, name: a.name, image: a.image } }, { withAnchor: true, dangerouslySingular: () => "artist-profile" })}
                >
                  <Image
                    recyclingKey={a.id}
                    source={{ uri: a.image || undefined }}
                    style={styles.artistRowAvatar}
                    contentFit="cover"
                    transition={80}
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.artistRowInfo}>
                    <Text style={styles.artistRowName} numberOfLines={1}>{a.name}</Text>
                    <Text style={styles.artistRowSub}>Artist</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={UI.subtext} />
                </Pressable>
              ))}
            </>
          )}
        </View>
      ) : null}
    </View>
  );

  const ListFooterComponent = (
    <View style={styles.footerSection}>
      <Text style={styles.discoverTitle}>Discover Categories</Text>
      <View style={styles.categoriesGrid}>
        <Pressable style={styles.categoryCard}>
          <View style={[styles.categoryIconWrap, { backgroundColor: "rgba(38,225,154,0.18)" }]}>
            <Ionicons name="mic-outline" size={16} color={UI.primary} />
          </View>
          <Text style={styles.categoryLabel}>Podcasts</Text>
        </Pressable>
        <Pressable style={styles.categoryCard}>
          <View style={[styles.categoryIconWrap, { backgroundColor: "rgba(38,42,49,0.9)" }]}>
            <Ionicons name="albums-outline" size={16} color={UI.subtext} />
          </View>
          <Text style={styles.categoryLabel}>Albums</Text>
        </Pressable>
        <Pressable style={styles.categoryCard}>
          <View style={[styles.categoryIconWrap, { backgroundColor: "rgba(38,42,49,0.9)" }]}>
            <Ionicons name="person-outline" size={16} color={UI.subtext} />
          </View>
          <Text style={styles.categoryLabel}>Artists</Text>
        </Pressable>
        <Pressable style={styles.categoryCard} onPress={() => router.push("/downloaded-songs")}>
          <View style={[styles.categoryIconWrap, { backgroundColor: "rgba(38,225,154,0.18)" }]}>
            <Ionicons name="download-outline" size={16} color={UI.primary} />
          </View>
          <Text style={styles.categoryLabel}>Downloads</Text>
        </Pressable>
      </View>

      <View style={styles.statsFooter}>
        <View style={styles.brandRow}>
          <Text style={styles.brandName}>Mavrixfy</Text>
          <Text style={styles.brandTag}>OBSIDIAN LIBRARY</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>{totalTrackCount.toLocaleString()} TRACKS</Text>
          <Text style={styles.statText}>{filteredPlaylists.length.toLocaleString()} PLAYLISTS</Text>
          <Text style={styles.statText}>OFFICIAL UI</Text>
        </View>
      </View>
    </View>
  );


  if (isLoading && playlists.length === 0) {
    return (
      <View style={[styles.container, styles.loadingScreen, { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 20 }]}>
        <LinearGradient
          colors={[Colors.backgroundGradientStart, Colors.background, Colors.background]}
          style={StyleSheet.absoluteFillObject}
        />
        <AppTopHeader
          topInset={topInset}
          elevated={isHeaderElevated}
          title="Your Library"
          left={<AppTopHeaderProfileButton />}
          leftWidth={88}
          rightWidth={88}
          right={libraryHeaderActions}
        />
        <ActivityIndicator size="large" color={UI.primary} />
        <Text style={styles.loadingText}>Loading your library…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.backgroundGradientStart, Colors.background, Colors.background]}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Slim offline banner — library still works offline with local playlists */}
      {!isOnline && <OfflineBanner />}
      <FlatList
        key={`${viewMode}-${filter}`}
        data={listData}
        keyExtractor={(item) =>
          isCreateTileItem(item) ? item.id : `${item.id}-${item.isFirestore ? "cloud" : "local"}`
        }
        renderItem={
          viewMode === "grid"
            ? renderGridPlaylistItem
            : ({ item }) => renderListPlaylistItem({ item: item as DisplayPlaylist })
        }
        numColumns={viewMode === "grid" ? 2 : 1}
        columnWrapperStyle={viewMode === "grid" ? styles.gridColumn : undefined}
        style={styles.scrollView}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={<LibraryEmptyState onAddPress={handleAddPress} />}
        ListFooterComponent={ListFooterComponent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={UI.primary}
            colors={[UI.primary]}
            progressViewOffset={topInset + APP_TOP_HEADER_HEIGHT}
          />
        }
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={false}
      />
      <AppTopHeader
        topInset={topInset}
        elevated={isHeaderElevated}
        title="Your Library"
        left={<AppTopHeaderProfileButton />}
        leftWidth={88}
        rightWidth={88}
        right={libraryHeaderActions}
      />

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={resetCreateModal}
      >
        <Pressable style={styles.modalOverlay} onPress={resetCreateModal}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>Create New Playlist</Text>

            <Pressable
              style={styles.imageUploadContainer}
              onPress={handleSelectImage}
              disabled={isUploadingImage}
            >
              {selectedImage ? (
                <Image source={{ uri: selectedImage }} style={styles.selectedImage} contentFit="cover" />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="image-outline" size={32} color={UI.subtext} />
                  <Text style={styles.imagePlaceholderText}>Select cover image</Text>
                </View>
              )}

              {isUploadingImage && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color={UI.primary} />
                  <Text style={styles.uploadingText}>Uploading…</Text>
                </View>
              )}
            </Pressable>

            <TextInput
              style={styles.modalInput}
              placeholder="Playlist name"
              placeholderTextColor={UI.subtext}
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              selectionColor={UI.primary}
            />

            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Description (optional)"
              placeholderTextColor={UI.subtext}
              value={newPlaylistDescription}
              onChangeText={setNewPlaylistDescription}
              multiline
              numberOfLines={3}
              selectionColor={UI.primary}
            />

            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancel} onPress={resetCreateModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalCreate,
                  (!newPlaylistName.trim() || !selectedImage || isUploadingImage) &&
                    styles.modalCreateDisabled,
                ]}
                onPress={handleCreatePlaylist}
                disabled={!newPlaylistName.trim() || !selectedImage || isUploadingImage}
              >
                <Text style={styles.modalCreateText}>Create</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  loadingScreen: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: UI.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  scrollView: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 214,
  },
  headerBlock: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(38,225,154,0.16)",
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.38)",
  },
  headerTitle: {
    color: UI.text,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    fontFamily: "Inter_800ExtraBold",
  },
  topHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: UI.highSurface,
    borderWidth: 1,
    borderColor: UI.outline,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActionButtonPrimary: {
    backgroundColor: UI.primary,
    borderColor: "rgba(38,225,154,0.55)",
  },
  headerActionButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  filterAndToggleRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 1,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: UI.highSurface,
    borderWidth: 1,
    borderColor: UI.outline,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: UI.primary,
    borderColor: "rgba(38,225,154,0.7)",
  },
  filterText: {
    color: UI.subtext,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: "Inter_700Bold",
  },
  filterTextActive: {
    color: UI.onPrimary,
  },
  chipClose: {
    marginRight: 1,
  },
  viewToggleWrap: {
    flexDirection: "row",
    gap: 2,
    flexShrink: 0,
  },
  viewToggleButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  viewToggleActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  likedCard: {
    marginTop: 10,
    borderRadius: 16,
    overflow: "hidden",
  },
  likedCardGradient: {
    minHeight: 112,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "space-between",
  },
  likedHeartBackdrop: {
    position: "absolute",
    right: -8,
    bottom: -16,
    opacity: 0.7,
  },
  likedTitle: {
    color: "#fff",
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.35,
    fontFamily: "Inter_700Bold",
  },
  likedCount: {
    color: "rgba(255,255,255,0.96)",
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_500Medium",
  },
  likedCountPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(6, 36, 26, 0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  likedPlayButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(6, 36, 26, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  sectionTitleRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sectionTitleText: {
    color: UI.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: "Inter_700Bold",
  },
  gridColumn: {
    paddingHorizontal: 14,
    justifyContent: "space-between",
    gap: 0,
  },
  gridCard: {
    width: "46%",
    borderRadius: 10,
    overflow: "visible",
    backgroundColor: "transparent",
    marginBottom: 12,
  },
  gridCardRotateLeft: {
    transform: [{ rotate: "-1.6deg" }, { translateY: 2 }],
  },
  gridCardRotateRight: {
    transform: [{ rotate: "1.6deg" }, { translateY: 3 }],
  },
  gridCardRotateSoftLeft: {
    transform: [{ rotate: "-1deg" }, { translateY: 2 }],
  },
  gridCardRotateSoftRight: {
    transform: [{ rotate: "1deg" }, { translateY: 3 }],
  },
  gridImageWrap: {
    width: "100%",
    aspectRatio: 0.82,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: UI.lowSurface,
    position: "relative",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  gridPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  gridFloatingPlay: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: UI.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.7)",
  },
  gridInfo: {
    paddingHorizontal: 2,
    paddingTop: 5,
    paddingBottom: 4,
  },
  gridName: {
    color: UI.text,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_700Bold",
  },
  gridMeta: {
    color: UI.subtext,
    fontSize: 8,
    lineHeight: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  createGridCard: {
    backgroundColor: "transparent",
  },
  createGridArtwork: {
    backgroundColor: UI.highSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  createGridIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.bg,
    borderWidth: 1,
    borderColor: UI.outline,
  },
  playlistCard: {
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  pressed: {
    opacity: 0.85,
  },
  playlistCover: {
    width: 60,
    height: 60,
    borderRadius: 9,
  },
  playlistCoverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.highSurface,
  },
  playlistInfo: {
    flex: 1,
    marginLeft: 9,
  },
  playlistName: {
    color: UI.text,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
  },
  playlistMeta: {
    marginTop: 2,
    color: UI.subtext,
    fontSize: 11,
    lineHeight: 12,
    fontFamily: "Inter_400Regular",
  },
  playlistActionIcon: {
    marginLeft: 8,
    marginRight: 2,
    opacity: 0.9,
  },
  emptyState: {
    marginTop: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyTitle: {
    color: UI.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  emptyButton: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: UI.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.6)",
  },
  emptyButtonText: {
    color: UI.onPrimary,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  footerSection: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  discoverTitle: {
    color: UI.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  categoryCard: {
    width: "48.5%",
    borderRadius: 12,
    backgroundColor: UI.highSurface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryLabel: {
    color: UI.text,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  statsFooter: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(61,74,61,0.18)",
    opacity: 0.76,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  brandName: {
    color: UI.primary,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.25,
  },
  brandTag: {
    color: UI.subtext,
    fontSize: 9,
    letterSpacing: 1.1,
    fontFamily: "Inter_700Bold",
  },
  statsRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statText: {
    color: UI.subtext,
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(8, 10, 14, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: UI.lowSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: UI.outlineStrong,
    padding: 16,
  },
  modalTitle: {
    color: UI.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 14,
  },
  imageUploadContainer: {
    width: "100%",
    height: 140,
    borderRadius: 12,
    backgroundColor: UI.highSurface,
    marginBottom: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: UI.outlineStrong,
  },
  selectedImage: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  imagePlaceholderText: {
    color: UI.subtext,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  uploadingText: {
    color: UI.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  modalInput: {
    backgroundColor: UI.highSurface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: UI.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: UI.outline,
  },
  modalTextArea: {
    height: 84,
    textAlignVertical: "top",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: UI.highSurface,
    borderWidth: 1,
    borderColor: UI.outline,
  },
  modalCancelText: {
    color: UI.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  modalCreate: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: UI.primary,
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.6)",
  },
  modalCreateDisabled: {
    opacity: 0.5,
  },
  modalCreateText: {
    color: UI.onPrimary,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },

  // ── Followed Artists ──
  artistsSection: {
    marginTop: 4,
    paddingBottom: 8,
  },
  artistsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  artistsTitle: {
    color: UI.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  artistsCount: {
    color: UI.subtext,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  artistRowAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: UI.highSurface,
  },
  artistRowInfo: { flex: 1, gap: 2 },
  artistRowName: { color: UI.text, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  artistRowSub: { color: UI.subtext, fontSize: 12, fontFamily: "Inter_400Regular" },
  artistsEmpty: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 16,
    gap: 10,
  },
  artistsEmptyTitle: {
    color: UI.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  artistsEmptySub: {
    color: UI.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 260,
  },
  artistsEmptyBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: UI.primary,
  },
  artistsEmptyBtnText: {
    color: UI.onPrimary,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});

