import React from "react";
import { View, Text } from "react-native";
import { FlatList as GHFlatList } from "react-native-gesture-handler";

import type { Song } from "@/lib/musicData";
import { KaraokeLyricsView } from "@/components/KaraokeLyricsView";
import AdMobBanner from "@/components/AdMobBanner";
import { IS_ANDROID } from "@/constants/platform";
import { AboutArtistCard, RelatedSongsSection } from "./PlayerDiscoverySections";
import { styles } from "../styles/playerScreenStyles";

export interface PlayerBottomDetailsSectionProps {
  screenSong: Song;
  currentPositionSeconds: number;
  totalLengthSec: number;
  playbackActive: boolean;
  accentColor: string;
  onTogglePlay: () => void;
  onLyricSeek: (seconds: number) => void;
  onToggleFullScreenLyrics: () => void;
  ambientVideoLayoutActive: boolean;
  isShortScreen: boolean;
  queueViewportStyle: any;
  playingQueue: Song[];
  queueKeyExtractor: (item: Song, index: number) => string;
  renderQueueItem: ({ item, index }: { item: Song; index: number }) => React.ReactElement;
  getQueueItemLayout: any;
  artistDetails: any;
  artistLoading: boolean;
  onViewArtistProfile: () => void;
  relatedSongs: Song[];
  onPlayRelatedSong: (song: Song) => void;
}

export const PlayerBottomDetailsSection = React.memo(function PlayerBottomDetailsSection({
  screenSong,
  currentPositionSeconds,
  totalLengthSec,
  playbackActive,
  accentColor,
  onTogglePlay,
  onLyricSeek,
  onToggleFullScreenLyrics,
  ambientVideoLayoutActive,
  isShortScreen,
  queueViewportStyle,
  playingQueue,
  queueKeyExtractor,
  renderQueueItem,
  getQueueItemLayout,
  artistDetails,
  artistLoading,
  onViewArtistProfile,
  relatedSongs,
  onPlayRelatedSong,
}: PlayerBottomDetailsSectionProps) {
  return (
    <View>
      <KaraokeLyricsView
        song={screenSong}
        currentPositionSeconds={currentPositionSeconds}
        isPlaying={playbackActive}
        accentColor={accentColor}
        onTogglePlay={onTogglePlay}
        onSeek={onLyricSeek}
        onToggleFullScreen={onToggleFullScreenLyrics}
      />

      <AdMobBanner loadDelayMs={1200} />

      <View
        style={[
          styles.playingListSection,
          ambientVideoLayoutActive && styles.playingListSectionAmbient,
        ]}
      >
        <View style={[styles.playingListHeader, isShortScreen && styles.playingListHeaderCompact]}>
          <Text style={styles.playingListTitle}>Queue</Text>
        </View>
        <View style={[styles.queueListViewport, queueViewportStyle]}>
          <GHFlatList
            data={playingQueue}
            keyExtractor={queueKeyExtractor}
            renderItem={renderQueueItem}
            getItemLayout={getQueueItemLayout}
            contentContainerStyle={styles.queueListContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            bounces={false}
            overScrollMode="never"
            removeClippedSubviews={IS_ANDROID}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            updateCellsBatchingPeriod={50}
          />
        </View>
      </View>

      <AboutArtistCard
        artistDetails={artistDetails}
        loading={artistLoading}
        onPress={onViewArtistProfile}
      />

      <RelatedSongsSection
        songs={relatedSongs}
        onSongPress={onPlayRelatedSong}
      />
    </View>
  );
});

PlayerBottomDetailsSection.displayName = "PlayerBottomDetailsSection";
