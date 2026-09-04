import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  FlatList,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { ParsedSong } from "@/types/import";
import { UserPlaylist } from "@/lib/storage";
import { FirestorePlaylist } from "@/lib/firestore";
import { styles } from "../styles/importSongsStyles";

export type ImportDestination = "liked" | "new-playlist" | "existing-playlist";
export type ImportDestinationPlaylist = UserPlaylist | FirestorePlaylist;

export function ImportedSongRow({
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

export function ImportPlaylistChoiceRow({
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

export function ImportDestinationModal({
  visible,
  readySongCount,
  importDestination,
  setImportDestination,
  newPlaylistName,
  setNewPlaylistName,
  selectedPlaylistId,
  setSelectedPlaylistId,
  userPlaylists,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  readySongCount: number;
  importDestination: ImportDestination;
  setImportDestination: (dest: ImportDestination) => void;
  newPlaylistName: string;
  setNewPlaylistName: (name: string) => void;
  selectedPlaylistId: string | null;
  setSelectedPlaylistId: (id: string) => void;
  userPlaylists: ImportDestinationPlaylist[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const renderPlaylistChoice = useCallback(
    ({ item }: { item: ImportDestinationPlaylist }) => (
      <ImportPlaylistChoiceRow
        playlist={item}
        selectedPlaylistId={selectedPlaylistId}
        onSelect={setSelectedPlaylistId}
      />
    ),
    [selectedPlaylistId, setSelectedPlaylistId]
  );

  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
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
                renderItem={renderPlaylistChoice}
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
                onPress={onClose}
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
                onPress={onConfirm}
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
  );
}
