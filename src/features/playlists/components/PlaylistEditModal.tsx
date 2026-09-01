import React from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Animated from "@/lib/nativeAnimated";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

interface PlaylistEditModalProps {
  visible: boolean;
  modalOpacity: Animated.Value;
  modalTranslateY: Animated.Value;
  isFirestoreSource: boolean;
  editName: string;
  setEditName: (name: string) => void;
  editDescription: string;
  setEditDescription: (desc: string) => void;
  editCover: string;
  editIsPublic: boolean;
  setEditIsPublic: (isPublic: boolean) => void;
  isSaving: boolean;
  isUploadingImage: boolean;
  uploadProgress: number;
  onPickImage: () => void;
  onRemoveImage: () => void;
  onSave: () => void;
  onClose: () => void;
  onDelete: () => void;
}

export const PlaylistEditModal: React.FC<PlaylistEditModalProps> = ({
  visible,
  modalOpacity,
  modalTranslateY,
  isFirestoreSource,
  editName,
  setEditName,
  editDescription,
  setEditDescription,
  editCover,
  editIsPublic,
  setEditIsPublic,
  isSaving,
  isUploadingImage,
  uploadProgress,
  onPickImage,
  onRemoveImage,
  onSave,
  onClose,
  onDelete,
}) => {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.7)", opacity: modalOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss edit playlist modal"
          >
            <View pointerEvents="none" />
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.modalBottomSheet, { transform: [{ translateY: modalTranslateY }] }]}>
          <View style={styles.modalDragHandle}>
            <View style={styles.modalDragIndicator} />
          </View>

          <ScrollView style={styles.modalScrollView} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Edit Playlist</Text>

            <View style={styles.compactImageSection}>
              {editCover ? (
                <View style={styles.compactImageContainer}>
                  <Image source={{ uri: editCover }} style={styles.compactImage} contentFit="cover" />
                  <View style={styles.compactImageOverlay}>
                    <Pressable style={styles.compactImageButton} onPress={onPickImage}>
                      <Ionicons name="camera" size={16} color="#fff" />
                    </Pressable>
                    <Pressable style={[styles.compactImageButton, styles.compactImageButtonDanger]} onPress={onRemoveImage}>
                      <Ionicons name="trash" size={16} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={styles.compactImagePlaceholder} onPress={onPickImage}>
                  <Ionicons name="image" size={28} color={Colors.subtext} />
                  <Text style={styles.compactImagePlaceholderText}>Add Cover</Text>
                </Pressable>
              )}

              <View style={styles.compactInfoSection}>
                <TextInput
                  style={styles.compactInput}
                  placeholder="Playlist name"
                  placeholderTextColor={Colors.subtext}
                  value={editName}
                  onChangeText={setEditName}
                  maxLength={100}
                />
                <TextInput
                  style={[styles.compactInput, styles.compactInputSmall]}
                  placeholder="Description (optional)"
                  placeholderTextColor={Colors.subtext}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  maxLength={150}
                />
              </View>
            </View>

            {isFirestoreSource && (
              <View style={styles.compactToggleSection}>
                <View style={styles.compactToggleHeader}>
                  <Ionicons name="eye-outline" size={18} color={Colors.text} />
                  <Text style={styles.compactToggleLabel}>Visibility</Text>
                </View>
                <View style={styles.compactToggleButtons}>
                  <Pressable
                    style={[styles.compactToggleButton, editIsPublic && styles.compactToggleButtonActive]}
                    onPress={() => {
                      setEditIsPublic(true);
                      if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Ionicons name="globe-outline" size={16} color={editIsPublic ? "#fff" : Colors.subtext} />
                    <Text style={[styles.compactToggleButtonText, editIsPublic && styles.compactToggleButtonTextActive]}>Public</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.compactToggleButton, !editIsPublic && styles.compactToggleButtonActive]}
                    onPress={() => {
                      setEditIsPublic(false);
                      if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Ionicons name="lock-closed-outline" size={16} color={!editIsPublic ? "#fff" : Colors.subtext} />
                    <Text style={[styles.compactToggleButtonText, !editIsPublic && styles.compactToggleButtonTextActive]}>Private</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <View style={styles.compactActions}>
              <Pressable
                style={[styles.compactActionButton, styles.compactActionButtonPrimary, (isSaving || isUploadingImage || !editName.trim()) && styles.compactActionButtonDisabled]}
                onPress={onSave}
                disabled={isSaving || isUploadingImage || !editName.trim()}
              >
                <LinearGradient
                  colors={isSaving || isUploadingImage || !editName.trim() ? ["#555", "#666"] : [Colors.primary, "#84E655"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.compactActionButtonGradient}
                >
                  {isSaving || isUploadingImage ? (
                    <View style={styles.compactActionButtonContent}>
                      <ActivityIndicator size="small" color="#000" />
                      {isUploadingImage && <Text style={[styles.compactActionButtonText, { fontSize: 11 }]}>{uploadProgress}%</Text>}
                    </View>
                  ) : (
                    <Text style={styles.compactActionButtonText}>Save</Text>
                  )}
                </LinearGradient>
              </Pressable>
              <Pressable style={[styles.compactActionButton, styles.compactActionButtonSecondary]} onPress={onClose} disabled={isSaving}>
                <Text style={styles.compactActionButtonTextSecondary}>Cancel</Text>
              </Pressable>
            </View>

            <Pressable style={styles.compactDeleteButton} onPress={onDelete} disabled={isSaving || isUploadingImage}>
              <Ionicons name="trash-outline" size={16} color="#FF4444" />
              <Text style={styles.compactDeleteButtonText}>Delete Playlist</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBottomSheet: {
    backgroundColor: "#161B22",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 36,
    maxHeight: "85%",
  },
  modalDragHandle: {
    alignItems: "center",
    paddingVertical: 12,
  },
  modalDragIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  modalScrollView: {
    paddingHorizontal: 20,
  },
  modalContent: {
    gap: 18,
    paddingBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  compactImageSection: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  compactImageContainer: {
    width: 90,
    height: 90,
    borderRadius: 12,
    overflow: "hidden",
  },
  compactImage: {
    width: "100%",
    height: "100%",
  },
  compactImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  compactImageButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  compactImageButtonDanger: {
    backgroundColor: "rgba(255,68,68,0.5)",
  },
  compactImagePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  compactImagePlaceholderText: {
    color: Colors.subtext,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  compactInfoSection: {
    flex: 1,
    gap: 10,
  },
  compactInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  compactInputSmall: {
    fontSize: 12,
    paddingVertical: 8,
  },
  compactToggleSection: {
    gap: 8,
  },
  compactToggleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactToggleLabel: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  compactToggleButtons: {
    flexDirection: "row",
    gap: 10,
  },
  compactToggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  compactToggleButtonActive: {
    backgroundColor: "rgba(108, 92, 231, 0.25)",
    borderColor: "rgba(108, 92, 231, 0.6)",
  },
  compactToggleButtonText: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  compactToggleButtonTextActive: {
    color: "#fff",
  },
  compactActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  compactActionButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  compactActionButtonPrimary: {},
  compactActionButtonDisabled: {
    opacity: 0.5,
  },
  compactActionButtonGradient: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  compactActionButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactActionButtonText: {
    color: "#000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  compactActionButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  compactActionButtonTextSecondary: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  compactDeleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 68, 68, 0.2)",
    marginTop: 8,
  },
  compactDeleteButtonText: {
    color: "#FF4444",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
