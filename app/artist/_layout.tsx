import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function ArtistLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: "default",
        gestureEnabled: true,
        // fullScreenGestureEnabled causes conflicts with vertical ScrollView —
        // only use the standard left-edge swipe
        fullScreenGestureEnabled: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[id]"
        options={{ gestureEnabled: true, fullScreenGestureEnabled: false }}
      />
    </Stack>
  );
}