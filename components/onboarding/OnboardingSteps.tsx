import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import * as Animated from "@/lib/nativeAnimated";
import { searchArtists, type ArtistCard } from "@/lib/artistService";
import { mapFilter } from "@/lib/arrayUtils";
import { openPrivacyPolicy, openTermsOfService } from "@/lib/legal";
import { getBestImageUrl } from "@/lib/musicData";
import { haptic, hapticMedium, hapticSuccess, onboardingStyles as s } from "./onboardingShared";

const GENRES = [
  { id: "hindi", label: "Hindi", color: "#E8472A" },
  { id: "international", label: "International", color: "#C8922A" },
  { id: "punjabi", label: "Punjabi", color: "#7B3FA0" },
  { id: "tamil", label: "Tamil", color: "#B8862A" },
  { id: "telugu", label: "Telugu", color: "#2A9E4F" },
  { id: "malayalam", label: "Malayalam", color: "#2A9E8A" },
  { id: "marathi", label: "Marathi", color: "#C87A2A" },
  { id: "gujarati", label: "Gujarati", color: "#D44A8A" },
  { id: "bengali", label: "Bengali", color: "#3A6EC8" },
  { id: "kannada", label: "Kannada", color: "#C83A3A" },
];

const GENDERS = ["Male", "Female", "Non-binary", "Other", "Prefer not to say"];
const MINIMUM_BIRTH_DATE = new Date(1900, 0, 1);
const FINDING_DOT_KEYS = ["finding-dot-a", "finding-dot-b", "finding-dot-c"] as const;

type GenreOption = typeof GENRES[number];

const SUGGESTED_ARTISTS_BY_GENRE: Record<string, string[]> = {
  hindi: ["arijit singh", "shreya ghoshal", "jubin nautiyal", "armaan malik", "darshan raval", "b praak"],
  punjabi: ["ap dhillon", "guru randhawa", "karan aujla", "shubh", "diljit dosanjh"],
  international: ["the weeknd", "taylor swift", "dua lipa", "ed sheeran", "drake"],
  tamil: ["anirudh ravichander", "sid sriram", "yuvan shankar raja"],
  telugu: ["devi sri prasad", "thaman s", "sid sriram"],
  gujarati: ["falguni pathak", "aditya gadhvi", "kirtidan gadhvi"],
  marathi: ["ajay-atul", "shankar mahadevan"],
  malayalam: ["vineeth sreenivasan", "vidyasagar"],
  bengali: ["arijit singh", "nachiketa chakraborty"],
  kannada: ["rajesh krishnan", "sonu nigam"],
};

function GenreOptionCard({
  genre,
  width,
  active,
  onToggle,
}: {
  genre: GenreOption;
  width: number;
  active: boolean;
  onToggle: (id: string) => void;
}) {
  const handlePress = useCallback(() => {
    haptic();
    onToggle(genre.id);
  }, [genre.id, onToggle]);

  return (
    <Pressable
      style={[s.genreCard, { width, backgroundColor: genre.color }, active && s.genreCardActive]}
      onPress={handlePress}
    >
      <Text style={s.genreLabel}>{genre.label}</Text>
      {active ? (
        <View style={s.genreCheck}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
}

function ArtistFilterChip({
  label,
  activeFilter,
  onSelect,
}: {
  label: string;
  activeFilter: string;
  onSelect: (filter: string) => void;
}) {
  const active = activeFilter === label;
  const handlePress = useCallback(() => onSelect(label), [label, onSelect]);

  return (
    <Pressable
      style={[s.filterChip, active && s.filterChipActive]}
      onPress={handlePress}
    >
      <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function StepDOB({ value, onChange, onNext }: {
  value: Date;
  onChange: (d: Date) => void;
  onNext: () => void;
}) {
  const [show, setShow] = useState(false);
  const [maximumBirthDate] = useState(() => new Date());
  const formatted = value.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <View style={s.stepWrap}>
      <Text style={s.stepQ}>{"What's your date\nof birth?"}</Text>
      <Pressable style={s.inputBox} onPress={() => { haptic(); setShow(true); }}>
        <Text style={s.inputBoxText}>{formatted}</Text>
      </Pressable>

      {show && Platform.OS === "android" ? (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          maximumDate={maximumBirthDate}
          minimumDate={MINIMUM_BIRTH_DATE}
          onChange={(_, d) => { if (d) onChange(d); setShow(false); }}
          themeVariant="dark"
        />
      ) : null}

      {show && Platform.OS === "ios" ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <Pressable style={s.sheetOverlay} onPress={() => setShow(false)}>
            <View style={s.sheet}>
              <Pressable style={s.sheetDoneRow} onPress={() => setShow(false)}>
                <Text style={s.sheetDoneText}>Done</Text>
              </Pressable>
              <DateTimePicker
                value={value}
                mode="date"
                display="spinner"
                maximumDate={maximumBirthDate}
                minimumDate={MINIMUM_BIRTH_DATE}
                onChange={(_, d) => { if (d) onChange(d); }}
                themeVariant="dark"
                style={{ height: 200 }}
              />
            </View>
          </Pressable>
        </Modal>
      ) : null}

      <Pressable style={s.nextBtn} onPress={() => { haptic(); onNext(); }}>
        <Text style={s.nextBtnText}>Next</Text>
      </Pressable>
    </View>
  );
}

export function StepName({ value, onChange, onNext }: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const [noMarketing, setNoMarketing] = useState(false);
  const [noShare, setNoShare] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[s.stepWrap, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.stepQ}>{"What's your name?"}</Text>
      <TextInput
        style={[s.inputBox, { color: "#fff", fontSize: 16, fontFamily: "Inter_400Regular" }]}
        value={value}
        onChangeText={onChange}
        placeholder="Name"
        placeholderTextColor="rgba(255,255,255,0.3)"
        autoCapitalize="words"
        selectionColor={Colors.primary}
      />
      <Text style={s.hint}>This appears on your Mavrixfy profile.</Text>
      <View style={s.divider} />
      <Text style={s.legalText}>Mavrixfy is a personalized service.</Text>
      <Text style={s.legalText}>
        {"By tapping \"Create account\", you agree to the Mavrixfy "}
        <Text style={s.legalLink} onPress={() => void openTermsOfService()}>Terms of Use</Text>.
      </Text>
      <Text style={s.legalText}>
        {"By tapping \"Create account\", you confirm that you have read how we process your personal data in our "}
        <Text style={s.legalLink} onPress={() => void openPrivacyPolicy()}>Privacy Policy</Text>.
      </Text>
      <Pressable style={s.checkRow} onPress={() => { haptic(); setNoMarketing((p) => !p); }}>
        <Text style={s.checkText}>I would prefer not to receive marketing messages from Mavrixfy.</Text>
        <View style={[s.radio, noMarketing && s.radioChecked]}>
          {noMarketing ? <Ionicons name="checkmark" size={12} color="#000" /> : null}
        </View>
      </Pressable>
      <Pressable style={s.checkRow} onPress={() => { haptic(); setNoShare((p) => !p); }}>
        <Text style={s.checkText}>{"Share my registration data with Mavrixfy's content providers for marketing purposes."}</Text>
        <View style={[s.radio, noShare && s.radioChecked]}>
          {noShare ? <Ionicons name="checkmark" size={12} color="#000" /> : null}
        </View>
      </Pressable>
      <Pressable
        style={[s.nextBtn, { marginTop: 24, opacity: value.trim() ? 1 : 0.4 }]}
        onPress={() => { hapticMedium(); onNext(); }}
        disabled={!value.trim()}
      >
        <Text style={s.nextBtnText}>Create account</Text>
      </Pressable>
    </ScrollView>
  );
}

export function StepGender({ value, onChange, onNext }: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const [show, setShow] = useState(false);
  const insets = useSafeAreaInsets();
  const pickerValue = value || GENDERS[0];

  return (
    <View style={s.stepWrap}>
      <Text style={s.stepQ}>{"What's your gender?"}</Text>
      <Pressable style={s.inputBox} onPress={() => { haptic(); setShow(true); }}>
        <Text style={[s.inputBoxText, !value && { color: "rgba(255,255,255,0.3)" }]}>
          {value || "Select gender"}
        </Text>
        {value ? <Ionicons name="checkmark" size={18} color={Colors.primary} /> : null}
      </Pressable>

      <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShow(false)} />
          <View style={[s.pickerSheet, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <View style={s.pickerDoneRow}>
              <Pressable onPress={() => { haptic(); onChange(pickerValue); setShow(false); }}>
                <Text style={s.pickerDoneText}>Done</Text>
              </Pressable>
            </View>
            <Picker
              selectedValue={pickerValue}
              onValueChange={(v) => { haptic(); onChange(v as string); }}
              style={s.picker}
              itemStyle={s.pickerItem}
              dropdownIconColor="#fff"
            >
              {GENDERS.map((g) => (
                <Picker.Item key={g} label={g} value={g} color="#fff" />
              ))}
            </Picker>
          </View>
        </View>
      </Modal>

      <Pressable
        style={[s.nextBtn, { opacity: value ? 1 : 0.4 }]}
        onPress={() => { haptic(); onNext(); }}
        disabled={!value}
      >
        <Text style={s.nextBtnText}>Next</Text>
      </Pressable>
    </View>
  );
}

export function StepGenres({ selected, onToggle, onNext }: {
  selected: string[];
  onToggle: (id: string) => void;
  onNext: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardW = (width - 16 * 2 - 8) / 2;
  const bottomH = Math.max(insets.bottom + 16, 32) + 52 + 24;
  const renderGenre = useCallback(
    ({ item }: { item: GenreOption }) => (
      <GenreOptionCard
        genre={item}
        width={cardW}
        active={selected.includes(item.id)}
        onToggle={onToggle}
      />
    ),
    [cardW, onToggle, selected]
  );

  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.stepQ, { paddingHorizontal: 16, paddingTop: 8 }]}>What music do you like?</Text>
      <FlatList
        data={GENRES}
        keyExtractor={(genre) => genre.id}
        renderItem={renderGenre}
        numColumns={2}
        columnWrapperStyle={s.genreGridRow}
        contentContainerStyle={s.genreGrid}
        contentInset={{ bottom: bottomH + 16 }}
        scrollIndicatorInsets={{ bottom: bottomH + 16 }}
        showsVerticalScrollIndicator={false}
      />
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
        <Pressable
          style={[s.nextBtn, { opacity: selected.length > 0 ? 1 : 0.4, marginTop: 0 }]}
          onPress={() => { haptic(); onNext(); }}
          disabled={selected.length === 0}
        >
          <Text style={s.nextBtnText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

type StepArtistsProps = {
  genres: string[];
  selectedIds: string[];
  onToggle: (a: ArtistCard) => void;
  onFinish: () => void;
  saving: boolean;
};

export function StepArtists(props: StepArtistsProps) {
  return useStepArtistsView(props);
}

function useStepArtistsView({ genres, selectedIds, onToggle, onFinish, saving }: StepArtistsProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("For You");
  const [allArtists, setAllArtists] = useState<ArtistCard[]>([]);
  const [searchResults, setSearchResults] = useState<ArtistCard[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnAnimRef = useRef<Animated.Value | null>(null);
  if (btnAnimRef.current === null) btnAnimRef.current = new Animated.Value(0);
  const btnAnim = btnAnimRef.current;
  const prevMet = useRef(false);
  const initialArtistQueries = useMemo(
    () => [...new Set(genres.flatMap((g) => SUGGESTED_ARTISTS_BY_GENRE[g] ?? []))].slice(0, 15),
    [genres]
  );
  const initialArtistQueryKey = useMemo(
    () => initialArtistQueries.join("|"),
    [initialArtistQueries]
  );
  const [loadedInitialArtistKey, setLoadedInitialArtistKey] = useState<string | null>(null);
  const loadingInitial = loadedInitialArtistKey !== initialArtistQueryKey;
  const applyInitialArtists = useCallback((artists: ArtistCard[]) => {
    setAllArtists(artists);
  }, []);
  const clearArtistSearch = useCallback(() => {
    setSearchResults([]);
    setLoadingSearch(false);
  }, []);
  const startArtistSearch = useCallback(() => {
    setLoadingSearch(true);
  }, []);
  const finishArtistSearch = useCallback((artists: ArtistCard[]) => {
    setSearchResults(artists);
    setLoadingSearch(false);
  }, []);

  const colW = Math.floor((width - 32 - 24) / 3);
  const avatarSize = colW - 4;
  const metGoal = selectedIds.length >= 3;

  useEffect(() => {
    if (metGoal === prevMet.current) return;
    prevMet.current = metGoal;
    Animated.spring(btnAnim, {
      toValue: metGoal ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
    }).start();
  }, [btnAnim, metGoal]);

  useEffect(() => {
    let active = true;
    Promise.allSettled(initialArtistQueries.map((q) => searchArtists(q).then((r) => r[0]).catch(() => null)))
      .then((results) => {
        if (!active) return;
        const seen = new Set<string>();
        const cards = mapFilter(
          results.filter((r): r is PromiseFulfilledResult<ArtistCard | null> => r.status === "fulfilled"),
          (r) => r.value,
          (a): a is ArtistCard => {
            if (!a?.id || seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
          }
        );
        applyInitialArtists(cards);
      })
      .finally(() => {
        if (active) setLoadedInitialArtistKey(initialArtistQueryKey);
      });

    return () => {
      active = false;
    };
  }, [applyInitialArtists, initialArtistQueries, initialArtistQueryKey]);

  useEffect(() => {
    let active = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      clearArtistSearch();
      return;
    }
    startArtistSearch();
    debounceRef.current = setTimeout(() => {
      searchArtists(q)
        .then((results) => {
          if (active) finishArtistSearch(results);
        })
        .catch(() => {
          if (active) finishArtistSearch([]);
        });
    }, 350);
    return () => {
      active = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [clearArtistSearch, finishArtistSearch, query, startArtistSearch]);

  const displayArtists = query.trim() ? searchResults : allArtists;
  const isSearching = query.trim().length > 0;
  const filters = useMemo(
    () => ["For You", ...genres.map((g) => GENRES.find((x) => x.id === g)?.label ?? g)],
    [genres]
  );
  const bottomBarH = Math.max(insets.bottom + 16, 28) + 52 + 12;

  const handleFilterSelect = useCallback((filter: string) => {
    haptic();
    setActiveFilter(filter);
  }, []);

  const renderFilter = useCallback(
    ({ item }: { item: string }) => (
      <ArtistFilterChip label={item} activeFilter={activeFilter} onSelect={handleFilterSelect} />
    ),
    [activeFilter, handleFilterSelect]
  );

  const renderArtist = useCallback(({ item: a }: { item: ArtistCard }) => {
    const img = a.image?.length ? getBestImageUrl(a.image) : "";
    const isSelected = selectedIds.includes(a.id);
    return (
      <Pressable
        style={[s.artistItem, { width: colW }]}
        onPress={() => { haptic(); onToggle(a); }}
      >
        <View style={[
          s.artistAvatarWrap,
          { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
          isSelected && s.artistAvatarSelected,
        ]}>
          {img ? (
            <Image
              source={{ uri: img }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={80}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, s.artistAvatarFallback]}>
              <Ionicons name="person" size={avatarSize * 0.35} color="rgba(255,255,255,0.2)" />
            </View>
          )}
          {isSelected ? (
            <View style={s.artistCheckOverlay}>
              <View style={s.artistCheckBadge}>
                <Ionicons name="checkmark" size={16} color="#000" />
              </View>
            </View>
          ) : null}
        </View>
        <Text
          style={[s.artistName, isSelected && { color: Colors.primary, fontFamily: "Inter_700Bold" }]}
          numberOfLines={2}
        >
          {a.name}
        </Text>
      </Pressable>
    );
  }, [avatarSize, colW, onToggle, selectedIds]);

  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.stepQ, { paddingHorizontal: 16, paddingTop: 8, fontSize: 28, lineHeight: 34 }]}>
        {"Choose 3 or more\nartists you like."}
      </Text>

      <View style={s.artistSearchBar}>
        <Ionicons name="search" size={16} color="rgba(255,255,255,0.5)" />
        <TextInput
          style={s.artistSearchInput}
          placeholder="Search"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={query}
          onChangeText={setQuery}
          selectionColor={Colors.primary}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={filters}
        keyExtractor={(filter) => filter}
        renderItem={renderFilter}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        style={{ flexGrow: 0, flexShrink: 0 }}
      />

      {loadingInitial || (isSearching && loadingSearch) ? (
        <View style={[s.center, { flex: 1 }]}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 12, fontFamily: "Inter_400Regular" }}>
            {isSearching ? "Searching..." : "Loading artists..."}
          </Text>
        </View>
      ) : displayArtists.length === 0 ? (
        <View style={[s.center, { flex: 1 }]}>
          <Ionicons name="person-outline" size={40} color="rgba(255,255,255,0.2)" />
          <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 12, fontFamily: "Inter_400Regular" }}>
            {isSearching ? `No results for "${query}"` : "No artists found"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayArtists}
          renderItem={renderArtist}
          keyExtractor={(a) => a.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 24, paddingTop: 8 }}
          contentInset={{ bottom: metGoal ? bottomBarH + 16 : 24 }}
          scrollIndicatorInsets={{ bottom: metGoal ? bottomBarH + 16 : 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
        />
      )}

      <Animated.View
        style={[
          s.bottomBar,
          { paddingBottom: Math.max(insets.bottom + 16, 28) },
          {
            opacity: btnAnim,
            transform: [{ translateY: btnAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
          },
        ]}
        pointerEvents={metGoal ? "auto" : "none"}
      >
        <Pressable
          style={[s.nextBtn, { marginTop: 0 }]}
          onPress={() => { hapticSuccess(); onFinish(); }}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={s.nextBtnText}>Done</Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function StepFinding() {
  const d1Ref = useRef<Animated.Value | null>(null);
  if (d1Ref.current === null) d1Ref.current = new Animated.Value(0.3);
  const d1 = d1Ref.current;
  const d2Ref = useRef<Animated.Value | null>(null);
  if (d2Ref.current === null) d2Ref.current = new Animated.Value(0.3);
  const d2 = d2Ref.current;
  const d3Ref = useRef<Animated.Value | null>(null);
  if (d3Ref.current === null) d3Ref.current = new Animated.Value(0.3);
  const d3 = d3Ref.current;

  useEffect(() => {
    const pulse = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 280, useNativeDriver: true }),
      ]));
    const a1 = pulse(d1, 0);
    const a2 = pulse(d2, 180);
    const a3 = pulse(d3, 360);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [d1, d2, d3]);

  return (
    <View style={s.center}>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
        {[d1, d2, d3].map((d, i) => (
          <Animated.View key={FINDING_DOT_KEYS[i]} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#fff", opacity: d }} />
        ))}
      </View>
      <Text style={s.findingText}>Finding music for you…</Text>
    </View>
  );
}

export function StepGreatPicks({ artists }: { artists: ArtistCard[] }) {
  const scaleRef = useRef<Animated.Value | null>(null);
  if (scaleRef.current === null) scaleRef.current = new Animated.Value(0.6);
  const scale = scaleRef.current;
  const opacityRef = useRef<Animated.Value | null>(null);
  if (opacityRef.current === null) opacityRef.current = new Animated.Value(0);
  const opacity = opacityRef.current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 10, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  return (
    <View style={s.center}>
      <Animated.View style={{ alignItems: "center", opacity, transform: [{ scale }] }}>
        <View style={{ flexDirection: "row", marginBottom: 20 }}>
          {artists.slice(0, 3).map((a, i) => {
            const img = a.image?.length ? getBestImageUrl(a.image) : "";
            return (
              <View key={a.id} style={[s.greatCircle, { marginLeft: i > 0 ? -18 : 0, zIndex: 3 - i }]}>
                {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              </View>
            );
          })}
        </View>
        <Text style={s.greatText}>Great picks!</Text>
      </Animated.View>
    </View>
  );
}
