import { MaterialCommunityIcons,MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { View } from "react-native";

import { PingPongScroll } from "@/components/PingPongScroll";
import type { Song } from "@/lib/musicData";
import { usePlaybackProgressStore } from "@/services/audio/playbackProgressStore";
import { unescapeHtml } from "@/utils/stringUtils";
import { styles } from "../styles/playerScreenStyles";
import {
PlayerPlayButton,
PlayerSpotifyProgress,
SmoothControlButton,
} from "./PlayerControlComponents";
import { SpotifyMotionSaveButton } from "./SpotifyMotionSaveButton";

export interface PlayerControlsSectionProps {
  screenSong: Song;
  sheetTextColor: string;
  sheetMutedTextColor: string;
  selectedControlIconColor: string;
  sideControlIconColor: string;
  activeControlIconColor: string;
  songDetailActionBtnStyle: any;
  playerIconBtnStyle: any;
  prevNextBtnSizeStyle: any;
  isShortScreen: boolean;
  isVeryShortScreen: boolean;
  interactionReady: boolean;
  liked: boolean;
  onToggleLike: () => void;
  onOpenQueue: () => void;
  onSeekTo: (progress: number) => void;
  onSeekingChange: (isSeeking: boolean) => void;
  controlsRowGap: number;
  shuffleRepeatIconSize: number;
  prevNextIconSize: number;
  playButtonSize: number;
  playIconSize: number;
  songDetailIconSize: number;
  playerIsShuffled: boolean;
  playbackActive: boolean;
  playerRepeatMode: "off" | "all" | "one";
  onToggleShuffle: () => void;
  onSkip: (direction: "prev" | "next") => void;
  onTogglePlay: () => void;
  onToggleRepeat: () => void;
}

export const PlayerControlsSection = React.memo(function PlayerControlsSection({
  screenSong,
  sheetTextColor,
  sheetMutedTextColor,
  selectedControlIconColor,
  sideControlIconColor,
  activeControlIconColor,
  songDetailActionBtnStyle,
  playerIconBtnStyle,
  prevNextBtnSizeStyle,
  isShortScreen,
  isVeryShortScreen,
  interactionReady,
  liked,
  onToggleLike,
  onOpenQueue,
  onSeekTo,
  onSeekingChange,
  controlsRowGap,
  shuffleRepeatIconSize,
  prevNextIconSize,
  playButtonSize,
  playIconSize,
  songDetailIconSize,
  playerIsShuffled,
  playbackActive,
  playerRepeatMode,
  onToggleShuffle,
  onSkip,
  onTogglePlay,
  onToggleRepeat,
}: PlayerControlsSectionProps) {
  return (
    <View style={{ flexGrow: 0 }}>
      <View
        style={[
          styles.songBlock,
          {
            marginTop: isVeryShortScreen ? 12 : isShortScreen ? 16 : 20,
            marginHorizontal: isShortScreen ? 16 : 20,
          },
        ]}
      >
        <View style={styles.songTextWrap}>
          <PingPongScroll
            text={unescapeHtml(screenSong.title)}
            style={[
              styles.songTitle,
              {
                color: sheetTextColor,
                fontSize: isVeryShortScreen ? 21 : isShortScreen ? 23 : 25,
                lineHeight: isVeryShortScreen ? 25 : isShortScreen ? 27 : 30,
              },
            ]}
            velocity={12}
            paused={!interactionReady}
          />
          <PingPongScroll
            text={unescapeHtml(screenSong.artist)}
            style={[
              styles.songArtist,
              {
                color: sheetMutedTextColor,
                fontSize: isVeryShortScreen ? 12 : 13,
                lineHeight: isVeryShortScreen ? 16 : 18,
              },
            ]}
            velocity={10}
            paused={!interactionReady}
          />
        </View>
        <View style={styles.songDetailActions}>
          <SpotifyMotionSaveButton
            liked={liked}
            onToggleLike={onToggleLike}
            iconSize={songDetailIconSize + 4}
            style={[styles.songDetailActionButton, songDetailActionBtnStyle]}
            activeColor={selectedControlIconColor}
            inactiveColor="#FFFFFF"
            accessibilityLabel={
              liked ? "Remove from Liked Songs" : "Add to Liked Songs"
            }
          />
          <SmoothControlButton
            accessibilityLabel="Open playback queue"
            accessibilityRole="button"
            style={[styles.songDetailActionButton, songDetailActionBtnStyle]}
            onPress={onOpenQueue}
          >
            <MaterialIcons
              name="queue-music"
              size={songDetailIconSize}
              color="#FFFFFF"
            />
          </SmoothControlButton>
        </View>
      </View>

      <View style={styles.playerActionStack}>
        <LivePlayerProgress
          key={screenSong.id}
          totalSongSec={screenSong.duration}
          isShortScreen={isShortScreen}
          seekTo={onSeekTo}
          onSeekingChange={onSeekingChange}
        />

        <View
          style={[
            styles.controlsRow,
            {
              marginTop: isShortScreen ? 2 : 4,
              marginHorizontal: isShortScreen ? 16 : 20,
              marginBottom: isShortScreen ? 2 : 4,
              gap: controlsRowGap,
            },
          ]}
        >
          <SmoothControlButton
            style={[
              styles.roundIconButton,
              playerIconBtnStyle,
            ]}
            onPress={onToggleShuffle}
          >
              <MaterialCommunityIcons
                name="shuffle-variant"
              size={shuffleRepeatIconSize}
              color={playerIsShuffled ? selectedControlIconColor : sideControlIconColor}
            />
          </SmoothControlButton>

          <SmoothControlButton
            style={[styles.prevNextButton, prevNextBtnSizeStyle]}
            accessibilityLabel="Previous track"
            accessibilityRole="button"
            onPress={() => {
              onSkip("prev");
            }}
          >
            <MaterialCommunityIcons name="skip-previous" size={prevNextIconSize} color={activeControlIconColor} />
          </SmoothControlButton>

          <PlayerPlayButton
            buttonSize={playButtonSize}
            iconSize={playIconSize}
            active={playbackActive}
            onAccentColor="#060A0F"
            onPress={onTogglePlay}
          />

          <SmoothControlButton
            style={[styles.prevNextButton, prevNextBtnSizeStyle]}
            accessibilityLabel="Next track"
            accessibilityRole="button"
            onPress={() => {
              onSkip("next");
            }}
          >
            <MaterialCommunityIcons name="skip-next" size={prevNextIconSize} color={activeControlIconColor} />
          </SmoothControlButton>

          <SmoothControlButton
            style={[
              styles.roundIconButton,
              playerIconBtnStyle,
            ]}
            onPress={onToggleRepeat}
          >
            <MaterialCommunityIcons
              name={playerRepeatMode === "one" ? "repeat-once" : "repeat"}
              size={shuffleRepeatIconSize}
              color={playerRepeatMode !== "off" ? selectedControlIconColor : sideControlIconColor}
            />
          </SmoothControlButton>
        </View>
      </View>
    </View>
  );
});

PlayerControlsSection.displayName = "PlayerControlsSection";

const LivePlayerProgress = React.memo(function LivePlayerProgress(
  props: Omit<React.ComponentProps<typeof PlayerSpotifyProgress>, "progressRatio" | "totalLengthMs">
) {
  const { progress, duration } = usePlaybackProgressStore();
  return <PlayerSpotifyProgress {...props} progressRatio={progress} totalLengthMs={duration} />;
});
