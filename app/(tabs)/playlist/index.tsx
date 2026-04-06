import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";
import { safeGoBack } from "@/utils/navigation";
import Colors from "@/constants/colors";

export default function PlaylistAnchorScreen() {
  useFocusEffect(
    useCallback(() => {
      safeGoBack();
    }, [])
  );

  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}

