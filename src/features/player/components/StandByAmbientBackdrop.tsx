import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { Song } from "@/lib/musicData";

/** Visuals only: StandBy never creates a media player or changes audio focus. */
export const StandByAmbientBackdrop = memo(function StandByAmbientBackdrop({
  song, accentColor, backgroundColor, reduceMotion,
}: { song: Song; accentColor: string; backgroundColor: string; reduceMotion: boolean }) {

  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFillObject}>
      <LinearGradient colors={[accentColor, backgroundColor]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
      {song.coverUrl && (
        <Image
          source={{ uri: song.coverUrl }}
          contentFit="cover"
          blurRadius={42}
          transition={reduceMotion ? 0 : 350}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.45 }]}
        />
      )}
      <LinearGradient
        colors={["rgba(0, 0, 0, 0.28)", "rgba(0, 0, 0, 0.68)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
});
