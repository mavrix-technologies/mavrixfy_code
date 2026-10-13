import * as Animated from "@/lib/nativeAnimated";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback } from "react";
import {
  FlatList,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Colors from "@/constants/colors";
import { FlatList as GestureFlatList, Pressable } from "react-native-gesture-handler";
import { styles } from "../styles/playerScreenStyles";
import { StableArtworkImage, type ArtworkQueueItem } from "./PlayerArtworkViews";

const AnimatedSongFlatList = Animated.createAnimatedComponent(
  GestureFlatList as React.ComponentType<any>
);

export interface PlayerTrackCarouselProps {
  listRef: React.MutableRefObject<FlatList<ArtworkQueueItem> | null>;
  artworkQueue: ArtworkQueueItem[];
  cardWidth?: number;
  cardGap?: number;
  pageWidth?: number;
  pageSnapInterval: number;
  sideInset?: number;
  artworkSize: number;
  activeQueueIndex: number;
  scrollX: Animated.Value;
  isProgressSeeking: boolean;
  videoVisible: boolean;
  onTrackPress: (index: number) => void;
  onScroll: any;
  onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  getItemLayout: any;
}

export const PlayerTrackCarousel = React.memo(function PlayerTrackCarousel({
  listRef,
  artworkQueue,
  cardWidth,
  cardGap,
  pageWidth,
  pageSnapInterval,
  sideInset,
  artworkSize,
  activeQueueIndex,
  scrollX,
  isProgressSeeking,
  videoVisible,
  onTrackPress,
  onScroll,
  onMomentumScrollEnd,
  getItemLayout,
}: PlayerTrackCarouselProps) {
  const [videoCrossfadeAnim] = React.useState(() => new Animated.Value(videoVisible ? 0 : 1));
  const actualCardWidth = cardWidth ?? artworkSize;
  const actualCardGap = cardGap ?? 14;
  const actualSideInset = sideInset ?? Math.max(0, Math.round((pageSnapInterval - actualCardWidth) / 2));

  React.useEffect(() => {
    Animated.timing(videoCrossfadeAnim, {
      toValue: videoVisible ? 0 : 1,
      duration: videoVisible ? 550 : 250,
      useNativeDriver: true,
    }).start();
  }, [videoVisible, videoCrossfadeAnim]);

  const renderArtworkCard = useCallback(
    ({ item, index }: { item: ArtworkQueueItem; index: number }) => {
      const isActiveCard = index === activeQueueIndex;
      const isLastCard = index === artworkQueue.length - 1;
      const inputRange = [
        (index - 1) * pageSnapInterval,
        index * pageSnapInterval,
        (index + 1) * pageSnapInterval,
      ];
      const slideScale = scrollX.interpolate({
        inputRange,
        outputRange: [0.75, 1, 0.75],
        extrapolate: "clamp",
      });
      const slideOpacity = scrollX.interpolate({
        inputRange,
        outputRange: [0.38, 1, 0.38],
        extrapolate: "clamp",
      });
      const slideTranslateX = scrollX.interpolate({
        inputRange,
        outputRange: [-28, 0, 28],
        extrapolate: "clamp",
      });

      // Swipe factor: when actively dragging carousel away from center, smoothly crossfade cards in
      const swipeProgress = scrollX.interpolate({
        inputRange: [
          (activeQueueIndex - 1) * pageSnapInterval,
          activeQueueIndex * pageSnapInterval,
          (activeQueueIndex + 1) * pageSnapInterval,
        ],
        outputRange: [1, 0, 1],
        extrapolate: "clamp",
      });

      // When video is on (videoCrossfadeAnim -> 0) and at rest (swipeProgress = 0), card visibility is 0 (all cards hidden).
      // When dragging or when video is off (videoCrossfadeAnim = 1), cards smoothly fade in.
      const effectiveCardVisibility = Animated.add(
        videoCrossfadeAnim,
        swipeProgress
      ).interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolate: "clamp",
      });

      const cardOpacity = Animated.multiply(slideOpacity, effectiveCardVisibility);

      return (
        <Pressable
          style={[
            styles.artCarouselTouch,
            {
              width: actualCardWidth,
              height: artworkSize,
              marginRight: isLastCard ? 0 : actualCardGap,
            },
          ]}
          onPress={() => onTrackPress(index)}
          disabled={isActiveCard || videoVisible}
          accessibilityRole="button"
          accessibilityLabel={isActiveCard ? "Current track artwork" : `Play track ${index + 1}`}
        >
          <Animated.View
            pointerEvents={videoVisible ? "none" : "auto"}
            style={[
              styles.artFrame,
              styles.artCarouselCard,
              { width: actualCardWidth, height: artworkSize },
              {
                opacity: cardOpacity,
                transform: [
                  { translateX: slideTranslateX },
                  { scale: slideScale },
                ],
              },
            ]}
          >
            <View style={styles.albumArtParallax}>
              {item.song.coverUrl?.trim() ? (
                <StableArtworkImage
                  uri={item.song.coverUrl.trim()}
                  size={artworkSize}
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
      actualCardGap,
      actualCardWidth,
      artworkQueue.length,
      artworkSize,
      onTrackPress,
      pageSnapInterval,
      scrollX,
      videoCrossfadeAnim,
      videoVisible,
    ]
  );

  return (
    <View style={styles.artWrap}>
      <AnimatedSongFlatList
        ref={(list: any) => { listRef.current = list as FlatList<ArtworkQueueItem> | null; }}
        data={artworkQueue}
        keyExtractor={(item: ArtworkQueueItem) => item.artworkKey}
        renderItem={renderArtworkCard}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEnabled={artworkQueue.length > 1 && !isProgressSeeking}
        decelerationRate="fast"
        disableIntervalMomentum
        snapToAlignment="start"
        snapToInterval={pageSnapInterval}
        contentContainerStyle={[
          styles.artCarouselContent,
          {
            paddingLeft: actualSideInset,
            paddingRight: actualSideInset,
          },
        ]}
        style={styles.artCarousel}
        getItemLayout={getItemLayout}
        initialScrollIndex={activeQueueIndex}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
      />
    </View>
  );
});

PlayerTrackCarousel.displayName = "PlayerTrackCarousel";
