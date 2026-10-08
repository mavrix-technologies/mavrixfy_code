import { expandPlayer } from "@/lib/playerUIState";
import { useRouter } from "expo-router";
import { useEffect } from "react";

/** Deep links open the one persistent player, never a second playback surface. */
export default function PlayerRoute() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
    expandPlayer();
  }, [router]);
  return null;
}
