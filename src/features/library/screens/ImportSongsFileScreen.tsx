import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { ImpactFeedbackStyle } from "expo-haptics";
import { File } from "expo-file-system";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { parseFile } from "@/lib/file-parser";
import { searchSong, getMatchConfidence } from "@/lib/song-matcher";
import { ParsedSong } from "@/types/import";
import { useAuth } from "@/contexts/AuthContext";
import { Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import { createUserPlaylist, addSongToPlaylist, getUserPlaylists, UserPlaylist } from "@/lib/storage";
import {
  createFirestorePlaylist,
  addLikedSongToFirestore,
  getUserFirestorePlaylists,
  FirestorePlaylist,
  addSongToFirestorePlaylist,
} from "@/lib/firestore";
import { logger } from "@/lib/logger";

type ImportStep = "loading" | "searching" | "review" | "importing" | "complete" | "error";
type ImportDestinationPlaylist = UserPlaylist | FirestorePlaylist;

function getParsedSongKey(song: ParsedSong): string {
  return song.spotifyUri || song.isrc || `${song.title}-${song.artist}`;
}

async function readSelectedFileContent(uri: string): Promise<string> {
  try {
    const file = new File(uri);
    if (file.exists) {
      return await file.text();
    }
  } catch {
    // Fall back to readAsStringAsync if File class instance fails
  }

  const FileSystem = await import("expo-file-system/legacy");
  return await FileSystem.readAsStringAsync(uri, {
    encoding: "utf8",
  });
}

function ImportedSongRow({
  song,
  index,
  onRemove,
}: {
  song: ParsedSong;
  index: number;
  onRemove: (index: number) => void;
}) {
  const handleRemove = useCallback(() => onRemove(index), [index, onRemove]);

  return (
    <View style={styles.songItem}>
      {song.imageUrl ? (
        <Image
          source={{ uri: song.imageUrl }}
          style={styles.songArtwork}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={styles.songArtworkPlaceholder}>
          <Ionicons name="musical-note" size={20} color={Colors.subtext} />
        </View>
      )}

      <View style={styles.songInfo}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {song.title}
        </Text>
        <View style={styles.songMetaRow}>
          <Text style={styles.songArtist} numberOfLines={1}>
            {song.artist}
          </Text>
          {song.matchConfidence ? (
            <View
              style={[
                styles.matchBadge,
                song.matchConfidence === "high" && styles.matchBadgeHigh,
                song.matchConfidence === "medium" && styles.matchBadgeMedium,
                song.matchConfidence === "low" && styles.matchBadgeLow,
              ]}
            >
              <Text style={styles.matchBadgeText}>
                {song.matchConfidence === "high"
                  ? "High"
                  : song.matchConfidence === "medium"
                  ? "Good"
                  : "Low"}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <Pressable
        onPress={handleRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${song.title}`}
        style={styles.removeButton}
      >
        <Ionicons name="close-circle" size={22} color={Colors.inactive} />
      </Pressable>
    </View>
  );
}

function ImportPlaylistChoiceRow({
  playlist,
  selectedPlaylistId,
  onSelect,
}: {
  playlist: ImportDestinationPlaylist;
  selectedPlaylistId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = selectedPlaylistId === playlist.id;
  const handlePress = useCallback(() => onSelect(playlist.id), [onSelect, playlist.id]);
  const songCount = ("songs" in playlist ? playlist.songs?.length : 0) || 0;

  return (
    <Pressable
      style={[styles.playlistItem, selected && styles.playlistItemSelected]}
      onPress={handlePress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={20}
        color={selected ? Colors.primary : Colors.subtext}
      />
      <Text style={styles.playlistItemText} numberOfLines={1}>
        {playlist.name}
      </Text>
      <Text style={styles.playlistItemCount}>{songCount} songs</Text>
    </Pressable>
  );
}

// react-doctor-disable-next-line react-doctor/no-giant-component, react-doctor/prefer-useReducer
export function ImportSongsFileScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { fileUri, fileName } = useLocalSearchParams<{ fileUri: string; fileName: string }>();
  const { user } = useAuth();

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [step, setStep] = useState<ImportStep>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsedSongs, setParsedSongs] = useState<ParsedSong[]>([]);

  // Search progress state
  const [processedCount, setProcessedCount] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [searchProgress, setSearchProgress] = useState(0);

  // Import progress state
  const [importProgress, setImportProgress] = useState(0);
  const [addedCount, setAddedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [duplicates, setDuplicates] = useState(0);

  // Destination modal state
  const [importDestination, setImportDestination] = useState<"liked" | "new-playlist" | "existing-playlist">("liked");
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [userPlaylists, setUserPlaylists] = useState<ImportDestinationPlaylist[]>([]);

  const createdPlaylistIdRef = useRef<string | null>(null);
  const isFirestorePlaylistRef = useRef(false);

  const readySongCount = useMemo(
    () => parsedSongs.reduce((count, song) => count + (song.audioUrl ? 1 : 0), 0),
    [parsedSongs]
  );

  const loadUserPlaylists = useCallback(async () => {
    try {
      if (user?.id) {
        const firestorePlaylists = await getUserFirestorePlaylists(user.id);
        if (isMountedRef.current) setUserPlaylists(firestorePlaylists);
      } else {
        const localPlaylists = await getUserPlaylists();
        if (isMountedRef.current) setUserPlaylists(localPlaylists);
      }
    } catch {
      // Non-fatal, user can still create a new playlist
    }
  }, [user?.id]);

  // Search all parsed songs with controlled batch concurrency (10 parallel per batch)
  const searchAllSongs = useCallback(async (songs: ParsedSong[]) => {
    if (songs.length === 0) return;
    if (!isMountedRef.current) return;

    setStep("searching");
    setProcessedCount(0);
    setFoundCount(0);
    setSearchProgress(0);

    const updatedSongs = [...songs];
    const BATCH_SIZE = 10;
    let found = 0;
    let processed = 0;

    for (let batchStart = 0; batchStart < updatedSongs.length; batchStart += BATCH_SIZE) {
      if (!isMountedRef.current) return;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, updatedSongs.length);
      const batchPromises: Promise<void>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const song = updatedSongs[i];
        batchPromises.push(
          (async () => {
            try {
              if (!isMountedRef.current) return;
              const matchResult = await searchSong(song.title, song.artist, song.album, song);
              if (!isMountedRef.current) return;

              if (matchResult && matchResult.song) {
                const matchedSong = matchResult.song;
                let audioUrl = "";
                const downloadUrls = matchedSong.downloadUrl;
                if (downloadUrls) {
                  if (Array.isArray(downloadUrls)) {
                    const urls = downloadUrls;
                    const downloadUrl =
                      urls[urls.length - 1] || urls[4] || urls[3] || urls[2] || urls[1] || urls[0];
                    audioUrl = downloadUrl?.url || downloadUrl?.link || downloadUrl || "";
                  } else if (typeof downloadUrls === "string") {
                    audioUrl = downloadUrls;
                  }
                }

                let imageUrl = "";
                const matchedImages = matchedSong.image;
                if (matchedImages) {
                  if (Array.isArray(matchedImages)) {
                    const images = matchedImages;
                    const image = images[images.length - 1] || images[2] || images[1] || images[0];
                    imageUrl = image?.url || image?.link || image || "";
                  } else if (typeof matchedImages === "string") {
                    imageUrl = matchedImages;
                  }
                }

                if (!imageUrl && matchResult.song.imageUrl) imageUrl = matchResult.song.imageUrl;
                if (!audioUrl && matchResult.song.audioUrl) audioUrl = matchResult.song.audioUrl;

                const confidence = getMatchConfidence(matchResult.confidence);

                updatedSongs[i] = {
                  ...song,
                  status: "ready",
                  message:
                    confidence === "high"
                      ? "High match"
                      : confidence === "medium"
                      ? "Good match"
                      : "Low match",
                  matchConfidence: confidence,
                  imageUrl,
                  audioUrl,
                  duration: matchResult.song.duration || song.duration,
                  album: matchResult.song.album?.name || matchResult.song.album || song.album,
                };

                if (audioUrl) found++;
              } else {
                updatedSongs[i] = {
                  ...song,
                  status: "ready",
                  message: "Not found",
                  matchConfidence: "low",
                };
              }
            } catch {
              updatedSongs[i] = {
                ...song,
                status: "ready",
                message: "Search failed",
              };
            } finally {
              processed++;
              if (isMountedRef.current) {
                setProcessedCount(processed);
                setFoundCount(found);
                setSearchProgress(Math.floor((processed / updatedSongs.length) * 100));
              }
            }
          })()
        );
      }

      await Promise.all(batchPromises);

      // Brief yield between batches to keep UI fluid
      if (batchEnd < updatedSongs.length) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    if (!isMountedRef.current) return;
    setParsedSongs(updatedSongs);
    setStep("review");
  }, []);

  // Read and parse file on mount
  const loadFile = useCallback(async () => {
    if (!fileUri) {
      setErrorMessage("No file selected");
      setStep("error");
      return;
    }

    try {
      const content = await readSelectedFileContent(fileUri);
      if (!isMountedRef.current) return;

      if (!content || content.trim().length === 0) {
        setErrorMessage("File is empty or could not be read");
        setStep("error");
        return;
      }

      const result = parseFile(content, fileName || "file.txt");
      if (!isMountedRef.current) return;

      if (result.errors.length > 0 && result.songs.length === 0) {
        setErrorMessage(
          `Could not parse any songs.\n${result.errors.slice(0, 4).join("\n")}`
        );
        setStep("error");
        return;
      }

      setParsedSongs(result.songs);
      await searchAllSongs(result.songs);
    } catch (error: any) {
      if (isMountedRef.current) {
        setErrorMessage(`Failed to read file: ${error?.message || "Unknown error"}`);
        setStep("error");
      }
    }
  }, [fileName, fileUri, searchAllSongs]);

  useEffect(() => {
    void loadFile();
  }, [loadFile]);

  const openDestinationModal = useCallback(() => {
    setShowDestinationModal(true);
    void loadUserPlaylists();
  }, [loadUserPlaylists]);

  const closeDestinationModal = useCallback(() => {
    setShowDestinationModal(false);
  }, []);

  const handleConfirmImport = async () => {
    if (parsedSongs.length === 0) return;

    setShowDestinationModal(false);
    void triggerImpact(ImpactFeedbackStyle.Medium);

    setStep("importing");
    setImportProgress(0);
    setAddedCount(0);
    setSkippedCount(0);
    setDuplicates(0);

    try {
      let playlistId: string | null = null;
      let isNewPlaylistFirestore = false;

      if (importDestination === "new-playlist") {
        if (user && user.id) {
          const result = await createFirestorePlaylist(
            user.id,
            user.name || "User",
            newPlaylistName.trim() || "Imported Playlist",
            ""
          );
          playlistId = result?.id || null;
          createdPlaylistIdRef.current = playlistId;
          isFirestorePlaylistRef.current = true;
          isNewPlaylistFirestore = true;
        } else {
          const result = await createUserPlaylist(newPlaylistName.trim() || "Imported Playlist");
          playlistId = result.id;
          createdPlaylistIdRef.current = playlistId;
          isFirestorePlaylistRef.current = false;
          isNewPlaylistFirestore = false;
        }
      } else if (importDestination === "existing-playlist") {
        playlistId = selectedPlaylistId;
        createdPlaylistIdRef.current = playlistId;
        const selectedPlaylist = userPlaylists.find((p) => p.id === playlistId);
        const isFirestore = selectedPlaylist ? "createdBy" in selectedPlaylist : false;
        isFirestorePlaylistRef.current = isFirestore;
        isNewPlaylistFirestore = isFirestore;
      }

      let added = 0;
      let skipped = 0;
      let dupes = 0;

      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- sequential writes protect against database rate limits and race conditions
      for (let i = 0; i < parsedSongs.length; i++) {
        if (!isMountedRef.current) return;
        const song = parsedSongs[i];

        if (!song.audioUrl) {
          skipped++;
          setSkippedCount(skipped);
          setImportProgress(Math.floor(((i + 1) / parsedSongs.length) * 100));
          continue;
        }

        try {
          const songId = `${song.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${song.artist
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")}`.substring(0, 100);

          const appSong: Song = {
            id: songId,
            title: song.title,
            artist: song.artist,
            album: song.album || "",
            coverUrl: song.imageUrl || "",
            audioUrl: song.audioUrl,
            duration: parseInt(song.duration || "0", 10),
            genre: "",
          };

          let addSuccess = false;

          if (importDestination === "liked") {
            if (!user?.id) {
              throw new Error("Sign in to import liked songs");
            }
            // react-doctor-disable-next-line react-doctor/async-await-in-loop -- sequential writes protect against database rate limits
            addSuccess = await addLikedSongToFirestore(user.id, appSong);
          } else if (playlistId) {
            if (isNewPlaylistFirestore && user?.id) {
              // react-doctor-disable-next-line react-doctor/async-await-in-loop -- sequential writes protect against database rate limits
              addSuccess = await addSongToFirestorePlaylist(playlistId, appSong);
            } else {
              // react-doctor-disable-next-line react-doctor/async-await-in-loop -- sequential writes protect against database rate limits
              addSuccess = await addSongToPlaylist(playlistId, appSong);
            }
          }

          if (!addSuccess) {
            dupes++;
            setDuplicates(dupes);
          } else {
            added++;
            setAddedCount(added);
          }
        } catch (error) {
          logger.error("Failed to add imported song", { title: song.title, error });
          skipped++;
          setSkippedCount(skipped);
        }

        setImportProgress(Math.floor(((i + 1) / parsedSongs.length) * 100));
      }

      if (isNewPlaylistFirestore) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      if (isMountedRef.current) {
        setStep("complete");
      }
    } catch (error: any) {
      if (isMountedRef.current) {
        setErrorMessage(error?.message || "Import failed");
        setStep("error");
      }
    }
  };

  const removeSong = useCallback((index: number) => {
    setParsedSongs((current) => current.filter((_, i) => i !== index));
  }, []);

  const renderParsedSong = useCallback(
    ({ item, index }: { item: ParsedSong; index: number }) => (
      <ImportedSongRow song={item} index={index} onRemove={removeSong} />
    ),
    [removeSong]
  );

  const renderImportPlaylistChoice = useCallback(
    ({ item }: { item: ImportDestinationPlaylist }) => (
      <ImportPlaylistChoiceRow
        playlist={item}
        selectedPlaylistId={selectedPlaylistId}
        onSelect={setSelectedPlaylistId}
      />
    ),
    [selectedPlaylistId]
  );

  // 1. Error state
  if (step === "error") {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <LinearGradient colors={[Colors.background, "#1a1a1a"]} style={StyleSheet.absoluteFill} />
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#FF6B6B" />
          <Text style={styles.errorTitle}>Import Failed</Text>
          <Text style={styles.errorSubtitle}>{errorMessage || "An unexpected error occurred."}</Text>
          <Pressable style={styles.errorBackButton} onPress={safeGoBack}>
            <Text style={styles.errorBackButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // 2. Loading / parsing state
  if (step === "loading") {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <LinearGradient colors={[Colors.background, "#1a1a1a"]} style={StyleSheet.absoluteFill} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Reading and parsing playlist…</Text>
        </View>
      </View>
    );
  }

  // 3. Searching state
  if (step === "searching") {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <LinearGradient colors={[Colors.background, "#1a1a1a"]} style={StyleSheet.absoluteFill} />
        <View style={styles.centerContainer}>
          <View style={styles.progressIconCircle}>
            <Ionicons name="search" size={42} color={Colors.primary} />
          </View>
          <Text style={styles.stepTitle}>Finding Your Music</Text>
          <Text style={styles.stepSubtitle}>
            {processedCount} of {parsedSongs.length} processed • {foundCount} matches found
          </Text>

          <View style={styles.progressBarWrapper}>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${searchProgress}%` }]} />
            </View>
            <Text style={styles.progressPercentText}>{searchProgress}%</Text>
          </View>
        </View>
      </View>
    );
  }

  // 4. Importing state
  if (step === "importing") {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <LinearGradient colors={[Colors.background, "#1a1a1a"]} style={StyleSheet.absoluteFill} />
        <View style={styles.centerContainer}>
          <View style={styles.progressIconCircle}>
            <Ionicons name="download" size={42} color={Colors.primary} />
          </View>
          <Text style={styles.stepTitle}>Importing Songs</Text>
          <Text style={styles.stepSubtitle}>
            {addedCount} of {parsedSongs.length} added
          </Text>

          <View style={styles.progressBarWrapper}>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${importProgress}%` }]} />
            </View>
            <Text style={styles.progressPercentText}>{importProgress}%</Text>
          </View>

          {skippedCount > 0 && (
            <Text style={styles.skippedNoticeText}>{skippedCount} skipped (no stream match)</Text>
          )}
        </View>
      </View>
    );
  }

  // 5. Complete state
  if (step === "complete") {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <LinearGradient colors={[Colors.background, "#1a1a1a"]} style={StyleSheet.absoluteFill} />
        <View style={styles.centerContainer}>
          <Ionicons name="checkmark-circle" size={80} color={Colors.primary} />
          <Text style={styles.completeTitle}>Import Complete!</Text>
          <Text style={styles.completeSubtitle}>
            Successfully added {addedCount} {addedCount === 1 ? "song" : "songs"}
          </Text>

          {duplicates > 0 && (
            <Text style={styles.completeDetailText}>
              {duplicates} {duplicates === 1 ? "song was" : "songs were"} already in collection
            </Text>
          )}
          {skippedCount > 0 && (
            <Text style={styles.completeDetailText}>
              {skippedCount} {skippedCount === 1 ? "song" : "songs"} could not be matched
            </Text>
          )}

          <Pressable
            style={styles.primaryActionButton}
            onPress={() => {
              const createdPlaylistId = createdPlaylistIdRef.current;
              if (
                (importDestination === "new-playlist" || importDestination === "existing-playlist") &&
                createdPlaylistId
              ) {
                const selectedPlaylist = userPlaylists.find((p) => p.id === selectedPlaylistId);
                const playlistTitle =
                  importDestination === "new-playlist"
                    ? newPlaylistName.trim() || "Imported Playlist"
                    : selectedPlaylist?.name || "Imported Playlist";

                router.replace({
                  pathname: "/playlist/[id]",
                  params: {
                    id: createdPlaylistId,
                    firestore: isFirestorePlaylistRef.current ? "true" : undefined,
                    title: playlistTitle,
                    songCount: String(addedCount),
                  },
                });
              } else {
                router.replace("/(tabs)/liked-songs");
              }
            }}
          >
            <LinearGradient
              colors={[Colors.primary, "#18B983"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryActionGradient}
            >
              <Text style={styles.primaryActionText}>
                {importDestination === "new-playlist" || importDestination === "existing-playlist"
                  ? "View Playlist"
                  : "View Liked Songs"}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  // 6. Review state (main interactive list)
  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <LinearGradient colors={[Colors.background, "#1a1a1a"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={safeGoBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Review Import</Text>
        <View style={{ width: 28 }} />
      </View>

      <FlatList
        data={parsedSongs}
        keyExtractor={getParsedSongKey}
        renderItem={renderParsedSong}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.fileInfoCard}>
              <View style={styles.fileIconContainer}>
                <Ionicons name="document-text" size={24} color={Colors.primary} />
              </View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {fileName}
                </Text>
                <Text style={styles.songCount}>
                  {readySongCount} of {parsedSongs.length} songs ready to import
                </Text>
              </View>
            </View>

            <View style={styles.songListHeader}>
              <Text style={styles.songListTitle}>Songs to Import</Text>
            </View>
          </>
        }
      />

      {/* Bottom Action Bar */}
      <View style={[styles.bottomContainer, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <Pressable
          style={[styles.importButton, readySongCount === 0 && styles.importButtonDisabled]}
          onPress={openDestinationModal}
          disabled={readySongCount === 0}
          accessibilityRole="button"
          accessibilityLabel={`Import ${readySongCount} songs`}
        >
          <LinearGradient
            colors={readySongCount === 0 ? ["#444", "#555"] : [Colors.primary, "#18B983"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.importButtonGradient}
          >
            <Text style={styles.importButtonText}>
              Import {readySongCount} {readySongCount === 1 ? "Song" : "Songs"}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#06241A" />
          </LinearGradient>
        </Pressable>
      </View>

      {/* Native Slide Modal for Destination Selection */}
      <Modal
        visible={showDestinationModal}
        transparent
        animationType="slide"
        onRequestClose={closeDestinationModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeDestinationModal}
            accessibilityRole="button"
            accessibilityLabel="Close destination picker"
          />

          <View style={[styles.modalCard, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
            <View style={styles.modalDragHandle}>
              <View style={styles.modalDragIndicator} />
            </View>

            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalTitle}>Where to import?</Text>
              <Text style={styles.modalSubtitle}>
                Choose where to add your {readySongCount} ready songs
              </Text>

              {/* Option 1: Liked Songs */}
              <Pressable
                style={[
                  styles.destinationOption,
                  importDestination === "liked" && styles.destinationOptionSelected,
                ]}
                onPress={() => setImportDestination("liked")}
                accessibilityRole="radio"
                accessibilityState={{ selected: importDestination === "liked" }}
              >
                <Ionicons
                  name={importDestination === "liked" ? "radio-button-on" : "radio-button-off"}
                  size={24}
                  color={importDestination === "liked" ? Colors.primary : Colors.subtext}
                />
                <View style={styles.destinationOptionText}>
                  <Text style={styles.destinationOptionTitle}>Add to Liked Songs</Text>
                  <Text style={styles.destinationOptionSubtitle}>
                    Add songs to your liked collection
                  </Text>
                </View>
              </Pressable>

              {/* Option 2: Create New Playlist */}
              <Pressable
                style={[
                  styles.destinationOption,
                  importDestination === "new-playlist" && styles.destinationOptionSelected,
                ]}
                onPress={() => setImportDestination("new-playlist")}
                accessibilityRole="radio"
                accessibilityState={{ selected: importDestination === "new-playlist" }}
              >
                <Ionicons
                  name={importDestination === "new-playlist" ? "radio-button-on" : "radio-button-off"}
                  size={24}
                  color={importDestination === "new-playlist" ? Colors.primary : Colors.subtext}
                />
                <View style={styles.destinationOptionText}>
                  <Text style={styles.destinationOptionTitle}>Create New Playlist</Text>
                  <Text style={styles.destinationOptionSubtitle}>
                    Create a fresh playlist with these songs
                  </Text>
                </View>
              </Pressable>

              {importDestination === "new-playlist" && (
                <TextInput
                  style={styles.playlistNameInput}
                  placeholder="Playlist name"
                  placeholderTextColor={Colors.subtext}
                  value={newPlaylistName}
                  onChangeText={setNewPlaylistName}
                  autoFocus
                  selectionColor={Colors.primary}
                />
              )}

              {/* Option 3: Add to Existing Playlist */}
              <Pressable
                style={[
                  styles.destinationOption,
                  importDestination === "existing-playlist" && styles.destinationOptionSelected,
                ]}
                onPress={() => setImportDestination("existing-playlist")}
                accessibilityRole="radio"
                accessibilityState={{ selected: importDestination === "existing-playlist" }}
              >
                <Ionicons
                  name={
                    importDestination === "existing-playlist"
                      ? "radio-button-on"
                      : "radio-button-off"
                  }
                  size={24}
                  color={
                    importDestination === "existing-playlist" ? Colors.primary : Colors.subtext
                  }
                />
                <View style={styles.destinationOptionText}>
                  <Text style={styles.destinationOptionTitle}>Add to Existing Playlist</Text>
                  <Text style={styles.destinationOptionSubtitle}>
                    Select a playlist from your library
                  </Text>
                </View>
              </Pressable>

              {importDestination === "existing-playlist" && (
                <FlatList
                  data={userPlaylists}
                  keyExtractor={(playlist) => playlist.id}
                  renderItem={renderImportPlaylistChoice}
                  style={styles.playlistList}
                  scrollEnabled={false}
                  ListEmptyComponent={
                    <Text style={styles.noPlaylistsText}>
                      No playlists found. Create one first!
                    </Text>
                  }
                />
              )}

              <View style={styles.modalButtons}>
                <Pressable
                  style={styles.modalButtonCancel}
                  onPress={closeDestinationModal}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.modalButtonConfirm,
                    (importDestination === "new-playlist" && !newPlaylistName.trim()) ||
                    (importDestination === "existing-playlist" && !selectedPlaylistId)
                      ? styles.modalButtonConfirmDisabled
                      : null,
                  ]}
                  onPress={handleConfirmImport}
                  disabled={
                    (importDestination === "new-playlist" && !newPlaylistName.trim()) ||
                    (importDestination === "existing-playlist" && !selectedPlaylistId)
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Start import"
                >
                  <LinearGradient
                    colors={
                      (importDestination === "new-playlist" && !newPlaylistName.trim()) ||
                      (importDestination === "existing-playlist" && !selectedPlaylistId)
                        ? ["#444", "#555"]
                        : [Colors.primary, "#18B983"]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalButtonConfirmGradient}
                  >
                    <Text style={styles.modalButtonConfirmText}>Start Import</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default ImportSongsFileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 110,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.subtext,
    textAlign: "center",
  },
  errorTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  errorSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    textAlign: "center",
    lineHeight: 20,
  },
  errorBackButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: Colors.surface,
  },
  errorBackButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  progressIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(38, 225, 154, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    textAlign: "center",
  },
  progressBarWrapper: {
    width: "100%",
    maxWidth: 280,
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  progressBarTrack: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  progressPercentText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  skippedNoticeText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.inactive,
    marginTop: 6,
  },
  completeTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginTop: 12,
  },
  completeSubtitle: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.subtext,
    textAlign: "center",
  },
  completeDetailText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.inactive,
    textAlign: "center",
  },
  primaryActionButton: {
    marginTop: 20,
    borderRadius: 24,
    overflow: "hidden",
    width: "100%",
    maxWidth: 240,
  },
  primaryActionGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#06241A",
  },
  fileInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  fileIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(38, 225, 154, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 2,
  },
  songCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
  },
  songListHeader: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  songListTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.subtext,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  songItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    gap: 12,
  },
  songArtwork: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  songArtworkPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  songInfo: {
    flex: 1,
    minWidth: 0,
  },
  songTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 3,
  },
  songMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  songArtist: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    flexShrink: 1,
  },
  matchBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  matchBadgeHigh: {
    backgroundColor: "rgba(38, 225, 154, 0.18)",
  },
  matchBadgeMedium: {
    backgroundColor: "rgba(255, 193, 7, 0.18)",
  },
  matchBadgeLow: {
    backgroundColor: "rgba(244, 67, 54, 0.18)",
  },
  matchBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  removeButton: {
    padding: 4,
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  importButton: {
    borderRadius: 24,
    overflow: "hidden",
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 8,
  },
  importButtonText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#06241A",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#181C24",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  modalDragHandle: {
    alignItems: "center",
    paddingVertical: 10,
  },
  modalDragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
  modalScrollView: {
    paddingHorizontal: 16,
  },
  modalContent: {
    paddingBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    marginBottom: 16,
  },
  destinationOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  destinationOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(38, 225, 154, 0.08)",
  },
  destinationOptionText: {
    flex: 1,
  },
  destinationOptionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 2,
  },
  destinationOptionSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
  },
  playlistNameInput: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  playlistList: {
    maxHeight: 180,
    marginBottom: 10,
  },
  playlistItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 6,
    gap: 10,
  },
  playlistItemSelected: {
    backgroundColor: "rgba(38, 225, 154, 0.12)",
  },
  playlistItemText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  playlistItemCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
  },
  noPlaylistsText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    paddingVertical: 12,
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.subtext,
  },
  modalButtonConfirm: {
    flex: 1.5,
    borderRadius: 24,
    overflow: "hidden",
  },
  modalButtonConfirmDisabled: {
    opacity: 0.5,
  },
  modalButtonConfirmGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#06241A",
  },
});
