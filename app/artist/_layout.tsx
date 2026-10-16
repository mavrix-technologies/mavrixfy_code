import Colors from "@/constants/colors";
import { ScreenWithNavigation } from "@/features/navigation/ScreenWithNavigation";
import { Stack } from "expo-router";

export default function ArtistLayout() {
  return (
    <ScreenWithNavigation>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
        }}
      />
    </ScreenWithNavigation>
  );
}
