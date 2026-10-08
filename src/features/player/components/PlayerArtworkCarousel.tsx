import * as Animated from "@/lib/nativeAnimated";
import { Ionicons } from "@expo/vector-icons";
import React,{ useCallback } from "react";
import {
FlatList,
Pressable,
View,
type NativeScrollEvent,
type NativeSyntheticEvent,
} from "react-native";

import Colors from "@/constants/colors";
import { FlatList as GestureFlatList } from "react-native-gesture-handler";
import { IS_IOS } from "@/constants/platform";
import { styles } from "../styles/playerScreenStyles";
import { StableArtworkImage,type ArtworkQueueItem } from "./PlayerArtworkViews";

const AnimatedSongFlatList = Animated.createAnimatedComponent(
  GestureFlatList as React.ComponentType<any>
);

export interface PlayerArtworkCarouselProps {
  artCarouselRef: React.MutableRefObject<FlatList<ArtworkQueueItem> | null>;
  artworkQueue: ArtworkQueueItem[];
  artCarouselSnapInterval: number;
  artCarouselPageWidth: number;
  artSize: number;
  activeQueueIndex: number;
  artScrollX: Animated.Value;
  playingQueueLength: number;
  isProgressSeeking: boolean;
  ambientArtworkEnabled: boolean;
  onArtworkSongChange: (index: number) => void;
  onScroll: any;
  onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  artCarouselGetItemLayout: any;
}

export const PlayerArtworkCarousel = React.memo(function PlayerArtworkCarousel({
  artCarouselRef,
  artworkQueue,
  artCarouselSnapInterval,
  artCarouselPageWidth,
  artSize,
  activeQueueIndex,
  artScrollX,
  playingQueueLength,
  isProgressSeeking,
  ambientArtworkEnabled,
  onArtworkSongChange,
  onScroll,
  onMomentumScrollEnd,
  artCarouselGetItemLayout,
}: PlayerArtworkCarouselProps) {
  const [ambientArtworkOpacity] = React.useState(
    () => new Animated.Value(ambientArtworkEnabled ? 0 : 1)
  );

  React.useEffect(() => {
    Animated.timing(ambientArtworkOpacity, {
      toValue: ambientArtworkEnabled ? 0 : 1,
      duration: ambientArtworkEnabled ? 350 : 250,
      useNativeDriver: true,
      isInteraction: false,
    }).start();
  }, [ambientArtworkEnabled, ambientArtworkOpacity]);

  const renderArtworkCard = useCallback(
    ({ item, index }: { item: ArtworkQueueItem; index: number }) => {
      const song = item.song;
      const isActiveCard = index === activeQueueIndex;
      const inputRange = [
        (index - 1) * artCarouselSnapInterval,
        index * artCarouselSnapInterval,
        (index + 1) * artCarouselSnapInterval,
      ];

      const slideScale = artScrollX.interpolate({
        inputRange,
        outputRange: [0.86, 1, 0.86],
        extrapolate: "clamp",
      });

      const slideOpacity = artScrollX.interpolate({
        inputRange,
        outputRange: [0.35, 1, 0.35],
        extrapolate: "clamp",
      });

      const cardOpacity = isActiveCard
        ? Animated.multiply(slideOpacity, ambientArtworkOpacity)
        : slideOpacity;

      const slideTranslateY = artScrollX.interpolate({
        inputRange,
        outputRange: [4, 0, 4],
        extrapolate: "clamp",
      });

      return (
        <Pressable
          style={[styles.artCarouselTouch, { width: artCarouselPageWidth, height: artSize }]}
          onPress={() => onArtworkSongChange(index)}
          disabled={isActiveCard}
        >
          <Animated.View
            style={[
              styles.artFrame,
              styles.artFrameDefault,
              styles.artCarouselCard,
              { width: artSize, height: artSize },
              {
                opacity: cardOpacity,
                transform: [
                  { translateY: slideTranslateY },
                  { scale: slideScale },
                ],
              },
            ]}
          >
            <View style={styles.albumArtParallax}>
              {song.coverUrl?.trim() ? (
                <StableArtworkImage
                  uri={song.coverUrl.trim()}
                  size={artSize}
                  recyclingKey={item.artworkKey}
                  priority={isActiveCard ? "high" : "normal"}
                />
              ) : (
                <View style={[styles.albumArt, styles.albumFallback]}>
                  <Ionicons name="musical-notes" size={58} color={Colors.subtext} />
                </View>
              )}
            </View>
          </Animated.View>
        </Pressable>
      );
    },
    [
      activeQueueIndex,
      artCarouselPageWidth,
      artCarouselSnapInterval,
      artScrollX,
      artSize,
      ambientArtworkOpacity,
      onArtworkSongChange,
    ]
  );

  return (
    <View style={styles.artWrap}>
      <AnimatedSongFlatList
        ref={(list: any) => {
          artCarouselRef.current = list as FlatList<ArtworkQueueItem> | null;
        }}
        data={artworkQueue}
        keyExtractor={(item: ArtworkQueueItem) => item.artworkKey}
        renderItem={renderArtworkCard}
        horizontal
        pagingEnabled={IS_IOS}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEnabled={playingQueueLength > 1 && !isProgressSeeking}
        decelerationRate="fast"
        disableIntervalMomentum
        snapToAlignment="start"
        snapToInterval={artCarouselSnapInterval}
        contentContainerStyle={styles.artCarouselContent}
        style={styles.artCarousel}
        getItemLayout={artCarouselGetItemLayout}
        initialScrollIndex={activeQueueIndex}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        windowSize={3}
        updateCellsBatchingPeriod={80}
        removeClippedSubviews={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
      />
    </View>
  );
});

PlayerArtworkCarousel.displayName = "PlayerArtworkCarousel";
