import React, {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { getBestImageUrl, Song } from "@/lib/musicData";
import { searchCatalog, getCatalogSongs } from "@/lib/catalogService";
import { getApiUrl } from "@/lib/query-client";
import { usePlayerActions } from "@/contexts/PlayerContext";

export interface AddSongsBottomSheetRef {
  expand: () => void;
  collapse: () => void;
  close: () => void;
}

function parseApiSong(s: any): Song | null {
  if (!s) return null;
  const audioUrl =
    (Array.isArray(s.downloadUrl)
      ? s.downloadUrl.find?.((d: any) => d.quality === "320kbps" || d.quality === "160kbps")?.url ||
        s.downloadUrl[s.downloadUrl.length - 1]?.url
      : "") ||
    s.audioUrl ||
    s.url ||
    "";

  if (!audioUrl || (!s.name && !s.title)) return null;

  const coverUrl = getBestImageUrl(s.image || s.coverUrl);
  const artist =
    typeof s.primaryArtists === "string" && s.primaryArtists.trim()
      ? s.primaryArtists.trim()
      : (s.artists?.primary || []).map((a: any) => a.name).join(", ") || "Unknown Artist";

  return {
    id: String(s.id),
    title: s.name || s.title || "",
    artist,
    album: typeof s.album === "string" ? s.album : s.album?.name || "",
    duration: Number(s.duration) || 0,
    coverUrl,
    genre: s.language || "",
    audioUrl,
    year: s.year ? String(s.year) : "",
    source: "jiosaavn",
  };
}

const AddSongsBottomSheet = memo(
  forwardRef<AddSongsBottomSheetRef, {}>((_, ref) => {
    const sheetRef = useRef<BottomSheet>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isSheetMounted, setIsSheetMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [songs, setSongs] = useState<Song[]>([]);

    const { likedSongs, likedSongIds, isLiked, toggleLike, playSong } = usePlayerActions();

    const loadInitialSongs = useCallback(async () => {
      try {
        setLoading(true);
        const catalog = await getCatalogSongs().catch(() => []);
        
        // Fetch trending songs from API for suggestion list
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}api/search/songs?query=trending hindi songs&limit=20`).catch(
          () => null
        );
        let apiSongs: Song[] = [];
        if (res && res.ok) {
          const json = await res.json().catch(() => null);
          const results = json?.data?.results || json?.results || [];
          apiSongs = results.flatMap((item: any) => {
            const parsed = parseApiSong(item);
            return parsed ? [parsed] : [];
          });
        }

        // Deduplicate songs by id
        const merged = [...catalog];
        const seen = new Set(catalog.map((s) => s.id));
        for (const s of apiSongs) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            merged.push(s);
          }
        }

        setSongs(merged);
      } catch {
        // Keep current
      } finally {
        setLoading(false);
      }
    }, []);

    const expandSheet = useCallback(() => {
      setIsSheetMounted(true);
      void loadInitialSongs();
    }, [loadInitialSongs]);

    const closeSheet = useCallback(() => {
      setIsSheetMounted(false);
      setSearchQuery("");
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        expand: expandSheet,
        collapse: closeSheet,
        close: closeSheet,
      }),
      [closeSheet, expandSheet]
    );

    const snapPoints = useMemo(() => ["85%"], []);

    const performSearch = async (query: string) => {
      if (!query.trim()) {
        void loadInitialSongs();
        return;
      }

      try {
        setLoading(true);
        const qTerm = query.trim();

        // 1. Server catalog search
        const catalogResults = await searchCatalog(qTerm).catch(() => []);

        // 2. JioSaavn song search
        const apiUrl = getApiUrl();
        const res = await fetch(
          `${apiUrl}api/search/songs?query=${encodeURIComponent(qTerm)}&limit=25`
        ).catch(() => null);

        let apiSongs: Song[] = [];
        if (res && res.ok) {
          const json = await res.json().catch(() => null);
          const results = json?.data?.results || json?.results || [];
          apiSongs = results.flatMap((item: any) => {
            const parsed = parseApiSong(item);
            return parsed ? [parsed] : [];
          });
        }

        // Combine & deduplicate
        const merged = [...catalogResults];
        const seen = new Set(catalogResults.map((s) => s.id));
        for (const s of apiSongs) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            merged.push(s);
          }
        }

        setSongs(merged);
      } catch {
        // Keep existing
      } finally {
        setLoading(false);
      }
    };

    const handleSearchTextChange = (text: string) => {
      setSearchQuery(text);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        void performSearch(text);
      }, 300);
    };

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
        />
      ),
      []
    );

    const isSongLiked = useCallback(
      (songId: string) =>
        isLiked ? isLiked(songId) : Array.isArray(likedSongIds) ? (likedSongIds as string[]).includes(songId) : false,
      [isLiked, likedSongIds]
    );

    const handleToggleAdd = (song: Song) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      toggleLike(song);
    };

    const renderSongItem = ({ item }: { item: Song }) => {
      const liked = isSongLiked(item.id);
      return (
        <Pressable
          style={s.songRow}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            playSong(item);
          }}
        >
          <Image
            source={{ uri: item.coverUrl }}
            style={s.artwork}
            contentFit="cover"
            transition={200}
          />
          <View style={s.songMeta}>
            <Text style={s.songTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={s.songArtist} numberOfLines={1}>
              {item.artist}
            </Text>
          </View>

          <Pressable
            style={[s.addBtn, liked && s.addBtnActive]}
            onPress={() => handleToggleAdd(item)}
            hitSlop={8}
          >
            <Ionicons
              name={liked ? "checkmark" : "add"}
              size={20}
              color={liked ? Colors.background : "#FFFFFF"}
            />
          </Pressable>
        </Pressable>
      );
    };

    if (!isSheetMounted) {
      return null;
    }

    return (
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        animateOnMount
        enablePanDownToClose
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={s.sheetBackground}
        handleIndicatorStyle={s.handleIndicator}
        onClose={closeSheet}
        style={{ zIndex: 999 }}
      >
        <View style={s.container}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>Add songs</Text>
            <Pressable style={s.closeBtn} onPress={closeSheet} hitSlop={8}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Search Bar */}
          <View style={s.searchContainer}>
            <Ionicons name="search" size={18} color="#8A8A8A" style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              placeholder="Search songs or artists..."
              placeholderTextColor="#8A8A8A"
              value={searchQuery}
              onChangeText={handleSearchTextChange}
              autoCorrect={false}
            />
            {searchQuery ? (
              <Pressable onPress={() => handleSearchTextChange("")} hitSlop={6}>
                <Ionicons name="close-circle" size={18} color="#8A8A8A" />
              </Pressable>
            ) : null}
          </View>

          {/* Section Header */}
          <Text style={s.sectionHeader}>
            {searchQuery.trim() ? "Search results" : "Suggested songs"}
          </Text>

          {/* Song List */}
          {loading ? (
            <View style={s.centerContainer}>
              <ActivityIndicator size="small" color="#26e19a" />
            </View>
          ) : songs.length === 0 ? (
            <View style={s.centerContainer}>
              <Text style={s.emptyText}>
                {searchQuery ? "No songs found" : "No suggestions available"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={songs}
              keyExtractor={(item) => item.id}
              renderItem={renderSongItem}
              contentContainerStyle={s.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </BottomSheet>
    );
  })
);

AddSongsBottomSheet.displayName = "AddSongsBottomSheet";

export default AddSongsBottomSheet;

const s = StyleSheet.create({
  sheetBackground: {
    backgroundColor: "#181C22",
  },
  handleIndicator: {
    backgroundColor: "#4A4A4A",
    width: 40,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  sectionHeader: {
    color: "#A0A0A0",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  listContent: {
    paddingBottom: 40,
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#282C34",
  },
  songMeta: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  songTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  songArtist: {
    color: "#A0A0A0",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnActive: {
    backgroundColor: "#26e19a",
    borderColor: "#26e19a",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: "#8A8A8A",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
