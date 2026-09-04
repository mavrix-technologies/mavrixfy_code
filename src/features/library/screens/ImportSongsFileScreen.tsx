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
import { styles } from "../styles/importSongsStyles";
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
import { type Song } from "@/lib/musicData";
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

import {
  type ImportDestination,
  type ImportDestinationPlaylist,
  ImportedSongRow,
  ImportDestinationModal,
} from "../components/ImportSongsSubComponents";

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

type ImportStep = "loading" | "searching" | "review" | "importing" | "complete" | "error";

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
      <ImportDestinationModal
        visible={showDestinationModal}
        readySongCount={readySongCount}
        importDestination={importDestination}
        setImportDestination={setImportDestination}
        newPlaylistName={newPlaylistName}
        setNewPlaylistName={setNewPlaylistName}
        selectedPlaylistId={selectedPlaylistId}
        setSelectedPlaylistId={setSelectedPlaylistId}
        userPlaylists={userPlaylists}
        onClose={closeDestinationModal}
        onConfirm={handleConfirmImport}
      />
    </View>
  );
}

export default ImportSongsFileScreen;

