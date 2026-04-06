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
import { createUserPlaylist, addSongToPlaylist, addLikedSong, getUserPlaylists, UserPlaylist } from "@/lib/storage";
import { createFirestorePlaylist, addLikedSongToFirestore, getUserFirestorePlaylists, FirestorePlaylist, addSongToFirestorePlaylist } from "@/lib/firestore";

export default function FileImportScreen() {
  const insets = useSafeAreaInsets();
  const { fileUri, fileName } = useLocalSearchParams<{ fileUri: string; fileName: string }>();
  const { user } = useAuth();
  
  const [parsedSongs, setParsedSongs] = useState<ParsedSong[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Changed to false initially
  const [isSearching, setIsSearching] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'parse' | 'search' | 'select' | 'import' | 'complete'>('upload');
  const [progress, setProgress] = useState(0);
  const [addedCount, setAddedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
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
      setCurrentStep('select'); // Go to select step to show parsed songs first
      
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

  // Step 2: Search for song details and images
  const searchForSongs = async () => {
    if (parsedSongs.length === 0) return;
    
    setIsSearching(true);
    setCurrentStep('search');
    setProgress(0);

    const updatedSongs = [...parsedSongs];

    for (let i = 0; i < updatedSongs.length; i++) {
      const song = updatedSongs[i];

      try {
        updatedSongs[i] = { ...song, status: 'searching', message: 'Searching...' };
        setParsedSongs([...updatedSongs]);

        const matchResult = await searchSong(song.title, song.artist, song.album);

        if (matchResult && matchResult.song) {
          const confidence = getMatchConfidence(matchResult.confidence);
          
          // Extract download URL - handle both array and object formats
          let audioUrl = "";
          if (matchResult.song.downloadUrl) {
            if (Array.isArray(matchResult.song.downloadUrl)) {
              // Get the highest quality available
              const urls = matchResult.song.downloadUrl;
              const downloadUrl = urls[urls.length - 1] || urls[4] || urls[3] || urls[2] || urls[1] || urls[0];
              audioUrl = downloadUrl?.url || downloadUrl?.link || downloadUrl || "";
            } else if (typeof matchResult.song.downloadUrl === 'string') {
              audioUrl = matchResult.song.downloadUrl;
            }
          }
          
          // Extract image URL - handle both array and string formats
          let imageUrl = "";
          if (matchResult.song.image) {
            if (Array.isArray(matchResult.song.image)) {
              // Get the highest quality available
              const images = matchResult.song.image;
              const image = images[images.length - 1] || images[2] || images[1] || images[0];
              imageUrl = image?.url || image?.link || image || "";
            } else if (typeof matchResult.song.image === 'string') {
              imageUrl = matchResult.song.image;
            }
          }
          
          // Fallback: try direct properties
          if (!imageUrl && matchResult.song.imageUrl) {
            imageUrl = matchResult.song.imageUrl;
          }
          if (!audioUrl && matchResult.song.audioUrl) {
            audioUrl = matchResult.song.audioUrl;
          }
          
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
        } else {
          updatedSongs[i] = {
            ...song,
            status: 'ready',
            message: 'No match found',
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

      setProgress(Math.round(((i + 1) / updatedSongs.length) * 100));
      setParsedSongs([...updatedSongs]);

      // Delay between requests
      if (i < updatedSongs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    setIsSearching(false);
    setCurrentStep('select');
    
    // Show destination modal after search completes
    setTimeout(() => {
      setShowDestinationModal(true);
    }, 300);
  };

  // Step 3: Show destination selection
  const handleNext = () => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    
    // Check if we need to search first
    const needsSearch = parsedSongs.some(song => !song.imageUrl && !song.audioUrl);
    
    if (needsSearch) {
      // Start search process
      searchForSongs();
    } else {
      // Already searched, go to destination modal
      setShowDestinationModal(true);
    }
  };

  // Step 4: Import songs
  const handleImport = async () => {
    if (parsedSongs.length === 0) return;
    
    setShowDestinationModal(false);
    
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    
    setCurrentStep('import');
    setIsProcessing(true);
    setProgress(0);
    setAddedCount(0);
    setSkippedCount(0);

    let playlistId: string | null = null;

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
          setIsFirestorePlaylist(true); // Mark as Firestore playlist
        } else {
          const result = await createUserPlaylist(newPlaylistName || "Imported Playlist");
          playlistId = result.id;
          setCreatedPlaylistId(playlistId);
          setIsFirestorePlaylist(false); // Mark as local playlist
        }
      } catch {
        Alert.alert("Error", "Failed to create playlist");
        setIsProcessing(false);
        return;
      }
    } else if (importDestination === 'existing-playlist') {
      playlistId = selectedPlaylistId;
      setCreatedPlaylistId(playlistId);
      // Check if selected playlist is Firestore
      const selectedPlaylist = userPlaylists.find(p => p.id === playlistId);
      setIsFirestorePlaylist(selectedPlaylist ? 'createdBy' in selectedPlaylist : false);
    }

    const updatedSongs = [...parsedSongs];
    let added = 0;
    let skipped = 0;

    for (let i = 0; i < updatedSongs.length; i++) {
      const song = updatedSongs[i];

      // Skip songs without audio
      if (!song.audioUrl) {
        updatedSongs[i] = { ...song, status: 'error', message: 'No audio found' };
        skipped++;
        setParsedSongs([...updatedSongs]);
        continue;
      }

      try {
        updatedSongs[i] = { ...song, status: 'searching', message: 'Adding...' };
        setParsedSongs([...updatedSongs]);

        const appSong: Song = {
          id: `imported-${Date.now()}-${i}`,
          title: song.title,
          artist: song.artist,
          album: song.album || "",
          coverUrl: song.imageUrl || "",
          audioUrl: song.audioUrl,
          duration: parseInt(song.duration || "0"),
          genre: "",
        };

        if (importDestination === 'liked') {
          // Add to liked songs
          await addLikedSong(appSong);
          
          // Also add to Firestore if user is logged in
          if (user?.id) {
            await addLikedSongToFirestore(user.id, appSong);
          }
        } else if (playlistId) {
          // Check if this is a Firestore playlist
          const selectedPlaylist = userPlaylists.find(p => p.id === playlistId);
          const isFirestorePlaylist = selectedPlaylist && 'createdBy' in selectedPlaylist;
          
          if (isFirestorePlaylist && user?.id) {
            // Firestore playlist - add directly to Firestore
            const success = await addSongToFirestorePlaylist(playlistId, appSong);
            if (!success) {
              throw new Error('Failed to add to Firestore playlist');
            }
          } else {
            // Local playlist - add to AsyncStorage
            await addSongToPlaylist(playlistId, appSong);
          }
        }

        updatedSongs[i] = {
          ...song,
          status: 'added',
          message: 'Added successfully',
        };
        added++;
      } catch {
        updatedSongs[i] = {
          ...song,
          status: 'error',
          message: 'Failed to add',
        };
        skipped++;
      }

      setAddedCount(added);
      setSkippedCount(skipped);
      setProgress(Math.round(((i + 1) / updatedSongs.length) * 100));
      setParsedSongs([...updatedSongs]);

      // Small delay
      if (i < updatedSongs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Wait a bit longer for Firestore writes to complete
    if (isFirestorePlaylist) {
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

  if (isLoading || currentStep === 'parse') {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>
            {currentStep === 'parse' ? 'Parsing file...' : 'Loading...'}
          </Text>
        </View>
      </View>
    );
  }

  // Search phase - show songs with images as they're found
  if (isSearching || currentStep === 'search') {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <LinearGradient
          colors={["#0a0a0a", "#1a1a1a", "#0f0f0f"]}
          style={StyleSheet.absoluteFill}
        />
        
        {/* Header */}
        <View style={styles.detectHeader}>
          <View style={styles.detectHeaderTop}>
            <Pressable onPress={safeGoBack} hitSlop={10}>
              <Ionicons name="close" size={26} color={Colors.text} />
            </Pressable>
            <Text style={styles.detectHeaderTitle}>Detecting Songs</Text>
            <View style={{ width: 26 }} />
          </View>
          
          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBg}>
              <LinearGradient
                colors={[Colors.primary, "#84E655"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressBarFill, { width: `${progress}%` }]}
              />
            </View>
            <Text style={styles.progressBarText}>
              {Math.round(progress)}% • {parsedSongs.filter(s => s.status === 'ready').length}/{parsedSongs.length} songs
            </Text>
          </View>
        </View>

        {/* Song List with Real-time Updates */}
        <ScrollView 
          style={styles.detectScrollView}
          contentContainerStyle={styles.detectScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {parsedSongs.map((song, index) => {
            const isSearching = song.status === 'searching';
            const isReady = song.status === 'ready';
            const hasImage = song.imageUrl && song.imageUrl.length > 0;
            
            return (
              <View 
                key={index} 
                style={[
                  styles.detectSongCard,
                  isSearching && styles.detectSongCardActive
                ]}
              >
                {/* Album Art or Placeholder */}
                <View style={styles.detectImageContainer}>
                  {hasImage ? (
                    <Image 
                      source={{ uri: song.imageUrl }} 
                      style={styles.detectSongImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      priority={isSearching ? "high" : "normal"}
                      transition={300}
                    />
                  ) : (
                    <View style={styles.detectSongImagePlaceholder}>
                      {isSearching ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <Ionicons 
                          name="musical-note" 
                          size={24} 
                          color={isReady ? Colors.inactive : Colors.subtext} 
                        />
                      )}
                    </View>
                  )}
                  
                  {/* Status Badge */}
                  {isReady && song.matchConfidence && (
                    <View style={[
                      styles.detectStatusBadge,
                      song.matchConfidence === 'high' && styles.detectStatusBadgeHigh,
                      song.matchConfidence === 'medium' && styles.detectStatusBadgeMedium,
                      song.matchConfidence === 'low' && styles.detectStatusBadgeLow,
                    ]}>
                      <Ionicons 
                        name={
                          song.matchConfidence === 'high' ? "checkmark-circle" :
                          song.matchConfidence === 'medium' ? "checkmark" :
                          "alert-circle"
                        }
                        size={10}
                        color="#fff"
                      />
                    </View>
                  )}
                </View>
                
                {/* Song Info */}
                <View style={styles.detectSongInfo}>
                  <Text style={styles.detectSongTitle} numberOfLines={1}>
                    {song.title}
                  </Text>
                  <Text style={styles.detectSongArtist} numberOfLines={1}>
                    {song.artist}
                  </Text>
                  
                  {/* Status Message */}
                  {song.message && (
                    <View style={styles.detectStatusRow}>
                      {isSearching && (
                        <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 6 }} />
                      )}
                      <Text style={[
                        styles.detectStatusText,
                        isSearching && styles.detectStatusTextActive,
                        song.matchConfidence === 'high' && styles.detectStatusTextHigh,
                        song.matchConfidence === 'medium' && styles.detectStatusTextMedium,
                        song.matchConfidence === 'low' && styles.detectStatusTextLow,
                      ]} numberOfLines={1}>
                        {song.message}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Right Icon */}
                <View style={styles.detectSongRight}>
                  {isSearching && (
                    <View style={styles.detectPulse}>
                      <View style={styles.detectPulseInner} />
                    </View>
                  )}
                  {isReady && song.matchConfidence === 'high' && (
                    <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                  )}
                  {isReady && song.matchConfidence === 'medium' && (
                    <Ionicons name="checkmark-circle-outline" size={24} color="#FFA500" />
                  )}
                  {isReady && song.matchConfidence === 'low' && (
                    <Ionicons name="alert-circle-outline" size={24} color={Colors.inactive} />
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Bottom Info */}
        <View style={styles.detectBottomInfo}>
          <View style={styles.detectInfoCard}>
            <Ionicons name="information-circle" size={18} color={Colors.primary} />
            <Text style={styles.detectInfoText}>
              Finding high-quality audio and artwork for your songs...
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (currentStep === 'complete') {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <LinearGradient
          colors={[Colors.background, "#1a1a1a"]}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.completeContainer}>
          <View style={styles.completeIcon}>
            <Ionicons name="checkmark-circle" size={80} color={Colors.primary} />
          </View>
          
          <Text style={styles.completeTitle}>Import Complete!</Text>
          <Text style={styles.completeSubtitle}>
            Successfully added {addedCount} songs to {importDestination === 'liked' ? 'your liked songs' : 'your playlist'}
          </Text>

          {skippedCount > 0 && (
            <Text style={styles.completeSkipped}>
              {skippedCount} songs could not be matched
            </Text>
          )}

          <Pressable
            style={styles.completeButton}
            onPress={() => {
              if ((importDestination === 'new-playlist' || importDestination === 'existing-playlist') && createdPlaylistId) {
                // Navigate with proper parameters
                if (isFirestorePlaylist) {
                  router.replace(`/playlist/${createdPlaylistId}?firestore=true`);
                } else {
                  router.replace(`/playlist/${createdPlaylistId}`);
                }
              } else {
                router.replace("/(tabs)/liked-songs");
              }
            }}
          >
            <Text style={styles.completeButtonText}>
              {(importDestination === 'new-playlist' || importDestination === 'existing-playlist') ? 'View Playlist' : 'View Liked Songs'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (currentStep === 'import' || isProcessing) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <LinearGradient
          colors={[Colors.background, "#1a1a1a"]}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.processingContainer}>
          <View style={styles.progressCircle}>
            <Text style={styles.progressText}>{progress}%</Text>
          </View>

          <Text style={styles.processingTitle}>Processing Songs</Text>
          <Text style={styles.processingSubtitle}>
            Finding high-quality audio for your music...
          </Text>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{addedCount}</Text>
              <Text style={styles.statLabel}>Added</Text>
            </View>
            {skippedCount > 0 && (
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: Colors.inactive }]}>{skippedCount}</Text>
                <Text style={styles.statLabel}>Skipped</Text>
              </View>
            )}
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{parsedSongs.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>

          {/* Current song */}
          {parsedSongs.find(s => s.status === 'searching') && (
            <View style={styles.currentSong}>
              <Ionicons name="musical-note" size={20} color={Colors.primary} />
              <View style={styles.currentSongInfo}>
                <Text style={styles.currentSongTitle} numberOfLines={1}>
                  {parsedSongs.find(s => s.status === 'searching')?.title}
                </Text>
                <Text style={styles.currentSongArtist} numberOfLines={1}>
                  {parsedSongs.find(s => s.status === 'searching')?.artist}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  }

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
        <Text style={styles.headerTitle}>Import from File</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Compact File Info */}
        <View style={styles.compactFileInfo}>
          <View style={styles.fileIconSmall}>
            <Ionicons name="document-text" size={20} color={Colors.primary} />
          </View>
          <View style={styles.fileTextInfo}>
            <Text style={styles.fileNameCompact} numberOfLines={1}>{fileName}</Text>
            <Text style={styles.songCountCompact}>
              {parsedSongs.length} {parsedSongs.length === 1 ? 'song' : 'songs'}
            </Text>
          </View>
        </View>

        {/* Compact Song List */}
        {parsedSongs.map((song, index) => (
          <View key={index} style={styles.compactSongItem}>
            {song.imageUrl ? (
              <Image 
                source={{ uri: song.imageUrl }} 
                style={styles.compactCover}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                transition={200}
              />
            ) : (
              <View style={styles.compactCoverPlaceholder}>
                <Ionicons name="musical-note" size={18} color={Colors.subtext} />
              </View>
            )}
            
            <View style={styles.compactSongInfo}>
              <Text style={styles.compactTitle} numberOfLines={1}>{song.title}</Text>
              <View style={styles.compactMetaRow}>
                <Text style={styles.compactArtist} numberOfLines={1}>{song.artist}</Text>
                {song.matchConfidence && (
                  <>
                    <Text style={styles.dotSeparator}>•</Text>
                    <View style={styles.compactBadge}>
                      <Ionicons 
                        name={
                          song.matchConfidence === 'high' ? "checkmark-circle" :
                          song.matchConfidence === 'medium' ? "checkmark" :
                          "alert-circle"
                        }
                        size={10}
                        color={
                          song.matchConfidence === 'high' ? Colors.primary :
                          song.matchConfidence === 'medium' ? "#FFA500" :
                          Colors.inactive
                        }
                      />
                      <Text style={[
                        styles.compactBadgeText,
                        song.matchConfidence === 'high' && { color: Colors.primary },
                        song.matchConfidence === 'medium' && { color: "#FFA500" },
                        song.matchConfidence === 'low' && { color: Colors.inactive },
                      ]}>
                        {song.matchConfidence === 'high' ? 'High' : 
                         song.matchConfidence === 'medium' ? 'Good' : 
                         'Low'}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            <Pressable
              onPress={() => removeSong(index)}
              hitSlop={8}
              style={styles.compactRemove}
            >
              <Ionicons name="close-circle" size={22} color={Colors.inactive} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {/* Redesigned Bottom Button */}
      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.actionButton, parsedSongs.length === 0 && styles.actionButtonDisabled]}
          onPress={handleNext}
          disabled={parsedSongs.length === 0}
        >
          <LinearGradient
            colors={parsedSongs.length === 0 ? ["#444", "#555"] : [Colors.primary, "#84E655"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.actionButtonGradient}
          >
            <Text style={styles.actionButtonText}>
              {parsedSongs.some(s => !s.imageUrl && !s.audioUrl) 
                ? `Find & Import ${parsedSongs.length} Songs`
                : `Import ${parsedSongs.length} Songs`}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      {/* Destination Modal - Native Bottom Sheet */}
      <Modal
        visible={showDestinationModal}
        transparent
        animationType="none"
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop */}
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

          {/* Bottom Sheet */}
          <Animated.View
            style={[
              styles.modalBottomSheet,
              {
                transform: [{ translateY: modalTranslateY }],
              },
            ]}
          >
            {/* Drag Handle */}
            <View {...panResponder.panHandlers} style={styles.modalDragHandle}>
              <View style={styles.modalDragIndicator} />
            </View>

            {/* Content */}
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
                  onPress={handleImport}
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
                    <Text style={styles.modalButtonConfirmText}>Import</Text>
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
});


