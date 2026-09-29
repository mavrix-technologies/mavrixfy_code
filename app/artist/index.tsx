import Colors from "@/constants/colors";
import { runAfterIdle } from "@/utils/idleTask";
import { safeGoBack } from "@/utils/navigation";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";

export default function ArtistAnchorScreen() {
  useFocusEffect(
    useCallback(() => {
      // Wait for all navigation animations to finish before going back.
      // Calling router.back() during a transition causes black screen / freeze.
      const cancelIdle = runAfterIdle(() => {
        safeGoBack();
      });
      return () => cancelIdle();
    }, [])
  );

  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}
