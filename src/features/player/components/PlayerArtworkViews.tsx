import React, { useCallback, useEffect, useRef, useState, memo } from "react";
import * as Animated from "@/lib/nativeAnimated";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import type { Song } from "@/lib/musicData";
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
}: {
  uri: string;
  recyclingKey: string;
  priority: "high" | "normal";
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
      <Image
        recyclingKey={`visible-${recyclingKey}-${visibleUri}`}
        source={{ uri: visibleUri }}
        style={styles.albumArt}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority={priority}
        transition={0}
      />
      {loadingUri ? (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: incomingOpacity }]}>
          <Image
            recyclingKey={`incoming-${recyclingKey}-${loadingUri}`}
            source={{ uri: loadingUri }}
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
