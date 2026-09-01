import React, { memo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface CreatePlaylistModalProps {
  visible: boolean;
  name: string;
  description: string;
  selectedImage: string | null;
  isUploadingImage: boolean;
  onChangeName: (name: string) => void;
  onChangeDescription: (description: string) => void;
  onSelectImage: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const CreatePlaylistModal = memo(function CreatePlaylistModal({
  visible,
  name,
  description,
  selectedImage,
  isUploadingImage,
  onChangeName,
  onChangeDescription,
  onSelectImage,
  onSubmit,
  onClose,
}: CreatePlaylistModalProps) {
  const isSubmitDisabled = !name.trim() || !selectedImage || isUploadingImage;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalOverlay}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss modal"
        >
          <View pointerEvents="none" />
        </Pressable>
        <View style={styles.modalContent}>
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>Create New Playlist</Text>

            <Pressable
              style={styles.imageUploadContainer}
              android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
              onPress={onSelectImage}
              disabled={isUploadingImage}
            >
              {selectedImage ? (
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.selectedImage}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="image-outline" size={32} color={Colors.subtext} />
                  <Text style={styles.imagePlaceholderText}>Select cover image</Text>
                </View>
              )}

              {isUploadingImage && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.uploadingText}>Uploading…</Text>
                </View>
              )}
            </Pressable>

            <TextInput
              style={styles.modalInput}
              placeholder="Playlist name"
              placeholderTextColor={Colors.subtext}
              value={name}
              onChangeText={onChangeName}
              selectionColor={Colors.primary}
            />

            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Description (optional)"
              placeholderTextColor={Colors.subtext}
              value={description}
              onChangeText={onChangeDescription}
              multiline
              numberOfLines={3}
              selectionColor={Colors.primary}
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalCancel}
                android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
                onPress={onClose}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalCreate, isSubmitDisabled && styles.modalCreateDisabled]}
                android_ripple={{ color: "rgba(0, 0, 0, 0.15)" }}
                onPress={onSubmit}
                disabled={isSubmitDisabled}
              >
                <Text style={styles.modalCreateText}>Create</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(8, 10, 14, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorderStrong,
    padding: 18,
    zIndex: 1,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 14,
  },
  imageUploadContainer: {
    width: "100%",
    height: 140,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    marginBottom: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.cardBorderStrong,
  },
  selectedImage: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  imagePlaceholderText: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  uploadingText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  modalInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modalTextArea: {
    height: 84,
    textAlignVertical: "top",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modalCancelText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  modalCreate: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.6)",
  },
  modalCreateDisabled: {
    opacity: 0.5,
  },
  modalCreateText: {
    color: Colors.black,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
