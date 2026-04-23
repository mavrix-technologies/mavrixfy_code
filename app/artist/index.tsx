import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { InteractionManager, View } from "react-native";
import { safeGoBack } from "@/utils/navigation";
import Colors from "@/constants/colors";

export default function ArtistAnchorScreen() {
  useFocusEffect(
    useCallback(() => {
      // Wait for all navigation animations to finish before going back.
      // Calling router.back() during a transition causes black screen / freeze.
      const task = InteractionManager.runAfterInteractions(() => {
        safeGoBack();
      });
      return () => task.cancel();
    }, [])
  );

  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}
