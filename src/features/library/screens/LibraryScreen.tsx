import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ListRenderItemInfo,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";
import { useLikedSongs } from "@/contexts/PlayerContext";
import { FollowedArtist } from "@/lib/followedArtists";
import OfflineBanner from "@/components/OfflineBanner";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderIconButton,
  AppTopHeaderProfileButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import { useNetwork } from "@/contexts/NetworkContext";

import {
  PlaylistListItem,
  DisplayPlaylist,
} from "../components/PlaylistListItem";
import { PlaylistGridItem } from "../components/PlaylistGridItem";
import { CreatePlaylistTile } from "../components/CreatePlaylistTile";
import {
  LibraryHeader,
  Filter,
  ViewMode,
} from "../components/LibraryHeader";
import { LibraryFooter } from "../components/LibraryFooter";
import { CreatePlaylistModal } from "../components/CreatePlaylistModal";
import { useLibraryData } from "../hooks/useLibraryData";

type CreateTileItem = { id: "__library_create_tile__"; isCreateTile: true };
type LibraryListItem = DisplayPlaylist | CreateTileItem;

const CREATE_TILE_ID = "__library_create_tile__";

function isCreateTileItem(item: LibraryListItem): item is CreateTileItem {
  return (item as CreateTileItem).isCreateTile === true;
}

const LibraryEmptyState = React.memo(({ onAddPress }: { onAddPress: () => void }) => (
  <View style={styles.emptyState}>
    <Ionicons name="albums-outline" size={40} color={Colors.subtext} />
    <Text style={styles.emptyTitle}>No playlists yet</Text>
    <View style={styles.emptyButton}>
      <Text style={styles.emptyButtonText} onPress={onAddPress}>
        Create Playlist
      </Text>
    </View>
  </View>
));
LibraryEmptyState.displayName = "LibraryEmptyState";

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetwork();
  const { likedSongsCount } = useLikedSongs();
  const [filter, setFilter] = useState<Filter>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const { isHeaderElevated, handleHeaderScroll } = useAppTopHeaderScrollElevation();

  const {
    playlists,
    followedArtists,
    isLoading,
    refreshing,
    showCreateModal,
    setShowCreateModal,
    newPlaylistName,
    setNewPlaylistName,
    newPlaylistDescription,
    setNewPlaylistDescription,
    selectedImage,
    isUploadingImage,
    resetCreateModal,
    handleRefresh,
    handleSelectImage,
    handleCreatePlaylist,
    handleDeletePlaylist,
  } = useLibraryData();

  const topInset = insets.top;

  const handleAddPress = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setShowCreateModal(true);
  }, [setShowCreateModal]);

  const openLibrarySearch = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    router.navigate("/(tabs)/search");
  }, []);

  const openLikedSongs = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    router.navigate("/(tabs)/liked-songs");
  }, []);

  const openLibraryPlaylist = useCallback((playlist: DisplayPlaylist) => {
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
    });
  }, []);

  const openArtistProfile = useCallback((artist: FollowedArtist) => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/artist/[id]",
      params: { id: artist.id, name: artist.name, image: artist.image },
    });
  }, []);

  const openBrowseArtists = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    router.push("/artists");
  }, []);

  const openDownloads = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    router.push("/downloaded-songs");
  }, []);

  const totalTrackCount = useMemo(
    () =>
      playlists.reduce((count, playlist) => {
        return count + (playlist.songs?.length || 0);
      }, 0),
    [playlists]
  );

  const listData = useMemo<LibraryListItem[]>(() => {
    if (filter === "artists") return [];

    if (viewMode !== "grid") {
      return playlists as LibraryListItem[];
    }

    return [
      ...playlists,
      { id: CREATE_TILE_ID, isCreateTile: true },
    ];
  }, [playlists, viewMode, filter]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LibraryListItem>) => {
      if (isCreateTileItem(item)) {
        return <CreatePlaylistTile onPress={handleAddPress} />;
      }
      if (viewMode === "grid") {
        return (
          <PlaylistGridItem
            item={item}
            onPress={openLibraryPlaylist}
            onLongPress={handleDeletePlaylist}
          />
        );
      }
      return (
        <PlaylistListItem
          item={item}
          onPress={openLibraryPlaylist}
          onLongPress={handleDeletePlaylist}
        />
      );
    },
    [viewMode, handleAddPress, openLibraryPlaylist, handleDeletePlaylist]
  );

  const keyExtractor = useCallback(
    (item: LibraryListItem) =>
      isCreateTileItem(item) ? item.id : `${item.id}-${item.isFirestore ? "cloud" : "local"}`,
    []
  );

  const headerActions = useMemo(
    () => (
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
    ),
    [openLibrarySearch, handleAddPress]
  );

  const listHeader = useMemo(
    () => (
      <LibraryHeader
        topPadding={topInset + APP_TOP_HEADER_HEIGHT + 12}
        filter={filter}
        viewMode={viewMode}
        likedSongCount={likedSongsCount}
        followedArtists={followedArtists}
        onSelectFilter={setFilter}
        onChangeViewMode={setViewMode}
        onOpenLikedSongs={openLikedSongs}
        onOpenArtist={openArtistProfile}
        onBrowseArtists={openBrowseArtists}
      />
    ),
    [
      topInset,
      filter,
      viewMode,
      likedSongsCount,
      followedArtists,
      openLikedSongs,
      openArtistProfile,
      openBrowseArtists,
    ]
  );

  const listFooter = useMemo(
    () => (
      <LibraryFooter
        totalTrackCount={totalTrackCount}
        playlistCount={playlists.length}
        onNavigateDownloads={openDownloads}
      />
    ),
    [totalTrackCount, playlists.length, openDownloads]
  );

  if (isLoading && playlists.length === 0) {
    return (
      <View
        style={[
          styles.container,
          styles.loadingScreen,
          { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 20 },
        ]}
      >
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
          right={headerActions}
        />
        <ActivityIndicator size="large" color={Colors.primary} />
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
      {!isOnline && <OfflineBanner />}

      <FlatList
        key={viewMode}
        data={listData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={viewMode === "grid" ? 2 : 1}
        columnWrapperStyle={viewMode === "grid" ? styles.gridColumn : undefined}
        style={styles.scrollView}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<LibraryEmptyState onAddPress={handleAddPress} />}
        ListFooterComponent={listFooter}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
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
        right={headerActions}
      />

      <CreatePlaylistModal
        visible={showCreateModal}
        name={newPlaylistName}
        description={newPlaylistDescription}
        selectedImage={selectedImage}
        isUploadingImage={isUploadingImage}
        onChangeName={setNewPlaylistName}
        onChangeDescription={setNewPlaylistDescription}
        onSelectImage={handleSelectImage}
        onSubmit={handleCreatePlaylist}
        onClose={resetCreateModal}
      />
    </View>
  );
}

export default LibraryScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingScreen: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  scrollView: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 214,
  },
  topHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gridColumn: {
    paddingHorizontal: 14,
    justifyContent: "space-between",
  },
  emptyState: {
    marginTop: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  emptyButton: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.6)",
  },
  emptyButtonText: {
    color: Colors.black,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
});
