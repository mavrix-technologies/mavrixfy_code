import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { InteractionManager, View } from "react-native";
import { safeGoBack } from "@/utils/navigation";
import Colors from "@/constants/colors";

export default function PlaylistAnchorScreen() {
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        safeGoBack();
      });
      return () => task.cancel();
    }, [])
  );

  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}
