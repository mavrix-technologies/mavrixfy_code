import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { parseFile } from "@/lib/file-parser";
import {
addLikedSongToFirestore,
addSongToFirestorePlaylist,
createFirestorePlaylist,
getUserFirestorePlaylists,
getLikedSongsFromFirestore,
getPlaylistById,
} from "@/lib/firestore";
import { triggerImpact } from "@/lib/haptics";
import { youtubeIdentity } from "@/services/liked-songs/likedSongFormat";
import { dedupeImportRows,matchImportedSongs } from "@/lib/song-matcher";
import { addSongToPlaylist,createUserPlaylist,getUserPlaylists } from "@/lib/storage";
import { ParsedSong } from "@/types/import";
import { safeGoBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { ImpactFeedbackStyle } from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router,useLocalSearchParams } from "expo-router";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import {
ActivityIndicator,
FlatList,
Platform,
Pressable,
StyleSheet,
Text,
View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles } from "../styles/importSongsStyles";

import {
ImportDestinationModal,
type ImportDestinationPlaylist,
ImportedSongRow
} from "../components/ImportSongsSubComponents";

function getParsedSongKey(song: ParsedSong): string {
  return JSON.stringify([song.title, song.artist, song.duration || 0]);
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
  const importingRef = useRef(false);

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
  const [importDestination, setImportDestination] = useState<"liked" | "new-playlist" | "existing-playlist">(() => user?.id ? "liked" : "new-playlist");
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState(() => (fileName || "Imported Playlist").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [userPlaylists, setUserPlaylists] = useState<ImportDestinationPlaylist[]>([]);

  const createdPlaylistIdRef = useRef<string | null>(null);
  const isFirestorePlaylistRef = useRef(false);

  const readySongCount = useMemo(
    () => parsedSongs.reduce((count, song) => count + (song.matchedSong ? 1 : 0), 0),
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
  }, [user]);

  useEffect(() => {
    const controller = new AbortController();
    isMountedRef.current = true;
    async function loadAndMatch() {
      if (!fileUri) throw new Error("No file selected");
      const content = await readSelectedFileContent(fileUri);
      if (controller.signal.aborted) return;
      const result = parseFile(content, fileName || "file.txt");
      if (!result.songs.length) throw new Error(result.errors.slice(0, 4).join("\n") || "No songs found in this file.");
      const songs = dedupeImportRows(result.songs);
      setParsedSongs(songs);
      setProcessedCount(0);
      setFoundCount(0);
      setSearchProgress(0);
      setStep("searching");
      const matched = await matchImportedSongs(songs, controller.signal, (processed, found) => {
        if (controller.signal.aborted) return;
        setProcessedCount(processed);
        setFoundCount(found);
        setSearchProgress(Math.floor(processed / songs.length * 100));
      });
      if (controller.signal.aborted) return;
      setParsedSongs(matched);
      setStep("review");
    }
    void loadAndMatch().catch(error => {
      if (controller.signal.aborted) return;
      setErrorMessage(error instanceof Error ? error.message : "Could not read this file.");
      setStep("error");
    });
    return () => { isMountedRef.current = false; controller.abort(); };
  }, [fileName, fileUri]);

  const openDestinationModal = useCallback(() => {
    setShowDestinationModal(true);
    void loadUserPlaylists();
  }, [loadUserPlaylists]);

  const closeDestinationModal = useCallback(() => {
    setShowDestinationModal(false);
  }, []);

  const handleConfirmImport = async () => {
    if (!readySongCount || importingRef.current) return;
    if (importDestination === "liked" && !user?.id) {
      setErrorMessage("Sign in to import liked songs, or choose a playlist.");
      setStep("error");
      return;
    }
    importingRef.current = true;

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

      if (importDestination !== "liked" && !playlistId) throw new Error("Choose a valid destination playlist.");
      if (!isMountedRef.current) return;
      const existingSongs = importDestination === "liked"
        ? await getLikedSongsFromFirestore(user!.id)
        : isNewPlaylistFirestore
          ? (await getPlaylistById(playlistId!))?.songs || []
          : (await getUserPlaylists()).find(playlist => playlist.id === playlistId)?.songs || [];
      if (!isMountedRef.current) return;
      const existingIds = new Set(existingSongs.map(song => {
        const id = youtubeIdentity(song);
        return id ? "youtube_" + id : song.id;
      }));

      let added = 0;
      let skipped = 0;
      let dupes = 0;

      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- sequential writes protect against database rate limits and race conditions
      for (let i = 0; i < parsedSongs.length; i++) {
        if (!isMountedRef.current) return;
        const song = parsedSongs[i];

        if (!song.matchedSong) {
          skipped++;
          setSkippedCount(skipped);
          setImportProgress(Math.floor(((i + 1) / parsedSongs.length) * 100));
          continue;
        }

        try {
          const appSong = song.matchedSong;
          if (existingIds.has(appSong.id)) {
            dupes++;
            setDuplicates(dupes);
            setImportProgress(Math.floor(((i + 1) / parsedSongs.length) * 100));
            continue;
          }

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

          if (!isMountedRef.current) return;
          if (!addSuccess) throw new Error("Song could not be saved.");
          existingIds.add(appSong.id);
          added++;
          setAddedCount(added);
        } catch {
          if (!isMountedRef.current) return;
          skipped++;
          setSkippedCount(skipped);
        }

        setImportProgress(Math.floor(((i + 1) / parsedSongs.length) * 100));
      }

      if (isMountedRef.current) {
        setStep("complete");
      }
    } catch (error: any) {
      if (isMountedRef.current) {
        setErrorMessage(error?.message || "Import failed");
        setStep("error");
      }
    } finally {
      importingRef.current = false;
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
        <LinearGradient colors={[Colors.background, Colors.background]} style={StyleSheet.absoluteFill} />
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
        <LinearGradient colors={[Colors.background, Colors.background]} style={StyleSheet.absoluteFill} />
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
        <LinearGradient colors={[Colors.background, Colors.background]} style={StyleSheet.absoluteFill} />
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
        <LinearGradient colors={[Colors.background, Colors.background]} style={StyleSheet.absoluteFill} />
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
            <Text style={styles.skippedNoticeText}>{skippedCount} not added</Text>
          )}
        </View>
      </View>
    );
  }

  // 5. Complete state
  if (step === "complete") {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <LinearGradient colors={[Colors.background, Colors.background]} style={StyleSheet.absoluteFill} />
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
              {skippedCount} {skippedCount === 1 ? "song" : "songs"} could not be matched or saved
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
      <LinearGradient colors={[Colors.background, Colors.background]} style={StyleSheet.absoluteFill} />

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

