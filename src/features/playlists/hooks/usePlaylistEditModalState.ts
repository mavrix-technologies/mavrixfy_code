import { useCallback, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";
import * as Animated from "@/lib/nativeAnimated";
import * as Haptics from "expo-haptics";

interface UsePlaylistEditModalStateParams {
  playlistName: string;
  playlistDescription: string;
  playlistCover: string;
  playlistIsPublic: boolean;
  setEditName: (name: string) => void;
  setEditDescription: (desc: string) => void;
  setEditCover: (cover: string) => void;
  setEditIsPublic: (isPublic: boolean) => void;
  setShowEditModal: (show: boolean) => void;
}

export function usePlaylistEditModalState({
  playlistName,
  playlistDescription,
  playlistCover,
  playlistIsPublic,
  setEditName,
  setEditDescription,
  setEditCover,
  setEditIsPublic,
  setShowEditModal,
}: UsePlaylistEditModalStateParams) {
  const { height: screenHeight } = useWindowDimensions();
  const [modalTranslateY] = useState(() => new Animated.Value(screenHeight));
  const [modalOpacity] = useState(() => new Animated.Value(0));

  const handleOpenEdit = useCallback(() => {
    setEditName(playlistName);
    setEditDescription(playlistDescription);
    setEditCover(playlistCover);
    setEditIsPublic(playlistIsPublic);
    modalOpacity.setValue(0);
    modalTranslateY.setValue(screenHeight);
    setShowEditModal(true);
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.spring(modalTranslateY, {
        toValue: 0,
        damping: 30,
        stiffness: 360,
        mass: 0.78,
        useNativeDriver: true,
      }),
    ]).start();
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [
    modalOpacity,
    modalTranslateY,
    playlistName,
    playlistDescription,
    playlistCover,
    playlistIsPublic,
    screenHeight,
    setEditName,
    setEditDescription,
    setEditCover,
    setEditIsPublic,
    setShowEditModal,
  ]);

  const closeEditModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslateY, {
        toValue: screenHeight,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowEditModal(false);
      modalTranslateY.setValue(screenHeight);
    });
  }, [modalOpacity, modalTranslateY, screenHeight, setShowEditModal]);

  return {
    modalOpacity,
    modalTranslateY,
    handleOpenEdit,
    closeEditModal,
  };
}
