import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, Platform,
  ScrollView, ActivityIndicator, Animated, Modal, useWindowDimensions, FlatList,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { searchArtists, ArtistCard } from "@/lib/artistService";
import { getBestImageUrl } from "@/lib/musicData";
import { openPrivacyPolicy, openTermsOfService } from "@/lib/legal";

const GENRES = [
  { id: "hindi",         label: "Hindi",         color: "#E8472A" },
  { id: "international", label: "International",  color: "#C8922A" },
  { id: "punjabi",       label: "Punjabi",        color: "#7B3FA0" },
  { id: "tamil",         label: "Tamil",          color: "#B8862A" },
  { id: "telugu",        label: "Telugu",         color: "#2A9E4F" },
  { id: "malayalam",     label: "Malayalam",      color: "#2A9E8A" },
  { id: "marathi",       label: "Marathi",        color: "#C87A2A" },
  { id: "gujarati",      label: "Gujarati",       color: "#D44A8A" },
  { id: "bengali",       label: "Bengali",        color: "#3A6EC8" },
  { id: "kannada",       label: "Kannada",        color: "#C83A3A" },
];

const GENDERS = ["Male", "Female", "Non-binary", "Other", "Prefer not to say"];

const SUGGESTED_ARTISTS_BY_GENRE: Record<string, string[]> = {
  hindi:         ["arijit singh", "shreya ghoshal", "jubin nautiyal", "armaan malik", "darshan raval", "b praak"],
  punjabi:       ["ap dhillon", "guru randhawa", "karan aujla", "shubh", "diljit dosanjh"],
  international: ["the weeknd", "taylor swift", "dua lipa", "ed sheeran", "drake"],
  tamil:         ["anirudh ravichander", "sid sriram", "yuvan shankar raja"],
  telugu:        ["devi sri prasad", "thaman s", "sid sriram"],
  gujarati:      ["falguni pathak", "aditya gadhvi", "kirtidan gadhvi"],
  marathi:       ["ajay-atul", "shankar mahadevan"],
  malayalam:     ["vineeth sreenivasan", "vidyasagar"],
  bengali:       ["arijit singh", "nachiketa chakraborty"],
  kannada:       ["rajesh krishnan", "sonu nigam"],
};

function haptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
function hapticMedium() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}
function hapticSuccess() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

// ── Step: Date of Birth ───────────────────────────────────────────────────────
function StepDOB({ value, onChange, onNext }: {
  value: Date; onChange: (d: Date) => void; onNext: () => void;
}) {
  const [show, setShow] = useState(false);
  const formatted = value.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <View style={s.stepWrap}>
      <Text style={s.stepQ}>{"What's your date\nof birth?"}</Text>
      <Pressable style={s.inputBox} onPress={() => { haptic(); setShow(true); }}>
        <Text style={s.inputBoxText}>{formatted}</Text>
      </Pressable>

      {show && Platform.OS === "android" && (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          maximumDate={new Date()}
          minimumDate={new Date(1900, 0, 1)}
          onChange={(_, d) => { if (d) onChange(d); setShow(false); }}
          themeVariant="dark"
        />
      )}

      {show && Platform.OS === "ios" && (
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
                maximumDate={new Date()}
                minimumDate={new Date(1900, 0, 1)}
                onChange={(_, d) => { if (d) onChange(d); }}
                themeVariant="dark"
                style={{ height: 200 }}
              />
            </View>
          </Pressable>
        </Modal>
      )}

      <Pressable style={s.nextBtn} onPress={() => { haptic(); onNext(); }}>
        <Text style={s.nextBtnText}>Next</Text>
      </Pressable>
    </View>
  );
}

// ── Step: Name ────────────────────────────────────────────────────────────────
function StepName({ value, onChange, onNext }: {
  value: string; onChange: (v: string) => void; onNext: () => void;
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
        autoFocus
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
      <Pressable style={s.checkRow} onPress={() => { haptic(); setNoMarketing(p => !p); }}>
        <Text style={s.checkText}>I would prefer not to receive marketing messages from Mavrixfy.</Text>
        <View style={[s.radio, noMarketing && s.radioChecked]}>
          {noMarketing ? <Ionicons name="checkmark" size={12} color="#000" /> : null}
        </View>
      </Pressable>
      <Pressable style={s.checkRow} onPress={() => { haptic(); setNoShare(p => !p); }}>
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

// ── Step: Gender ──────────────────────────────────────────────────────────────
function StepGender({ value, onChange, onNext }: {
  value: string; onChange: (v: string) => void; onNext: () => void;
}) {
  const [show, setShow] = useState(false);
  const insets = useSafeAreaInsets();
  // iOS: picker needs a selected value — default to first option
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

      {/* Native picker sheet */}
      <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          {/* Tap backdrop to dismiss */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShow(false)} />
          <View style={[s.pickerSheet, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {/* Done row */}
            <View style={s.pickerDoneRow}>
              <Pressable onPress={() => { haptic(); onChange(pickerValue); setShow(false); }}>
                <Text style={s.pickerDoneText}>Done</Text>
              </Pressable>
            </View>
            {/* Native scroll-wheel picker */}
            <Picker
              selectedValue={pickerValue}
              onValueChange={(v) => { haptic(); onChange(v as string); }}
              style={s.picker}
              itemStyle={s.pickerItem}
              dropdownIconColor="#fff"
            >
              {GENDERS.map((g) => (
                <Picker.Item key={g} label={g} value={g} color={Platform.OS === "ios" ? "#fff" : "#fff"} />
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

// ── Step: Genres ──────────────────────────────────────────────────────────────
function StepGenres({ selected, onToggle, onNext }: {
  selected: string[]; onToggle: (id: string) => void; onNext: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardW = (width - 16 * 2 - 8) / 2;
  const bottomH = Math.max(insets.bottom + 16, 32) + 52 + 24; // padding + btn height + margin

  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.stepQ, { paddingHorizontal: 16, paddingTop: 8 }]}>What music do you like?</Text>
      <ScrollView
        contentContainerStyle={{
          flexDirection: "row", flexWrap: "wrap",
          paddingHorizontal: 16, gap: 8,
          paddingBottom: bottomH + 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {GENRES.map((g) => {
          const active = selected.includes(g.id);
          return (
            <Pressable
              key={g.id}
              style={[s.genreCard, { width: cardW, backgroundColor: g.color }, active && s.genreCardActive]}
              onPress={() => { haptic(); onToggle(g.id); }}
            >
              <Text style={s.genreLabel}>{g.label}</Text>
              {active ? (
                <View style={s.genreCheck}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
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

// ── Step: Artists ─────────────────────────────────────────────────────────────
function StepArtists({ genres, selectedIds, onToggle, onFinish, saving }: {
  genres: string[];
  selectedIds: string[];
  onToggle: (a: ArtistCard) => void;
  onFinish: () => void;
  saving: boolean;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("For You");
  const [allArtists, setAllArtists] = useState<ArtistCard[]>([]);
  const [searchResults, setSearchResults] = useState<ArtistCard[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnAnim = useRef(new Animated.Value(0)).current;
  const prevMet = useRef(false);

  // 3 columns: total width minus side padding (32) minus 2 gaps (24) divided by 3
  const colW = Math.floor((width - 32 - 24) / 3);
  const avatarSize = colW - 4;

  const metGoal = selectedIds.length >= 3;

  // Animate button in/out when goal is met/unmet
  useEffect(() => {
    if (metGoal === prevMet.current) return;
    prevMet.current = metGoal;
    Animated.spring(btnAnim, {
      toValue: metGoal ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
    }).start();
  }, [metGoal]);

  // Load suggested artists from selected genres
  useEffect(() => {
    const queries = genres.flatMap((g) => SUGGESTED_ARTISTS_BY_GENRE[g] ?? []);
    const unique = [...new Set(queries)].slice(0, 15);
    setLoadingInitial(true);
    Promise.allSettled(unique.map((q) => searchArtists(q).then((r) => r[0]).catch(() => null)))
      .then((results) => {
        const seen = new Set<string>();
        const cards = results
          .filter((r): r is PromiseFulfilledResult<ArtistCard | null> => r.status === "fulfilled")
          .map((r) => r.value)
          .filter((a): a is ArtistCard => { if (!a?.id || seen.has(a.id)) return false; seen.add(a.id); return true; });
        setAllArtists(cards);
      })
      .finally(() => setLoadingInitial(false));
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setSearchResults([]); setLoadingSearch(false); return; }
    setLoadingSearch(true);
    debounceRef.current = setTimeout(() => {
      searchArtists(q).then(setSearchResults).finally(() => setLoadingSearch(false));
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const displayArtists = query.trim() ? searchResults : allArtists;
  const isSearching = query.trim().length > 0;
  const filters = ["For You", ...genres.map((g) => GENRES.find((x) => x.id === g)?.label ?? g)];
  const remaining = Math.max(0, 3 - selectedIds.length);

  // Bottom bar height for FlatList padding
  const bottomBarH = Math.max(insets.bottom + 16, 28) + 52 + 12;

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
  }, [selectedIds, colW, avatarSize, onToggle]);

  return (
    <View style={{ flex: 1 }}>
      {/* Title */}
      <Text style={[s.stepQ, { paddingHorizontal: 16, paddingTop: 8, fontSize: 28, lineHeight: 34 }]}>
        {"Choose 3 or more\nartists you like."}
      </Text>

      {/* Search bar */}
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

      {/* Filter chips — fixed height, no overflow */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        style={{ flexGrow: 0, flexShrink: 0 }}
      >
        {filters.map((f) => (
          <Pressable
            key={f}
            style={[s.filterChip, activeFilter === f && s.filterChipActive]}
            onPress={() => { haptic(); setActiveFilter(f); }}
          >
            <Text style={[s.filterChipText, activeFilter === f && s.filterChipTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Artist grid */}
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
          contentContainerStyle={{ gap: 24, paddingTop: 8, paddingBottom: metGoal ? bottomBarH + 16 : 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
        />
      )}

      {/* Bottom CTA — slides up when 3+ selected */}
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

// ── Step: Finding music ───────────────────────────────────────────────────────
function StepFinding() {
  const d1 = useRef(new Animated.Value(0.3)).current;
  const d2 = useRef(new Animated.Value(0.3)).current;
  const d3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 280, useNativeDriver: true }),
      ]));
    const a1 = pulse(d1, 0); const a2 = pulse(d2, 180); const a3 = pulse(d3, 360);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={s.center}>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
        {[d1, d2, d3].map((d, i) => (
          <Animated.View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#fff", opacity: d }} />
        ))}
      </View>
      <Text style={s.findingText}>Finding music for you...</Text>
    </View>
  );
}

// ── Step: Great picks ─────────────────────────────────────────────────────────
function StepGreatPicks({ artists }: { artists: ArtistCard[] }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 10, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

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

// ── Main screen ───────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { user, firebaseUser } = useAuth();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dob, setDob] = useState(new Date(2000, 0, 1));
  const [name, setName] = useState(user?.name || "");
  const [gender, setGender] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<ArtistCard[]>([]);

  const toggleGenre = useCallback((id: string) => {
    setGenres((p) => p.includes(id) ? p.filter((g) => g !== id) : [...p, id]);
  }, []);

  const toggleArtist = useCallback((a: ArtistCard) => {
    setSelectedArtists((p) => p.some((x) => x.id === a.id) ? p.filter((x) => x.id !== a.id) : [...p, a]);
  }, []);

  const saveToFirestore = useCallback(async () => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", firebaseUser.uid), {
        fullName: name.trim(),
        dateOfBirth: dob.toISOString().split("T")[0],
        gender,
        preferredGenres: genres,
        favoriteArtists: selectedArtists.map((a) => ({
          id: a.id,
          name: a.name,
          image: a.image?.length ? getBestImageUrl(a.image) : "",
        })),
        onboardingCompleted: true,
        updatedAt: serverTimestamp(),
      });
    } catch { /* silent */ } finally { setSaving(false); }
  }, [firebaseUser, name, dob, gender, genres, selectedArtists]);

  const handleFinish = useCallback(async () => {
    setStep(5);
    await saveToFirestore();
    setTimeout(() => {
      setStep(6);
      hapticSuccess();
      setTimeout(() => router.replace("/(tabs)"), 2000);
    }, 1800);
  }, [saveToFirestore]);

  const goBack = useCallback(() => {
    if (step === 0) { router.back(); return; }
    haptic();
    setStep((s) => s - 1);
  }, [step]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const showHeader = step < 5;

  return (
    <View style={[s.container, { paddingTop: topInset }]}>
      {showHeader && (
        <View style={s.header}>
          <Pressable onPress={goBack} style={s.backBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={s.headerTitle}>Create account</Text>
          <View style={{ width: 36 }} />
        </View>
      )}

      {step === 0 && <StepDOB value={dob} onChange={setDob} onNext={() => setStep(1)} />}
      {step === 1 && <StepName value={name} onChange={setName} onNext={() => setStep(2)} />}
      {step === 2 && <StepGender value={gender} onChange={setGender} onNext={() => setStep(3)} />}
      {step === 3 && <StepGenres selected={genres} onToggle={toggleGenre} onNext={() => setStep(4)} />}
      {step === 4 && (
        <StepArtists
          genres={genres}
          selectedIds={selectedArtists.map((a) => a.id)}
          onToggle={toggleArtist}
          onFinish={handleFinish}
          saving={saving}
        />
      )}
      {step === 5 && <StepFinding />}
      {step === 6 && <StepGreatPicks artists={selectedArtists} />}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingBottom: 4,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  stepWrap: { paddingHorizontal: 16, paddingTop: 16 },
  stepQ: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 20 },

  inputBox: {
    backgroundColor: "#2a2a2a", borderRadius: 6, paddingHorizontal: 14, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  inputBoxText: { color: "#fff", fontSize: 16, fontFamily: "Inter_400Regular", flex: 1 },

  hint: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 8, fontFamily: "Inter_400Regular" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 20 },
  legalText: { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 20, marginBottom: 12, fontFamily: "Inter_400Regular" },
  legalLink: { color: "#1DB954", fontFamily: "Inter_600SemiBold" },

  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  checkText: { flex: 1, color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  radio: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  radioChecked: { backgroundColor: "#1DB954", borderColor: "#1DB954" },

  nextBtn: {
    height: 52, borderRadius: 999, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", marginTop: 24,
  },
  nextBtnText: { color: "#000", fontSize: 16, fontFamily: "Inter_700Bold" },

  // Sheet
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#1c1c1e", borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  sheetDoneRow: { alignItems: "flex-end", paddingHorizontal: 16, paddingVertical: 12 },
  sheetDoneText: { color: "#1DB954", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  // Gender picker sheet
  pickerSheet: { backgroundColor: "#1c1c1e", borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  pickerDoneRow: {
    alignItems: "flex-end", paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.1)",
  },
  pickerDoneText: { color: "#1DB954", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  picker: { backgroundColor: "transparent" },
  pickerItem: { color: "#fff", fontSize: 18, fontFamily: "Inter_400Regular" },

  // Genres
  genreCard: {
    height: 100, borderRadius: 10, overflow: "hidden",
    justifyContent: "flex-end", padding: 10,
  },
  genreCardActive: { borderWidth: 2.5, borderColor: "#fff" },
  genreLabel: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  genreCheck: {
    position: "absolute", top: 8, right: 8, width: 22, height: 22,
    borderRadius: 11, backgroundColor: "#1DB954", alignItems: "center", justifyContent: "center",
  },

  // Artists
  artistSearchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#1c1c1e", borderRadius: 10, marginHorizontal: 16,
    paddingHorizontal: 12, height: 46, marginBottom: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  artistSearchInput: { flex: 1, color: "#fff", fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  filterRow: { paddingHorizontal: 16, gap: 8, marginBottom: 14, alignItems: "center" },
  filterChip: {
    height: 36, paddingHorizontal: 16, borderRadius: 18,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  filterChipActive: { backgroundColor: "#1DB954", borderColor: "#1DB954" },
  filterChipText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  filterChipTextActive: { color: "#000" },

  artistItem: { alignItems: "center", gap: 8 },
  artistAvatarWrap: { overflow: "hidden", backgroundColor: "#1c1c1e" },
  artistAvatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#1c1c1e" },
  artistAvatarSelected: { borderWidth: 3, borderColor: "#1DB954" },
  artistCheckOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  artistCheckBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: "#1DB954",
    alignItems: "center", justifyContent: "center",
  },
  artistName: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center", lineHeight: 15 },
  artistCountHint: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 8 },

  // Bottom bar
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: "#000",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },

  // Center screens
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  findingText: { color: "#fff", fontSize: 16, fontFamily: "Inter_500Medium" },
  greatCircle: { width: 76, height: 76, borderRadius: 38, overflow: "hidden", borderWidth: 2.5, borderColor: "#000", backgroundColor: "#1c1c1e" },
  greatText: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
});
