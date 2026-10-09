import * as Animated from "@/lib/nativeAnimated";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback } from "react";
import {
  FlatList,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Colors from "@/constants/colors";
import { IS_IOS } from "@/constants/platform";
import { FlatList as GestureFlatList } from "react-native-gesture-handler";
import { styles } from "../styles/playerScreenStyles";
import { StableArtworkImage, type ArtworkQueueItem } from "./PlayerArtworkViews";

const AnimatedSongFlatList = Animated.createAnimatedComponent(
  GestureFlatList as React.ComponentType<any>
);

export interface PlayerTrackCarouselProps {
  listRef: React.MutableRefObject<FlatList<ArtworkQueueItem> | null>;
  artworkQueue: ArtworkQueueItem[];
  pageWidth: number;
  pageSnapInterval: number;
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
  pageWidth,
  pageSnapInterval,
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
      const inputRange = [
        (index - 1) * pageSnapInterval,
        index * pageSnapInterval,
        (index + 1) * pageSnapInterval,
      ];
      const slideScale = scrollX.interpolate({ inputRange, outputRange: [0.86, 1, 0.86], extrapolate: "clamp" });
      const slideOpacity = scrollX.interpolate({ inputRange, outputRange: [0.35, 1, 0.35], extrapolate: "clamp" });
      const cardOpacity = isActiveCard ? Animated.multiply(slideOpacity, videoCrossfadeAnim) : slideOpacity;
      const slideTranslateY = scrollX.interpolate({ inputRange, outputRange: [4, 0, 4], extrapolate: "clamp" });

      return (
        <Pressable
          style={[styles.artCarouselTouch, { width: pageWidth, height: artworkSize }]}
          onPress={() => onTrackPress(index)}
          disabled={isActiveCard}
          accessibilityRole="button"
          accessibilityLabel={isActiveCard ? "Current track artwork" : `Play track ${index + 1}`}
        >
          <Animated.View
            style={[
              styles.artFrame,
              styles.artCarouselCard,
              { width: artworkSize, height: artworkSize },
              { opacity: cardOpacity, transform: [{ translateY: slideTranslateY }, { scale: slideScale }] },
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
    [activeQueueIndex, artworkSize, onTrackPress, pageSnapInterval, pageWidth, scrollX, videoCrossfadeAnim]
  );

  return (
    <View style={styles.artWrap}>
      <AnimatedSongFlatList
        ref={(list: any) => { listRef.current = list as FlatList<ArtworkQueueItem> | null; }}
        data={artworkQueue}
        keyExtractor={(item: ArtworkQueueItem) => item.artworkKey}
        renderItem={renderArtworkCard}
        horizontal
        pagingEnabled={IS_IOS}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEnabled={artworkQueue.length > 1 && !isProgressSeeking}
        decelerationRate="fast"
        disableIntervalMomentum
        snapToAlignment="start"
        snapToInterval={pageSnapInterval}
        contentContainerStyle={styles.artCarouselContent}
        style={styles.artCarousel}
        getItemLayout={getItemLayout}
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

PlayerTrackCarousel.displayName = "PlayerTrackCarousel";
