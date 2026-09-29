import React from "react";
import { Text,View } from "react-native";
import { ScrollView as GHScrollView } from "react-native-gesture-handler";

import AdMobBanner from "@/components/AdMobBanner";
import { KaraokeLyricsView } from "@/components/KaraokeLyricsView";
import type { Song } from "@/lib/musicData";
import { usePlaybackProgressStore } from "@/services/audio/playbackProgressStore";
import { styles } from "../styles/playerScreenStyles";
import { AboutArtistCard,RelatedSongsSection } from "./PlayerDiscoverySections";

export interface PlayerBottomDetailsSectionProps {
  screenSong: Song;
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
  getQueueItemLayout?: any;
  artistDetails: any;
  artistLoading: boolean;
  onViewArtistProfile: () => void;
  relatedSongs: Song[];
  onPlayRelatedSong: (song: Song) => void;
}

export const PlayerBottomDetailsSection = React.memo(function PlayerBottomDetailsSection({
  screenSong,
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
  artistDetails,
  artistLoading,
  onViewArtistProfile,
  relatedSongs,
  onPlayRelatedSong,
}: PlayerBottomDetailsSectionProps) {
  return (
    <View>
      <LiveKaraokeLyrics
        song={screenSong}
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
          <GHScrollView
            contentContainerStyle={styles.queueListContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            bounces={false}
            overScrollMode="never"
          >
            {playingQueue.map((item, index) => (
              <React.Fragment key={queueKeyExtractor(item, index)}>
                {renderQueueItem({ item, index })}
              </React.Fragment>
            ))}
          </GHScrollView>
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

const LiveKaraokeLyrics = React.memo(function LiveKaraokeLyrics(
  props: Omit<React.ComponentProps<typeof KaraokeLyricsView>, "currentPositionSeconds">
) {
  const { positionMillis } = usePlaybackProgressStore();
  return <KaraokeLyricsView {...props} currentPositionSeconds={positionMillis / 1000} />;
});
