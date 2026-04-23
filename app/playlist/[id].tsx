import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import {
  Song,
  convertJioSaavnSong,
  formatDuration,
  getBestImageUrl,
  JioSaavnSong,
} from "@/lib/musicData";
import { usePlayer } from "@/contexts/PlayerContext";
import { getUserPlaylists } from "@/lib/storage";
import { firestorePlaylistToLocalSongs, getPlaylistById } from "@/lib/firestore";
import { getCachedHomePublicPlaylists } from "@/lib/homeCache";
import SongRow from "@/components/SongRow";
import SongRowSkeleton from "@/components/SongRowSkeleton";
import { getJioSaavnPlaylistDetails } from "@/lib/jioSaavnService";

function pickFirstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const AUTO_RETRY_ATTEMPTS = 3;
const AUTO_RETRY_DELAY_MS = [350, 900];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PlaylistScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    jiosaavn?: string | string[];
    firestore?: string | string[];
    title?: string | string[];
    description?: string | string[];
    cover?: string | string[];
    songCount?: string | string[];
  }>();

  const playlistId       = pickFirstParam(params.id).trim();
  const isJioSaavnSource = pickFirstParam(params.jiosaavn) === "true";
  const isFirestoreSource = pickFirstParam(params.firestore) === "true";
  const initialTitle     = pickFirstParam(params.title).trim();
  const initialCover     = pickFirstParam(params.cover).trim();
  const initialDescription = pickFirstParam(params.description).trim();
  const initialSongCount = Math.max(0, Number(pickFirstParam(params.songCount)) || 0);
  const hasPrefilledHeader = initialTitle.length > 0 || initialCover.length > 0 || initialSongCount > 0;

  const insets = useSafeAreaInsets();
  const { playSong, currentSong, isPlaying, queue, togglePlay } = usePlayer();
  const topInset  = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 132 : Math.max(150, insets.bottom + 126);

  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading]           = useState(true);
  const [playlistName, setPlaylistName] = useState(initialTitle);
  const [playlistCover, setPlaylistCover] = useState(initialCover);
  const [playlistDescription, setPlaylistDescription] = useState(
    initialDescription || (initialSongCount > 0 ? `${initialSongCount} songs` : "")
  );
  const [songs, setSongs]       = useState<Song[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Sticky header
  const stickyOpacity = useRef(new Animated.Value(0)).current;
  const stickyVisible = useRef(false);

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalDuration = useMemo(() => songs.reduce((a, s) => a + s.duration, 0), [songs]);
  const totalDurationLabel = useMemo(() => totalDuration > 0 ? formatDuration(totalDuration) : "", [totalDuration]);
  const totalMinutes = useMemo(() => Math.max(0, Math.floor(totalDuration / 60)), [totalDuration]);
  const effectiveSongCount = useMemo(() => songs.length > 0 ? songs.length : initialSongCount, [songs.length, initialSongCount]);

  const isPlayingFromThisPlaylist = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    return songs.some((s) => s.id === currentSong.id) &&
      queue.length === songs.length &&
      queue.every((q, i) => q.id === songs[i]?.id);
  }, [currentSong, queue, songs]);

  const playlistTitleSize = useMemo(() => {
    const len = playlistName.trim().length;
    if (len <= 16) return 34;
    if (len <= 32) return 28;
    if (len <= 48) return 23;
    return 20;
  }, [playlistName]);

  // ── Normalizers ────────────────────────────────────────────────────────────
  const normalizeLoadedSongs = useCallback((rawSongs: JioSaavnSong[]): Song[] => {
    const seen = new Set<string>();
    const out: Song[] = [];
    for (const song of rawSongs.map(convertJioSaavnSong)) {
      const id = String(song.id || "").trim();
      const title = String(song.title || "").trim();
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);
      out.push({ ...song, id, title, audioUrl: String(song.audioUrl || "").trim() });
    }
    const playable = out.filter((s) => s.audioUrl.length > 0);
    return playable.length > 0 ? playable : out;
  }, []);

  const applyJioPlaylistData = useCallback((data: {
    name?: string; description?: string; songCount?: number;
    image?: { quality: string; url: string }[] | string; songs?: JioSaavnSong[];
  }): number => {
    if (data.name) setPlaylistName(data.name);
    if (data.image) setPlaylistCover(Array.isArray(data.image) ? getBestImageUrl(data.image) : data.image);
    setPlaylistDescription((data.description || "").trim() || `${data.songCount || data.songs?.length || 0} songs`);
    const finalSongs = normalizeLoadedSongs(data.songs || []);
    if (finalSongs.length > 0) setSongs(finalSongs);
    return finalSongs.length;
  }, [normalizeLoadedSongs]);

  const applyFirestorePlaylistData = useCallback((playlist: {
    name?: string; description?: string; imageUrl?: string; songs?: Song[] | unknown[];
  }) => {
    const nextSongs = firestorePlaylistToLocalSongs({
      id: playlistId,
      name: playlist.name || initialTitle || "Playlist",
      description: playlist.description || "",
      imageUrl: playlist.imageUrl || "",
      songs: Array.isArray(playlist.songs) ? playlist.songs : [],
      createdBy: { id: "", name: "Community" },
      isPublic: true,
    });
    setPlaylistName(playlist.name || initialTitle || "Playlist");
    setPlaylistDescription((playlist.description || "").trim() || `${nextSongs.length || initialSongCount} songs`);
    setPlaylistCover(playlist.imageUrl || initialCover || "");
    setSongs(nextSongs);
  }, [initialCover, initialSongCount, initialTitle, playlistId]);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!playlistId) { setNotFound(true); return; }

    setPlaylistName(initialTitle);
    setPlaylistDescription(initialDescription || (initialSongCount > 0 ? `${initialSongCount} songs` : ""));
    setPlaylistCover(initialCover);
    setSongs([]);
    setNotFound(false);
    setLoadError("");
    setLoading(true);

    const load = async () => {
      try {
        if (isFirestoreSource) {
          const playlist = await getPlaylistById(playlistId)
            ?? (await getCachedHomePublicPlaylists({ allowStale: true })).find((p) => p.id === playlistId);
          if (cancelled) return;
          if (playlist) applyFirestorePlaylistData(playlist);
          else if (!hasPrefilledHeader) setNotFound(true);
          else setLoadError("Playlist tracks could not load right now.");
          return;
        }
        if (isJioSaavnSource) {
          let loadedCount = 0;
          for (let attempt = 0; attempt < AUTO_RETRY_ATTEMPTS; attempt += 1) {
            try {
              const data = await getJioSaavnPlaylistDetails(playlistId);
              if (cancelled) return;
              loadedCount = applyJioPlaylistData(data);
              if (loadedCount > 0) {
                break;
              }
            } catch {
              // Auto-retry below.
            }

            if (attempt < AUTO_RETRY_ATTEMPTS - 1) {
              await delay(AUTO_RETRY_DELAY_MS[Math.min(attempt, AUTO_RETRY_DELAY_MS.length - 1)]);
              if (cancelled) return;
            }
          }

          if (loadedCount === 0) {
            if (!hasPrefilledHeader) setNotFound(true);
            else setLoadError("Songs are taking longer than expected to load.");
          }
          return;
        }
        const playlists = await getUserPlaylists();
        if (cancelled) return;
        const found = playlists.find((p) => p.id === playlistId);
        if (found) {
          setPlaylistName(found.name);
          setPlaylistDescription(found.description);
          setPlaylistCover(found.coverUrl);
          setSongs(found.songs);
        } else if (!hasPrefilledHeader) {
          setNotFound(true);
        } else {
          setLoadError("Playlist tracks could not load right now.");
        }
      } catch {
        if (cancelled) return;
        if (hasPrefilledHeader) setLoadError("Songs could not load right now.");
        else setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [
    playlistId, isFirestoreSource, isJioSaavnSource,
    applyFirestorePlaylistData, applyJioPlaylistData,
    hasPrefilledHeader, initialCover, initialDescription,
    initialSongCount, initialTitle,
  ]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const shouldShow = y > 260;
    if (stickyVisible.current === shouldShow) return;
    stickyVisible.current = shouldShow;
    Animated.timing(stickyOpacity, {
      toValue: shouldShow ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [stickyOpacity]);

  const handlePlayAll = useCallback(() => {
    if (!songs.length) return;
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlayingFromThisPlaylist) { togglePlay(); return; }
    playSong(songs[0], songs);
  }, [songs, isPlayingFromThisPlaylist, togglePlay, playSong]);

  const handleShufflePlay = useCallback(() => {
    if (!songs.length) return;
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled);
  }, [songs, playSong]);

  // ── Error / not-found screens ──────────────────────────────────────────────
  if (loading && !hasPrefilledHeader) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={safeGoBack} style={styles.backBtnSolo}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={safeGoBack} style={styles.backBtnSolo}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Playlist not found</Text>
        </View>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPad }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — same pattern as artist page ── */}
        <View style={[styles.hero, { paddingTop: topInset + 8 }]}>
          {playlistCover ? (
            <Image
              source={{ uri: playlistCover }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={120}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.heroFallback]}>
              <Ionicons name="musical-notes" size={72} color="rgba(255,255,255,0.15)" />
            </View>
          )}
          {/* Dark gradient — title readable on any cover */}
          <LinearGradient
            colors={["transparent", "rgba(16,20,26,0.55)", Colors.background]}
            locations={[0.25, 0.65, 1]}
            style={StyleSheet.absoluteFill}
          />
          {/* Back button */}
          <Pressable onPress={safeGoBack} style={[styles.heroBack, { top: topInset + 8 }]}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          {/* Info overlay */}
          <View style={styles.heroInfo}>
            <Text
              numberOfLines={3}
              style={[styles.heroTitle, { fontSize: playlistTitleSize }]}
            >
              {playlistName}
            </Text>
            {playlistDescription && !/^\d+\s+songs?$/i.test(playlistDescription) ? (
              <Text numberOfLines={1} style={styles.heroSub}>{playlistDescription}</Text>
            ) : null}
            <Text style={styles.heroMeta}>
              {effectiveSongCount > 0 ? `${effectiveSongCount} songs` : ""}
              {totalMinutes > 0 ? `  ·  ${totalMinutes} min` : ""}
            </Text>
            {/* Action buttons */}
            <View style={styles.heroActions}>
              <Pressable style={styles.shuffleBtn} onPress={handleShufflePlay} disabled={!songs.length}>
                <Ionicons name="shuffle" size={17} color={Colors.text} />
                <Text style={styles.shuffleBtnText}>Shuffle</Text>
              </Pressable>
              <Pressable style={styles.playBtn} onPress={handlePlayAll} disabled={!songs.length}>
                <Ionicons
                  name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
                  size={18}
                  color="#000"
                />
                <Text style={styles.playBtnText}>
                  {isPlayingFromThisPlaylist && isPlaying ? "Pause" : "Play All"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Tracks header ── */}
        <View style={styles.tracksHeader}>
          <Text style={styles.tracksTitle}>Tracks</Text>
          {totalDurationLabel ? (
            <Text style={styles.tracksMeta}>{effectiveSongCount} · {totalDurationLabel}</Text>
          ) : null}
        </View>

        {/* ── Song list ── */}
        {loadError ? (
          <View style={styles.inlineWrap}>
            <Ionicons name="cloud-offline-outline" size={28} color={Colors.subtext} />
            <Text style={styles.inlineText}>{loadError}</Text>
          </View>
        ) : songs.length > 0 ? (
          songs.map((song, index) => (
            <SongRow key={`${song.id}-${index}`} song={song} index={index} queue={songs} />
          ))
        ) : loading ? (
          <SongRowSkeleton count={Math.max(4, Math.min(initialSongCount || 8, 10))} />
        ) : (
          <View style={styles.inlineWrap}>
            <Text style={styles.inlineText}>No songs available in this playlist.</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Sticky header — always mounted, fades in/out ── */}
      <Animated.View
        pointerEvents={stickyVisible.current ? "auto" : "none"}
        style={[styles.sticky, { paddingTop: topInset, opacity: stickyOpacity }]}
      >
        <Pressable onPress={safeGoBack} style={styles.stickyBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.stickyTitle} numberOfLines={1}>{playlistName}</Text>
        <Pressable style={styles.stickyPlay} onPress={handlePlayAll} disabled={!songs.length}>
          <Ionicons
            name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
            size={14}
            color="#000"
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backBtnSolo: { width: 36, height: 36, marginLeft: 12, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.subtext, fontSize: 16, fontFamily: "Inter_500Medium" },

  // Hero
  hero: {
    height: 340,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroFallback: {
    backgroundColor: "#111820",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBack: {
    position: "absolute",
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 5,
  },
  heroTitle: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    lineHeight: undefined,
  },
  heroSub: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  heroMeta: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  shuffleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(10,16,24,0.7)",
  },
  shuffleBtnText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  playBtnText: {
    color: "#000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },

  // Tracks header
  tracksHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  tracksTitle: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  tracksMeta: {
    color: Colors.subtext,
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
  },

  // Inline states
  inlineWrap: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    alignItems: "center",
    gap: 10,
  },
  inlineText: {
    color: Colors.subtext,
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },

  // Sticky header
  sticky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(16,20,26,0.97)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  stickyBack: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  stickyTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  stickyPlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
