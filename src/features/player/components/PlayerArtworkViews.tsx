import { MusicArtwork } from "@/components/MusicArtwork";
import type { Song } from "@/lib/musicData";
import { memo } from "react";
import { View } from "react-native";
import { styles } from "../styles/playerScreenStyles";

export type ArtworkQueueItem = { song: Song; artworkKey: string };

/** Native caching and source recycling keep one artwork layer tied to its track. */
export const StableArtworkImage = memo(function StableArtworkImage({ uri, recyclingKey, priority, size }: {
  uri: string;
  recyclingKey: string;
  priority: "high" | "normal";
  size: number;
}) {
  return (
    <View style={styles.albumArtLayer}>
      <MusicArtwork uri={uri} size={size} recyclingKey={recyclingKey}
        style={styles.albumArt} contentFit="cover" contentPosition="center" priority={priority} transition={0} />
    </View>
  );
});

StableArtworkImage.displayName = "StableArtworkImage";
