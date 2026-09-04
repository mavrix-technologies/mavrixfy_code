import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { Song } from "@/lib/musicData";
import { unescapeHtml } from "@/utils/stringUtils";
import { PingPongScroll } from "@/components/PingPongScroll";
import {
  SmoothControlButton,
  PlayerPlayButton,
  PlayerSpotifyProgress,
} from "./PlayerControlComponents";
import { styles } from "../styles/playerScreenStyles";

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
  progress: number;
  totalLengthMs: number;
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
  progress,
  totalLengthMs,
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
          <SmoothControlButton
            style={[styles.songDetailActionButton, songDetailActionBtnStyle]}
            onPress={onToggleLike}
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={songDetailIconSize + 2}
              color={liked ? selectedControlIconColor : "#FFFFFF"}
            />
          </SmoothControlButton>
        </View>
      </View>

      <View style={styles.playerActionStack}>
        <PlayerSpotifyProgress
          key={screenSong.id}
          progressRatio={progress}
          totalLengthMs={totalLengthMs}
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
            <Ionicons
              name="shuffle"
              size={shuffleRepeatIconSize}
              color={playerIsShuffled ? selectedControlIconColor : sideControlIconColor}
            />
          </SmoothControlButton>

          <SmoothControlButton
            style={[styles.prevNextButton, prevNextBtnSizeStyle]}
            onPressIn={() => {
              onSkip("prev");
            }}
          >
            <Ionicons name="play-skip-back" size={prevNextIconSize} color={activeControlIconColor} />
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
            onPressIn={() => {
              onSkip("next");
            }}
          >
            <Ionicons name="play-skip-forward" size={prevNextIconSize} color={activeControlIconColor} />
          </SmoothControlButton>

          <SmoothControlButton
            style={[
              styles.roundIconButton,
              playerIconBtnStyle,
            ]}
            onPress={onToggleRepeat}
          >
            <Ionicons
              name="repeat"
              size={shuffleRepeatIconSize}
              color={playerRepeatMode !== "off" ? selectedControlIconColor : sideControlIconColor}
            />
            {playerRepeatMode === "one" && (
              <Text style={[styles.repeatOneBadge, { color: selectedControlIconColor }]}>1</Text>
            )}
          </SmoothControlButton>
        </View>
      </View>
    </View>
  );
});

PlayerControlsSection.displayName = "PlayerControlsSection";
