import { memo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "expo-router";
import type { Song } from "@/lib/musicData";
import { getPlaybackProgressSnapshot } from "@/services/audio/playbackProgressStore";
import { useBackgroundVisualVideo } from "../hooks/useBackgroundVisualVideo";
import { BackgroundYoutubeVideo } from "./BackgroundYoutubeVideo";

/** Mounted only in Ambient so Classic and Night never allocate a video decoder. */
export const StandByAmbientBackdrop = memo(function StandByAmbientBackdrop({
  song, accentColor, backgroundColor, reduceMotion,
}: { song: Song; accentColor: string; backgroundColor: string; reduceMotion: boolean }) {
  const navigation = useNavigation();
  const video = useBackgroundVisualVideo({ screenSong: song, navigation });
  const [initialOffsetMs] = useState(() => getPlaybackProgressSnapshot().positionMillis);

  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFillObject}>
      <LinearGradient colors={[accentColor, backgroundColor, "#203448"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
      {song.coverUrl && (
        <Image
          source={{ uri: song.coverUrl }}
          contentFit="cover"
          blurRadius={42}
          transition={reduceMotion ? 0 : 350}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.45 }]}
        />
      )}
      {!reduceMotion && video.shouldRenderBackgroundVideo && video.backgroundVideoId && (
        <BackgroundYoutubeVideo
          videoId={video.backgroundVideoId}
          song={song}
          active={video.isScreenFocused}
          quality={video.videoBackgroundQuality}
          isLowEnd={video.isLowEnd}
          initialOffsetMs={initialOffsetMs}
          cropVertical={0}
          backgroundColor="transparent"
        />
      )}
      <LinearGradient
        colors={["rgba(15, 23, 42, 0.28)", "rgba(15, 23, 42, 0.68)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
});
