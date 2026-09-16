import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { getBestImageUrl } from "@/lib/musicData";
import { ArtistCard, getAllPopularArtists, searchArtists } from "@/data/providers/ArtistProvider";
import { triggerImpact } from "@/lib/haptics";
import { ArtistProfileCard } from "../components/ArtistProfileCard";
import { ArtistLanguageFilters } from "../components/ArtistLanguageFilters";
import { AllArtistsHeader } from "../components/AllArtistsHeader";
import { AllArtistsSearch } from "../components/AllArtistsSearch";
import { AllArtistsFloatingMixBar } from "../components/AllArtistsFloatingMixBar";

const SEARCH_DEBOUNCE_MS = 300;
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
  const GAP = 14;
  const cardWidth = Math.floor(
    (width - HORIZONTAL_PAD * 2 - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS
  );

  const [query, setQuery] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("All");
  const [popular, setPopular] = useState<ArtistCard[]>([]);
  const [searchResults, setSearchResults] = useState<ArtistCard[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // ── Multi-select state ────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedArtistsRef = useRef<Map<string, ArtistCard> | null>(null);
  if (selectedArtistsRef.current === null) {
    selectedArtistsRef.current = new Map<string, ArtistCard>();
  }

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
    setSearchResults(results);
    setLoadingSearch(false);
  }, []);

  useEffect(() => {
    getAllPopularArtists()
      .then(setPopular)
      .finally(() => setLoadingPopular(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      clearArtistSearch();
      return;
    }
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
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
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

  const openArtist = useCallback(
    (artist: ArtistCard) => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      const img = artist.image?.length ? getBestImageUrl(artist.image) : "";
      routerPush(
        { pathname: "/artist/[id]", params: { id: artist.id, name: artist.name, image: img } },
        { withAnchor: true, dangerouslySingular: () => "artist-profile" }
      );
      setTimeout(() => {
        navigatingRef.current = false;
      }, 600);
    },
    [routerPush]
  );

  const handleCardPress = useCallback(
    (artist: ArtistCard) => {
      if (selectMode) {
        toggleSelect(artist);
      } else {
        openArtist(artist);
      }
    },
    [selectMode, toggleSelect, openArtist]
  );

  const handleCardLongPress = useCallback((artist: ArtistCard) => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelectedIds(new Set([artist.id]));
    selectedArtistsRef.current = new Map([[artist.id, artist]]);
  }, []);

  const cancelSelect = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setSelectMode(false);
    setSelectedIds(new Set());
    selectedArtistsRef.current = new Map();
  }, []);

  const handleHeaderToggleSelect = useCallback(() => {
    if (selectMode) {
      cancelSelect();
    } else {
      setSelectMode(true);
    }
  }, [selectMode, cancelSelect]);

  const openMix = useCallback(() => {
    const selected = Array.from(selectedArtistsRef.current!.values());
    if (selected.length === 0) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    const ids = selected.map((a) => a.id).join(",");
    const names = selected.map((a) => a.name).join(",");
    const images = selected.map((a) => getBestImageUrl(a.image)).join(",");
    routerPush({ pathname: "/artist-mix", params: { ids, names, images } });
  }, [routerPush]);

  const handleClearQuery = useCallback(() => {
    setQuery("");
  }, []);

  // Derived language list
  const availableLanguages = useMemo(() => {
    const langs = new Set<string>(["All"]);
    for (const a of popular) {
      if (a.dominantLanguage) {
        const titleCase =
          a.dominantLanguage.charAt(0).toUpperCase() + a.dominantLanguage.slice(1).toLowerCase();
        langs.add(titleCase);
      }
    }
    return Array.from(langs);
  }, [popular]);

  // Filtered list
  const baseList = query.trim() ? searchResults : popular;
  const displayList = useMemo(() => {
    if (selectedLanguage === "All" || query.trim()) {
      return baseList;
    }
    return baseList.filter(
      (a) =>
        a.dominantLanguage?.toLowerCase() === selectedLanguage.toLowerCase()
    );
  }, [baseList, selectedLanguage, query]);

  const isSearching = query.trim().length > 0;
  const showLoader = isSearching ? loadingSearch : loadingPopular;

  const renderCard = useCallback(
    ({ item }: { item: ArtistCard }) => {
      const isSelected = selectedIds.has(item.id);
      return (
        <ArtistProfileCard
          artist={item}
          cardWidth={cardWidth}
          isSelected={isSelected}
          selectMode={selectMode}
          onPress={handleCardPress}
          onLongPress={handleCardLongPress}
        />
      );
    },
    [cardWidth, handleCardPress, handleCardLongPress, selectedIds, selectMode]
  );

  const keyExtractor = useCallback((item: ArtistCard) => `artist-grid-${item.id}`, []);

  const ListEmptyComponent = useMemo(() => {
    if (showLoader) return null;
    return (
      <View style={styles.center}>
        <Ionicons name="person-outline" size={48} color="rgba(255,255,255,0.2)" />
        <Text style={styles.emptyTitle}>
          {isSearching ? `No artists found for "${query}"` : "No artists found"}
        </Text>
        <Text style={styles.emptySubtitle}>Try searching for another name or keyword</Text>
      </View>
    );
  }, [showLoader, isSearching, query]);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* ── Top Header ── */}
      <AllArtistsHeader
        selectMode={selectMode}
        selectedCount={selectedIds.size}
        totalCount={popular.length}
        onBack={selectMode ? cancelSelect : safeGoBack}
        onToggleSelect={handleHeaderToggleSelect}
      />

      {/* ── Search Bar ── */}
      <AllArtistsSearch
        query={query}
        onChangeText={setQuery}
        onClear={handleClearQuery}
      />

      {/* ── Language Filters (when not searching) ── */}
      {!isSearching && availableLanguages.length > 1 && (
        <ArtistLanguageFilters
          languages={availableLanguages}
          selectedLanguage={selectedLanguage}
          onSelectLanguage={setSelectedLanguage}
        />
      )}

      {/* ── Selection hint in select mode ── */}
      {selectMode && (
        <View style={styles.hintWrap}>
          <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.4)" />
          <Text style={styles.selectHint}>Tap artists to select and create a personalized mix</Text>
        </View>
      )}

      {/* ── Artists Grid ── */}
      {showLoader ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={displayList}
          renderItem={renderCard}
          keyExtractor={keyExtractor}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.gridContent,
            { paddingHorizontal: HORIZONTAL_PAD, paddingBottom: bottomInset },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={ListEmptyComponent}
        />
      )}

      {/* ── Floating Mix Bar ── */}
      {selectMode && (
        <AllArtistsFloatingMixBar
          bottom={floatingBarBottom}
          count={selectedIds.size}
          onPress={openMix}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0E11",
  },

  hintWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  selectHint: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },

  gridContent: {
    paddingTop: 4,
    paddingBottom: 140,
  },
  row: {
    gap: 14,
    marginBottom: 18,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  emptySubtitle: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});

export default AllArtistsScreen;
