import Colors from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator,Text,View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { styles } from "../styles/playerScreenStyles";

export interface PlayerEmptyStateProps {
  topInset: number;
  isLoadingDevTrack: boolean;
  onLoadDevTrack: () => void;
  onClose: () => void;
}

export const PlayerEmptyState = React.memo(function PlayerEmptyState({
  topInset,
  isLoadingDevTrack,
  onLoadDevTrack,
  onClose,
}: PlayerEmptyStateProps) {
  return (
    <View style={[styles.emptyContainer, { paddingTop: topInset }]}>
      <View style={styles.emptyState}>
        <Ionicons name="musical-notes-outline" size={64} color={Colors.inactive} />
        <Text style={styles.emptyText}>No song playing</Text>
        {__DEV__ ? (
          <>
            <Text style={styles.emptyHint}>
              Development helper: load a saved recent, liked, or playlist song to test the player quickly.
            </Text>
            <Pressable
              onPress={onLoadDevTrack}
              style={styles.emptyDevButton}
            >
              {isLoadingDevTrack ? (
                <ActivityIndicator size="small" color={Colors.text} />
              ) : (
                <>
                  <Ionicons name="play" size={16} color={Colors.text} />
                  <Text style={styles.emptyDevButtonText}>Load Dev Test Song</Text>
                </>
              )}
            </Pressable>
          </>
        ) : null}
        <Pressable onPress={onClose} accessibilityLabel="Minimise player" accessibilityRole="button" style={styles.emptyBackButton}>
          <Ionicons name="arrow-down" size={26} color={Colors.text} />
        </Pressable>
      </View>
    </View>
  );
});

PlayerEmptyState.displayName = "PlayerEmptyState";
