import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { parseFile } from "@/lib/file-parser";
import { searchSong, getMatchConfidence } from "@/lib/song-matcher";
import { ParsedSong } from "@/types/import";
import { useAuth } from "@/contexts/AuthContext";
import { Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import { createUserPlaylist, addSongToPlaylist, getUserPlaylists, UserPlaylist } from "@/lib/storage";
import { createFirestorePlaylist, addLikedSongToFirestore, getUserFirestorePlaylists, FirestorePlaylist, addSongToFirestorePlaylist } from "@/lib/firestore";

export default function FileImportScreen() {
  const insets = useSafeAreaInsets();
  const { fileUri, fileName } = useLocalSearchParams<{ fileUri: string; fileName: string }>();
  const { user } = useAuth();
  
  const [parsedSongs, setParsedSongs] = useState<ParsedSong[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<'parse' | 'searching' | 'review' | 'importing' | 'complete'>('parse');
  const [progress, setProgress] = useState(0);
  const [addedCount, setAddedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [duplicates, setDuplicates] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [importDestination, setImportDestination] = useState<'liked' | 'new-playlist' | 'existing-playlist'>('liked');
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [createdPlaylistId, setCreatedPlaylistId] = useState<string | null>(null);
  const [userPlaylists, setUserPlaylists] = useState<(UserPlaylist | FirestorePlaylist)[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isFirestorePlaylist, setIsFirestorePlaylist] = useState(false);
  
  // Bottom sheet animation
  const screenHeight = Dimensions.get('window').height;
  const modalTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const loadUserPlaylists = useCallback(async () => {
    try {
      if (user?.id) {
        const firestorePlaylists = await getUserFirestorePlaylists(user.id);
        setUserPlaylists(firestorePlaylists);
      } else {
        const localPlaylists = await getUserPlaylists();
        setUserPlaylists(localPlaylists);
      }
    } catch {
      // Silent fail, user can still create new playlist
    }
  }, [user?.id]);

  const loadFile = useCallback(async () => {
    if (!fileUri) {
      Alert.alert("Error", "No file selected");
      router.back();
      return;
    }

    try {
      setIsLoading(true);
      setCurrentStep('parse');
      
      // Get file info first
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      
      if (!fileInfo.exists) {
        Alert.alert("Error", "File not found at the specified location");
        router.back();
        return;
      }

      // Read file content with proper encoding
      const content = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (!content || content.trim().length === 0) {
        Alert.alert("Error", "File is empty or could not be read");
        router.back();
        return;
      }

      const result = parseFile(content, fileName || "file.txt");

      if (result.errors.length > 0 && result.songs.length === 0) {
        Alert.alert(
          "Parse Error", 
          `Could not parse any songs.\n\nErrors:\n${result.errors.slice(0, 5).join("\n")}\n\n${result.errors.length > 5 ? `...and ${result.errors.length - 5} more errors` : ""}`
        );
        router.back();
        return;
      }

      setParsedSongs(result.songs);
      setIsLoading(false);
      
      // Automatically start searching for songs
      await searchAllSongs(result.songs);
      
      if (result.errors.length > 0) {
        Alert.alert(
          "Partial Success",
          `Found ${result.songs.length} songs, but ${result.errors.length} lines had errors.`
        );
      }
    } catch (error: any) {
      Alert.alert(
        "Error", 
        `Failed to read file.\n\nDetails: ${error.message || "Unknown error"}`
      );
      router.back();
    } finally {
      setIsLoading(false);
    }
  }, [fileName, fileUri]);

  // Pan responder for drag-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical drags
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging down
        if (gestureState.dy > 0) {
          modalTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // If dragged down more than 150px or velocity is high, close modal
        if (gestureState.dy > 150 || gestureState.vy > 0.5) {
          closeModal();
        } else {
          // Otherwise, snap back to open position
          Animated.spring(modalTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  // Open modal animation
  useEffect(() => {
    if (showDestinationModal) {
      Animated.parallel([
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(modalTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
      ]).start();
    }
  }, [showDestinationModal, modalOpacity, modalTranslateY]);

  // Close modal animation
  const closeModal = () => {
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslateY, {
        toValue: screenHeight,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowDestinationModal(false);
      modalTranslateY.setValue(screenHeight);
    });
  };

  // Load and parse file
  useEffect(() => {
    if (fileUri) {
      loadFile();
    } else {
      // If no fileUri, show error and go back
      Alert.alert("Error", "No file selected");
      router.back();
    }
  }, [fileUri, loadFile]);

  // Load user playlists when modal opens
  useEffect(() => {
    if (showDestinationModal) {
      loadUserPlaylists();
    }
  }, [showDestinationModal, loadUserPlaylists]);

  // Search all songs after parsing
  const searchAllSongs = async (songs: ParsedSong[]) => {
    if (songs.length === 0) return;
    
    setIsSearching(true);
    setCurrentStep('searching');
    setProgress(0);
    setFoundCount(0);

    const updatedSongs = [...songs];
    const batchSize = 10; // Search 10 songs in parallel
    let found = 0;
    let processed = 0;

    for (let batchStart = 0; batchStart < updatedSongs.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, updatedSongs.length);
      const batch = updatedSongs.slice(batchStart, batchEnd);
      
      // Process batch in parallel
      await Promise.all(
        batch.map(async (song, batchIndex) => {
          const i = batchStart + batchIndex;
          
          try {
            updatedSongs[i] = { ...song, status: 'searching', message: 'Searching...' };
            setParsedSongs([...updatedSongs]);

            // Search for the song (calls 3 APIs in parallel)
            const matchResult = await searchSong(song.title, song.artist, song.album, song);

            if (matchResult && matchResult.song) {
              // Extract media URLs
              let audioUrl = "";
              if (matchResult.song.downloadUrl) {
                if (Array.isArray(matchResult.song.downloadUrl)) {
                  const urls = matchResult.song.downloadUrl;
                  const downloadUrl = urls[urls.length - 1] || urls[4] || urls[3] || urls[2] || urls[1] || urls[0];
                  audioUrl = downloadUrl?.url || downloadUrl?.link || downloadUrl || "";
                } else if (typeof matchResult.song.downloadUrl === 'string') {
                  audioUrl = matchResult.song.downloadUrl;
                }
              }
              
              let imageUrl = "";
              if (matchResult.song.image) {
                if (Array.isArray(matchResult.song.image)) {
                  const images = matchResult.song.image;
                  const image = images[images.length - 1] || images[2] || images[1] || images[0];
                  imageUrl = image?.url || image?.link || image || "";
                } else if (typeof matchResult.song.image === 'string') {
                  imageUrl = matchResult.song.image;
                }
              }
              
              if (!imageUrl && matchResult.song.imageUrl) imageUrl = matchResult.song.imageUrl;
              if (!audioUrl && matchResult.song.audioUrl) audioUrl = matchResult.song.audioUrl;

              const confidence = getMatchConfidence(matchResult.confidence);
              
              updatedSongs[i] = {
                ...song,
                status: 'ready',
                message: confidence === 'high' ? 'High match' : confidence === 'medium' ? 'Good match' : 'Low match',
                matchConfidence: confidence,
                imageUrl: imageUrl,
                audioUrl: audioUrl,
                duration: matchResult.song.duration || song.duration,
                album: matchResult.song.album?.name || matchResult.song.album || song.album,
              };
              
              if (audioUrl) found++;
            } else {
              updatedSongs[i] = {
                ...song,
                status: 'ready',
                message: 'Not found',
                matchConfidence: 'low',
              };
            }
          } catch {
            updatedSongs[i] = {
              ...song,
              status: 'ready',
              message: 'Search failed',
            };
          }

          processed++;
          const currentProgress = Math.floor((processed / updatedSongs.length) * 100);
          setFoundCount(found);
          setProgress(currentProgress);
          setParsedSongs([...updatedSongs]);
        })
      );
      
      // Small delay between batches
      if (batchEnd < updatedSongs.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    setIsSearching(false);
    setCurrentStep('review');
  };

  // Merged: Search and Import in one flow
  const handleStartImport = async () => {
    if (parsedSongs.length === 0) return;
    
    // Show destination modal first
    setShowDestinationModal(true);
  };

  // Start the actual import process (no search needed, already done)
  const handleConfirmImport = async () => {
    if (parsedSongs.length === 0) return;
    
    setShowDestinationModal(false);
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    
    setCurrentStep('importing');
    setIsProcessing(true);
    setProgress(0);
    setAddedCount(0);
    setSkippedCount(0);
    setDuplicates(0);

    let playlistId: string | null = null;
    let isNewPlaylistFirestore = false;

    // Create playlist if needed or use existing
    if (importDestination === 'new-playlist') {
      try {
        if (user && user.id) {
          const result = await createFirestorePlaylist(
            user.id,
            user.name || "User",
            newPlaylistName || "Imported Playlist",
            ""
          );
          playlistId = result?.id || null;
          setCreatedPlaylistId(playlistId);
          setIsFirestorePlaylist(true);
          isNewPlaylistFirestore = true;
        } else {
          const result = await createUserPlaylist(newPlaylistName || "Imported Playlist");
          playlistId = result.id;
          setCreatedPlaylistId(playlistId);
          setIsFirestorePlaylist(false);
          isNewPlaylistFirestore = false;
        }
      } catch {
        Alert.alert("Error", "Failed to create playlist");
        setIsProcessing(false);
        return;
      }
    } else if (importDestination === 'existing-playlist') {
      playlistId = selectedPlaylistId;
      setCreatedPlaylistId(playlistId);
      const selectedPlaylist = userPlaylists.find(p => p.id === playlistId);
      const isFirestore = selectedPlaylist ? 'createdBy' in selectedPlaylist : false;
      setIsFirestorePlaylist(isFirestore);
      isNewPlaylistFirestore = isFirestore;
    }

    const updatedSongs = [...parsedSongs];
    
    // Process songs sequentially to avoid race conditions
    for (let i = 0; i < updatedSongs.length; i++) {
      const song = updatedSongs[i];
      
      // Skip songs without audio
      if (!song.audioUrl) {
        updatedSongs[i] = { ...song, status: 'error', message: 'No audio' };
        setSkippedCount(prev => prev + 1);
        const currentProgress = Math.floor(((i + 1) / updatedSongs.length) * 100);
        setProgress(currentProgress);
        setParsedSongs([...updatedSongs]);
        continue;
      }

      try {
        updatedSongs[i] = { ...song, status: 'searching', message: 'Adding...' };
        setParsedSongs([...updatedSongs]);

        // Create song object and add to destination
        // Use consistent ID based on title and artist for deduplication
        const songId = `${song.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${song.artist.toLowerCase().replace(/[^a-z0-9]/g, '-')}`.substring(0, 100);
        
        const appSong: Song = {
          id: songId,
          title: song.title,
          artist: song.artist,
          album: song.album || "",
          coverUrl: song.imageUrl || "",
          audioUrl: song.audioUrl,
          duration: parseInt(song.duration || "0"),
          genre: "",
        };

        let addSuccess = false;
        
        if (importDestination === 'liked') {
          if (!user?.id) {
            throw new Error('Sign in to import liked songs');
          }
          addSuccess = await addLikedSongToFirestore(user.id, appSong);
        } else if (playlistId) {
          // Check if it's a Firestore playlist (either newly created or existing)
          if (isNewPlaylistFirestore && user?.id) {
            addSuccess = await addSongToFirestorePlaylist(playlistId, appSong);
          } else {
            // Local playlist
            addSuccess = await addSongToPlaylist(playlistId, appSong);
          }
        }
        
        // Handle duplicate detection
        if (!addSuccess) {
          setDuplicates(prev => prev + 1);
          updatedSongs[i] = {
            ...song,
            status: 'added',
            message: 'Already exists',
          };
          const currentProgress = Math.floor(((i + 1) / updatedSongs.length) * 100);
          setProgress(currentProgress);
          setParsedSongs([...updatedSongs]);
          continue;
        }

        updatedSongs[i] = {
          ...song,
          status: 'added',
          message: 'Added',
        };
        setAddedCount(prev => prev + 1);
      } catch (error) {
        console.error(`Failed to add song "${song.title}":`, error);
        updatedSongs[i] = {
          ...song,
          status: 'error',
          message: 'Failed',
        };
        setSkippedCount(prev => prev + 1);
      }

      const currentProgress = Math.floor(((i + 1) / updatedSongs.length) * 100);
      setProgress(currentProgress);
      setParsedSongs([...updatedSongs]);
    }

    // Wait for Firestore writes to complete
    if (isNewPlaylistFirestore) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setIsProcessing(false);
    setCurrentStep('complete');
  };

  const removeSong = (index: number) => {
    const newSongs = [...parsedSongs];
    newSongs.splice(index, 1);
    setParsedSongs(newSongs);
  };

  // Loading state
  if (isLoading || currentStep === 'parse') {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <LinearGradient
          colors={[Colors.background, "#1a1a1a"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Parsing file...</Text>
        </View>
      </View>
    );
  }

  // Searching state - Simple and clean
  if (isSearching || currentStep === 'searching') {
    return (
      <View style={[styles.container, { paddingTop: topInset, backgroundColor: Colors.background }]}>
        <View style={styles.simpleSearchContainer}>
          {/* Animated Search Icon */}
          <View style={styles.simpleSearchIconContainer}>
            <View style={styles.simpleSearchIconCircle}>
              <Ionicons name="search" size={48} color={Colors.primary} />
            </View>
          </View>

          {/* Title */}
          <Text style={styles.simpleSearchTitle}>Finding Your Music</Text>
          
          {/* Progress */}
          <Text style={styles.simpleSearchProgress}>{foundCount} of {parsedSongs.length}</Text>
          
          {/* Progress Bar */}
          <View style={styles.simpleProgressBarContainer}>
            <View style={styles.simpleProgressBar}>
              <View style={[styles.simpleProgressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.simpleProgressPercentage}>{progress}%</Text>
          </View>
        </View>
      </View>
    );
  }

  // Importing state - Simple and clean
  if (currentStep === 'importing' || isProcessing) {
    return (
      <View style={[styles.container, { paddingTop: topInset, backgroundColor: Colors.background }]}>
        <View style={styles.simpleSearchContainer}>
          {/* Animated Import Icon */}
          <View style={styles.simpleSearchIconContainer}>
            <View style={styles.simpleSearchIconCircle}>
              <Ionicons name="download" size={48} color={Colors.primary} />
            </View>
          </View>

          {/* Title */}
          <Text style={styles.simpleSearchTitle}>Importing Songs</Text>
          
          {/* Progress */}
          <Text style={styles.simpleSearchProgress}>{addedCount} of {parsedSongs.length}</Text>
          
          {/* Progress Bar */}
          <View style={styles.simpleProgressBarContainer}>
            <View style={styles.simpleProgressBar}>
              <View style={[styles.simpleProgressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.simpleProgressPercentage}>{progress}%</Text>
          </View>

          {/* Skipped count if any */}
          {skippedCount > 0 && (
            <Text style={styles.simpleSkippedText}>{skippedCount} skipped</Text>
          )}
        </View>
      </View>
    );
  }

  // Complete state
  if (currentStep === 'complete') {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <LinearGradient
          colors={[Colors.background, "#1a1a1a"]}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.completeContainer}>
          <View style={styles.completeIconContainer}>
            <Ionicons name="checkmark-circle" size={80} color={Colors.primary} />
          </View>
          
          <Text style={styles.completeTitle}>Import Complete!</Text>
          <Text style={styles.completeSubtitle}>
            Successfully added {addedCount} {addedCount === 1 ? 'song' : 'songs'}
          </Text>

          {skippedCount > 0 && (
            <Text style={styles.completeSkipped}>
              {skippedCount} {skippedCount === 1 ? 'song' : 'songs'} could not be found
            </Text>
          )}
          
          {duplicates > 0 && (
            <Text style={styles.completeSkipped}>
              {duplicates} {duplicates === 1 ? 'song was' : 'songs were'} already in the playlist
            </Text>
          )}

          <Pressable
            style={styles.completeButton}
            onPress={() => {
              if ((importDestination === 'new-playlist' || importDestination === 'existing-playlist') && createdPlaylistId) {
                const selectedPlaylist = userPlaylists.find((playlist) => playlist.id === selectedPlaylistId);
                const playlistTitle =
                  importDestination === 'new-playlist'
                    ? newPlaylistName.trim() || "Imported Playlist"
                    : selectedPlaylist?.name || "Imported Playlist";

                if (isFirestorePlaylist) {
                  router.replace({
                    pathname: "/playlist/[id]",
                    params: {
                      id: createdPlaylistId,
                      firestore: "true",
                      title: playlistTitle,
                      songCount: String(addedCount),
                    },
                  });
                } else {
                  router.replace({
                    pathname: "/playlist/[id]",
                    params: {
                      id: createdPlaylistId,
                      title: playlistTitle,
                      songCount: String(addedCount),
                    },
                  });
                }
              } else {
                router.replace("/(tabs)/liked-songs");
              }
            }}
          >
            <LinearGradient
              colors={[Colors.primary, "#84E655"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.completeButtonGradient}
            >
              <Text style={styles.completeButtonText}>
                {(importDestination === 'new-playlist' || importDestination === 'existing-playlist') ? 'View Playlist' : 'View Liked Songs'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  // Review state - Main UI
  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <LinearGradient
        colors={[Colors.background, "#1a1a1a"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={safeGoBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Import Songs</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* File Info Card */}
        <View style={styles.fileInfoCard}>
          <View style={styles.fileIconContainer}>
            <Ionicons name="document-text" size={24} color={Colors.primary} />
          </View>
          <View style={styles.fileInfo}>
            <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
            <Text style={styles.songCount}>
              {parsedSongs.filter(s => s.audioUrl).length} of {parsedSongs.length} songs ready to import
            </Text>
          </View>
        </View>

        {/* Song List */}
        <View style={styles.songListHeader}>
          <Text style={styles.songListTitle}>Songs</Text>
        </View>

        {parsedSongs.map((song, index) => (
          <View key={index} style={styles.songItem}>
            {song.imageUrl ? (
              <Image 
                source={{ uri: song.imageUrl }} 
                style={styles.songIconPlaceholder}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={styles.songIconPlaceholder}>
                <Ionicons name="musical-note" size={20} color={Colors.subtext} />
              </View>
            )}
            
            <View style={styles.songInfo}>
              <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
              <View style={styles.songMetaRow}>
                <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
                {song.matchConfidence && (
                  <View style={[
                    styles.matchBadge,
                    song.matchConfidence === 'high' && styles.matchBadgeHigh,
                    song.matchConfidence === 'medium' && styles.matchBadgeMedium,
                    song.matchConfidence === 'low' && styles.matchBadgeLow,
                  ]}>
                    <Text style={styles.matchBadgeText}>
                      {song.matchConfidence === 'high' ? 'High' : 
                       song.matchConfidence === 'medium' ? 'Good' : 
                       'Low'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <Pressable
              onPress={() => removeSong(index)}
              hitSlop={8}
              style={styles.removeButton}
            >
              <Ionicons name="close-circle" size={22} color={Colors.inactive} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {/* Bottom Button */}
      <View style={styles.bottomContainer}>
        <Pressable
          style={[styles.importButton, parsedSongs.filter(s => s.audioUrl).length === 0 && styles.importButtonDisabled]}
          onPress={handleStartImport}
          disabled={parsedSongs.filter(s => s.audioUrl).length === 0}
        >
          <LinearGradient
            colors={parsedSongs.filter(s => s.audioUrl).length === 0 ? ["#444", "#555"] : [Colors.primary, "#84E655"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.importButtonGradient}
          >
            <Text style={styles.importButtonText}>
              Import {parsedSongs.filter(s => s.audioUrl).length} {parsedSongs.filter(s => s.audioUrl).length === 1 ? 'Song' : 'Songs'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      {/* Destination Modal */}
      <Modal
        visible={showDestinationModal}
        transparent
        animationType="none"
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              StyleSheet.absoluteFill,
              { 
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                opacity: modalOpacity,
              }
            ]}
          >
            <Pressable 
              style={StyleSheet.absoluteFill} 
              onPress={closeModal}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.modalBottomSheet,
              {
                transform: [{ translateY: modalTranslateY }],
              },
            ]}
          >
            <View {...panResponder.panHandlers} style={styles.modalDragHandle}>
              <View style={styles.modalDragIndicator} />
            </View>

            <ScrollView 
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.modalTitle}>Where to import?</Text>
              <Text style={styles.modalSubtitle}>Choose where to add your {parsedSongs.length} songs</Text>

              <Pressable
                style={[styles.destinationOption, importDestination === 'liked' && styles.destinationOptionSelected]}
                onPress={() => setImportDestination('liked')}
              >
                <Ionicons 
                  name={importDestination === 'liked' ? "radio-button-on" : "radio-button-off"} 
                  size={24} 
                  color={importDestination === 'liked' ? Colors.primary : Colors.subtext} 
                />
                <View style={styles.destinationOptionText}>
                  <Text style={styles.destinationOptionTitle}>Add to Liked Songs</Text>
                  <Text style={styles.destinationOptionSubtitle}>Add all songs to your liked collection</Text>
                </View>
              </Pressable>

              <Pressable
                style={[styles.destinationOption, importDestination === 'new-playlist' && styles.destinationOptionSelected]}
                onPress={() => setImportDestination('new-playlist')}
              >
                <Ionicons 
                  name={importDestination === 'new-playlist' ? "radio-button-on" : "radio-button-off"} 
                  size={24} 
                  color={importDestination === 'new-playlist' ? Colors.primary : Colors.subtext} 
                />
                <View style={styles.destinationOptionText}>
                  <Text style={styles.destinationOptionTitle}>Create New Playlist</Text>
                  <Text style={styles.destinationOptionSubtitle}>Create a new playlist with these songs</Text>
                </View>
              </Pressable>

              {importDestination === 'new-playlist' && (
                <TextInput
                  style={styles.playlistNameInput}
                  placeholder="Playlist name"
                  placeholderTextColor={Colors.subtext}
                  value={newPlaylistName}
                  onChangeText={setNewPlaylistName}
                />
              )}

              <Pressable
                style={[styles.destinationOption, importDestination === 'existing-playlist' && styles.destinationOptionSelected]}
                onPress={() => setImportDestination('existing-playlist')}
              >
                <Ionicons 
                  name={importDestination === 'existing-playlist' ? "radio-button-on" : "radio-button-off"} 
                  size={24} 
                  color={importDestination === 'existing-playlist' ? Colors.primary : Colors.subtext} 
                />
                <View style={styles.destinationOptionText}>
                  <Text style={styles.destinationOptionTitle}>Add to Existing Playlist</Text>
                  <Text style={styles.destinationOptionSubtitle}>Select a playlist from your library</Text>
                </View>
              </Pressable>

              {importDestination === 'existing-playlist' && (
                <ScrollView style={styles.playlistList} nestedScrollEnabled>
                  {userPlaylists.length === 0 ? (
                    <Text style={styles.noPlaylistsText}>No playlists found. Create one first!</Text>
                  ) : (
                    userPlaylists.map((playlist) => (
                      <Pressable
                        key={playlist.id}
                        style={[
                          styles.playlistItem,
                          selectedPlaylistId === playlist.id && styles.playlistItemSelected
                        ]}
                        onPress={() => setSelectedPlaylistId(playlist.id)}
                      >
                        <Ionicons 
                          name={selectedPlaylistId === playlist.id ? "checkmark-circle" : "ellipse-outline"} 
                          size={20} 
                          color={selectedPlaylistId === playlist.id ? Colors.primary : Colors.subtext} 
                        />
                        <Text style={styles.playlistItemText}>{playlist.name}</Text>
                        <Text style={styles.playlistItemCount}>
                          {('songs' in playlist ? playlist.songs?.length : 0) || 0} songs
                        </Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              )}

              <View style={styles.modalButtons}>
                <Pressable
                  style={styles.modalButtonCancel}
                  onPress={closeModal}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.modalButtonConfirm,
                    (importDestination === 'new-playlist' && !newPlaylistName.trim()) ||
                    (importDestination === 'existing-playlist' && !selectedPlaylistId)
                      ? styles.modalButtonConfirmDisabled
                      : null
                  ]}
                  onPress={handleConfirmImport}
                  disabled={
                    (importDestination === 'new-playlist' && !newPlaylistName.trim()) ||
                    (importDestination === 'existing-playlist' && !selectedPlaylistId)
                  }
                >
                  <LinearGradient
                    colors={
                      (importDestination === 'new-playlist' && !newPlaylistName.trim()) ||
                      (importDestination === 'existing-playlist' && !selectedPlaylistId)
                        ? ["#555", "#666"]
                        : [Colors.primary, "#84E655"]
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
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 90, // Compact bottom space
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.subtext,
  },
  // Compact File Info
  compactFileInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
  },
  fileIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  fileTextInfo: {
    flex: 1,
  },
  fileNameCompact: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 2,
  },
  songCountCompact: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.subtext,
  },
  // Compact Song Items
  compactSongItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 10,
  },
  compactCover: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  compactCoverPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  compactSongInfo: {
    flex: 1,
    minWidth: 0,
  },
  compactTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 3,
  },
  compactMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactArtist: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    flex: 1,
  },
  dotSeparator: {
    fontSize: 12,
    color: Colors.inactive,
  },
  compactBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  compactBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  compactRemove: {
    padding: 4,
  },
  // Bottom Bar - Redesigned
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight + "40",
  },
  actionButton: {
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  actionButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  actionButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.3,
  },
  processingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  progressCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 4,
    borderColor: Colors.primary,
  },
  progressText: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  processingTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  processingSubtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    textAlign: "center",
    marginBottom: 32,
  },
  statsContainer: {
    flexDirection: "row",
    gap: 32,
    marginBottom: 32,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.subtext,
    marginTop: 4,
  },
  currentSong: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    gap: 12,
    width: "100%",
  },
  currentSongInfo: {
    flex: 1,
  },
  currentSongTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 2,
  },
  currentSongArtist: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
  },
  completeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  completeIcon: {
    marginBottom: 24,
  },
  completeTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  completeSubtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    textAlign: "center",
    marginBottom: 8,
  },
  completeSkipped: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.inactive,
    textAlign: "center",
    marginBottom: 32,
  },
  completeButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 28,
  },
  completeButtonText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.black,
  },
  // Redesigned Detecting Songs Page
  detectHeader: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceLight + "20",
  },
  detectHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  detectHeaderTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  progressBarContainer: {
    gap: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressBarText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.subtext,
    textAlign: "center",
  },
  detectScrollView: {
    flex: 1,
  },
  detectScrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  detectSongCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  detectSongCardActive: {
    borderColor: Colors.primary + "40",
    backgroundColor: Colors.surfaceLight,
  },
  detectImageContainer: {
    position: "relative",
  },
  detectSongImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  detectSongImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  detectStatusBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  detectStatusBadgeHigh: {
    backgroundColor: Colors.primary,
  },
  detectStatusBadgeMedium: {
    backgroundColor: "#FFA500",
  },
  detectStatusBadgeLow: {
    backgroundColor: Colors.inactive,
  },
  detectSongInfo: {
    flex: 1,
    minWidth: 0,
  },
  detectSongTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 3,
  },
  detectSongArtist: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    marginBottom: 4,
  },
  detectStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  detectStatusText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.subtext,
  },
  detectStatusTextActive: {
    color: Colors.primary,
  },
  detectStatusTextHigh: {
    color: Colors.primary,
  },
  detectStatusTextMedium: {
    color: "#FFA500",
  },
  detectStatusTextLow: {
    color: Colors.inactive,
  },
  detectSongRight: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  detectPulse: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  detectPulseInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  detectBottomInfo: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: Colors.background + "F0",
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight + "20",
  },
  detectInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  detectInfoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.subtext,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBottomSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 20,
  },
  modalDragHandle: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  modalDragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: Colors.subtext + "40",
    borderRadius: 2,
  },
  modalScrollView: {
    maxHeight: "100%",
  },
  modalContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    marginBottom: 24,
  },
  destinationOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: Colors.background,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  destinationOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceLight,
  },
  destinationOptionText: {
    flex: 1,
  },
  destinationOptionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  destinationOptionSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
  },
  playlistNameInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  modalButtonConfirm: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  modalButtonConfirmGradient: {
    padding: 16,
    alignItems: "center",
    borderRadius: 12,
  },
  modalButtonConfirmText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  modalButtonConfirmDisabled: {
    opacity: 0.5,
  },
  playlistList: {
    maxHeight: 200,
    backgroundColor: Colors.background,
    borderRadius: 12,
    marginBottom: 24,
    padding: 8,
  },
  noPlaylistsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    textAlign: "center",
    padding: 20,
  },
  playlistItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
    gap: 12,
  },
  playlistItemSelected: {
    backgroundColor: Colors.surfaceLight,
  },
  playlistItemText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  playlistItemCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
  },
  
  // New Review Page Styles
  fileInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 14,
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  songCount: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.subtext,
  },
  songListHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  songListTitle: {
    fontSize: 14,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 12,
  },
  songIconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  songInfo: {
    flex: 1,
    minWidth: 0,
  },
  songTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  songMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  songArtist: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    flex: 1,
  },
  matchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  matchBadgeHigh: {
    backgroundColor: Colors.primary + "20",
  },
  matchBadgeMedium: {
    backgroundColor: "#FFA50020",
  },
  matchBadgeLow: {
    backgroundColor: Colors.inactive + "20",
  },
  matchBadgeText: {
    fontSize: 11,
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
    paddingBottom: 16,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight + "40",
  },
  importButton: {
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  importButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  importButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
  },
  importButtonText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.3,
  },

  // Simple Search/Import UI - Clean and minimal
  simpleSearchContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  simpleSearchIconContainer: {
    marginBottom: 32,
  },
  simpleSearchIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  simpleSearchTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 16,
    textAlign: "center",
  },
  simpleSearchProgress: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.subtext,
    marginBottom: 32,
    textAlign: "center",
  },
  simpleProgressBarContainer: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  simpleProgressBar: {
    width: "100%",
    height: 6,
    backgroundColor: Colors.surface,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 12,
  },
  simpleProgressFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  simpleProgressPercentage: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  simpleSkippedText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.inactive,
    marginTop: 24,
    textAlign: "center",
  },
  
  // Complete State Styles
  completeIconContainer: {
    marginBottom: 32,
  },
  completeButtonGradient: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 24,
  },
});


