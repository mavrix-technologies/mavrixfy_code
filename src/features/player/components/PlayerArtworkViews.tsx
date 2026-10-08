import type { Song } from "@/lib/musicData";
import * as Animated from "@/lib/nativeAnimated";
import { MusicArtwork } from "@/components/MusicArtwork";
import { memo,useCallback,useEffect,useRef,useState } from "react";
import { StyleSheet,View } from "react-native";
import { styles } from "../styles/playerScreenStyles";

export type ArtworkQueueItem = {
  song: Song;
  artworkKey: string;
};

export const CinematicPlayerBackground = memo(function CinematicPlayerBackground() {
  return (
    <View
      pointerEvents="none"
      style={styles.backgroundLayer}
    />
  );
});

export const StableArtworkImage = memo(function StableArtworkImage({
  uri,
  recyclingKey,
  priority,
  size,
}: {
  uri: string;
  recyclingKey: string;
  priority: "high" | "normal";
  size: number;
}) {
  const initialUriRef = useRef(uri);
  const [visibleUri, setVisibleUri] = useState(initialUriRef.current);
  const loadingUri = uri === visibleUri ? null : uri;
  const incomingOpacityRef = useRef<Animated.Value | null>(null);
  if (incomingOpacityRef.current === null) {
    incomingOpacityRef.current = new Animated.Value(1);
  }
  const incomingOpacity = incomingOpacityRef.current!;

  useEffect(() => {
    if (!loadingUri) {
      incomingOpacity.setValue(1);
      return;
    }

    incomingOpacity.stopAnimation();
    incomingOpacity.setValue(0);
  }, [incomingOpacity, loadingUri]);

  const handleIncomingLoad = useCallback(() => {
    Animated.timing(incomingOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
      isInteraction: false,
    }).start(({ finished }) => {
      if (!finished) return;
      setVisibleUri(uri);
    });
  }, [incomingOpacity, uri]);

  const handleIncomingError = useCallback(() => {
    incomingOpacity.setValue(1);
    setVisibleUri(uri);
  }, [incomingOpacity, uri]);

  return (
    <View style={styles.albumArtLayer}>
      <MusicArtwork
        recyclingKey={`visible-${recyclingKey}-${visibleUri}`}
        uri={visibleUri}
        size={size}
        style={styles.albumArt}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority={priority}
        transition={0}
      />
      {loadingUri ? (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: incomingOpacity }]}>
          <MusicArtwork
            recyclingKey={`incoming-${recyclingKey}-${loadingUri}`}
            uri={loadingUri}
            size={size}
            style={styles.albumArt}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority={priority}
            transition={0}
            onLoad={handleIncomingLoad}
            onError={handleIncomingError}
          />
        </Animated.View>
      ) : null}
    </View>
  );
});

StableArtworkImage.displayName = "StableArtworkImage";
