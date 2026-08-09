import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { getBestImageUrl } from "@/lib/musicData";
import { ArtistCard, getFeaturedArtists, searchArtists } from "@/src/data/providers/ArtistProvider";
import { triggerImpact } from "@/lib/haptics";

const SEARCH_DEBOUNCE_MS = 350;
const NUM_COLUMNS = 3;

export function AllArtistsScreen() {
  return <AllArtistsScreenView />;
}

function AllArtistsScreenView() {
  const insets = useSafeAreaInsets();
  const { push: routerPush } = useRouter();
  const { width } = useWindowDimensions();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Math.max(120, insets.bottom + 100);
  const floatingBarBottom = Platform.OS === "web" ? 16 : Math.max(72, insets.bottom + 64);

  const HORIZONTAL_PAD = 16;
  const GAP = 12;
  const cardWidth = Math.floor((width - HORIZONTAL_PAD * 2 - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS);

  const [query, setQuery] = useState("");
  const [popular, setPopular] = useState<ArtistCard[]>([]);
  const [searchResults, setSearchResults] = useState<ArtistCard[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // ── Multi-select state ────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedArtistsRef = useRef<Map<string, ArtistCard> | null>(null);
  if (selectedArtistsRef.current === null) selectedArtistsRef.current = new Map<string, ArtistCard>();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchIdRef = useRef(0);
  const navigatingRef = useRef(false);
  const clearArtistSearch = useCallback(() => {
    setSearchResults([]);
    setLoadingSearch(false);
  }, []);
  const startArtistSearch = useCallback(() => {
    setLoadingSearch(true);
  }, []);
  const finishArtistSearch = useCallback((id: number, results: ArtistCard[]) => {
    if (searchIdRef.current !== id) return;
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
    setSearchResults(results);
    setLoadingSearch(false);
  }, []);

  useEffect(() => {
    getFeaturedArtists()
      .then(setPopular)
      .finally(() => setLoadingPopular(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) { clearArtistSearch(); return; }
    startArtistSearch();
    const id = ++searchIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        if (searchIdRef.current !== id) return;
        const results = await searchArtists(trimmed);
        if (searchIdRef.current === id) {
          finishArtistSearch(id, results);
        }
      } catch {
        finishArtistSearch(id, []);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [clearArtistSearch, finishArtistSearch, query, startArtistSearch]);

  const toggleSelect = useCallback((artist: ArtistCard) => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(artist.id)) next.delete(artist.id);
      else next.add(artist.id);
      return next;
    });
    const nextArtists = new Map(selectedArtistsRef.current!);
    if (nextArtists.has(artist.id)) {
      nextArtists.delete(artist.id);
    } else {
      nextArtists.set(artist.id, artist);
    }
    selectedArtistsRef.current = nextArtists;
  }, []);

  const openArtist = useCallback((artist: ArtistCard) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    const img = artist.image?.length ? getBestImageUrl(artist.image) : "";
    routerPush(
      { pathname: "/artist/[id]", params: { id: artist.id, name: artist.name, image: img } },
      { withAnchor: true, dangerouslySingular: () => "artist-profile" }
    );
    setTimeout(() => { navigatingRef.current = false; }, 600);
  }, [routerPush]);

  const handleCardPress = useCallback((artist: ArtistCard) => {
    if (selectMode) {
      // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
      toggleSelect(artist);
    } else {
      openArtist(artist);
    }
  }, [selectMode, toggleSelect, openArtist]);

  const handleCardLongPress = useCallback((artist: ArtistCard) => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelectedIds(new Set([artist.id]));
    selectedArtistsRef.current = new Map([[artist.id, artist]]);
  }, []);

  const cancelSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    selectedArtistsRef.current = new Map();
  }, []);

  const openMix = useCallback(() => {
    const selected = Array.from(selectedArtistsRef.current!.values());
    if (selected.length === 0) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    const ids    = selected.map((a) => a.id).join(",");
    const names  = selected.map((a) => a.name).join(",");
    const images = selected.map((a) => getBestImageUrl(a.image)).join(",");
    routerPush({ pathname: "/artist-mix", params: { ids, names, images } });
  }, [routerPush]);

  const renderCard = useCallback(({ item }: { item: ArtistCard }) => {
    const img = item.image?.length ? getBestImageUrl(item.image) : "";
    const isSelected = selectedIds.has(item.id);
    return (
      <Pressable
        style={[styles.card, { width: cardWidth }]}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleCardLongPress(item)}
        delayLongPress={350}
      >
        <View style={[styles.avatarWrap, { width: cardWidth, height: cardWidth }]}>
          {img ? (
            <Image
              source={{ uri: img }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={100}
              cachePolicy="memory-disk"
              recyclingKey={`artist-grid-${item.id}`}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.avatarFallback]}>
              <Ionicons name="person" size={cardWidth * 0.38} color="rgba(255,255,255,0.3)" />
            </View>
          )}
          {/* Selected overlay */}
          {isSelected ? (
            <View style={styles.selectedOverlay}>
              <Ionicons name="checkmark-circle" size={28} color={Colors.primary} />
            </View>
          ) : selectMode ? (
            // Dim unselected cards in select mode
            <View style={styles.dimOverlay} />
          ) : null}
          {/* Green border when selected */}
          {isSelected ? <View style={styles.selectedBorder} /> : null}
          {(item as any).isVerified ? (
            <View style={styles.verifiedDot}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
            </View>
          ) : null}
        </View>
        <Text style={[styles.cardName, isSelected && { color: Colors.primary }]} numberOfLines={2}>
          {item.name}
        </Text>
        {item.dominantLanguage ? (
          <Text style={styles.cardLang} numberOfLines={1}>{item.dominantLanguage}</Text>
        ) : null}
      </Pressable>
    );
  }, [cardWidth, handleCardPress, handleCardLongPress, selectedIds, selectMode]);

  const displayList = query.trim() ? searchResults : popular;
  const isSearching = query.trim().length > 0;
  const showLoader = isSearching ? loadingSearch : loadingPopular;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={selectMode ? cancelSelect : safeGoBack}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons
            name={selectMode ? "close" : "arrow-back"}
            size={22}
            color={Colors.text}
          />
        </Pressable>
        <Text style={styles.title}>
          {selectMode
            ? selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : "Select artists"
            : "Artists"}
        </Text>
        {/* Mix button in header when in select mode */}
        {selectMode ? (
          <Pressable
            style={[styles.mixHeaderBtn, selectedIds.size === 0 && { opacity: 0.35 }]}
            onPress={openMix}
            disabled={selectedIds.size === 0}
          >
            <Text style={styles.mixHeaderBtnText}>Mix</Text>
          </Pressable>
        ) : (
          <View style={{ width: 52 }} />
        )}
      </View>

      {/* ── Select mode hint ── */}
      {selectMode ? (
        <Text style={styles.selectHint}>
          Tap artists to add to mix · long-press to start
        </Text>
      ) : null}

      {/* ── Search bar (always visible, including select mode) ── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={Colors.inactive} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search artists…"
          placeholderTextColor={Colors.inactive}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          returnKeyType="search"
          selectionColor={Colors.primary}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={Colors.inactive} />
          </Pressable>
        ) : null}
      </View>

      {/* ── Grid ── */}
      {showLoader ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={displayList}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.gridContent,
            { paddingHorizontal: HORIZONTAL_PAD, paddingBottom: bottomInset },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            !isSearching && popular.length > 0 ? (
              <Text style={styles.sectionLabel}>
                {selectMode ? "Long-press any artist to start selecting" : "Popular Artists"}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            !showLoader ? (
              <View style={styles.center}>
                <Ionicons name="person-outline" size={44} color={Colors.subtext} />
                <Text style={styles.emptyText}>
                  {isSearching ? `No results for "${query}"` : "No artists yet"}
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* ── Floating Mix button (bottom) ── */}
      {selectMode && selectedIds.size > 0 ? (
        <View style={[styles.floatingBar, { bottom: floatingBarBottom }]}>
          <Pressable style={styles.floatingMixBtn} onPress={openMix}>
            <Ionicons name="musical-notes" size={18} color="#000" />
            <Text style={styles.floatingMixText}>
              Mix {selectedIds.size} Artist{selectedIds.size > 1 ? "s" : ""}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: {
    flex: 1,
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  mixHeaderBtn: {
    width: 52,
    height: 32,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  mixHeaderBtnText: {
    color: "#000",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },

  selectHint: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 20,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },

  gridContent: { paddingBottom: 120 },
  row: { gap: 12, marginBottom: 20 },
  sectionLabel: {
    color: Colors.subtext,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 14,
    marginTop: 2,
  },

  card: { alignItems: "center", gap: 7 },
  avatarWrap: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#1a1f27",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1f27",
    borderRadius: 999,
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 999,
  },
  selectedBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  verifiedDot: {
    position: "absolute",
    bottom: 6,
    right: 6,
  },
  cardName: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    lineHeight: 16,
  },
  cardLang: {
    color: Colors.subtext,
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    textTransform: "capitalize",
    marginTop: -3,
  },

  // Floating Mix bar
  floatingBar: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 50,
    boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
  },
  floatingMixBtn: {
    height: 52,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  floatingMixText: {
    color: "#000",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});

export default AllArtistsScreen;
