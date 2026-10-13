import React, { memo, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { BatteryState, useBatteryLevel, useBatteryState } from "expo-battery";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAppIsActive } from "@/lib/appActivity";
import { PingPongScroll } from "@/components/PingPongScroll";
import { PlayerSlider } from "@/components/PlayerSlider";
import { formatDuration, type Song } from "@/lib/musicData";
import { getPlaybackProgressSnapshot, subscribePlaybackProgress } from "@/services/audio/playbackProgressStore";
import { unescapeHtml } from "@/utils/stringUtils";
import { getStandByLayout, STANDBY_CONTROL_SIZE, STANDBY_MIN_CONTROLS_WIDTH } from "./standByLayout";
import type { StandByStyle } from "../hooks/useStandByMode";
import { StandByAmbientBackdrop } from "./StandByAmbientBackdrop";
import { StandByActions, type StandByPanel } from "./StandByActions";
import { StandBySidePanel } from "./StandBySidePanel";

export interface StandByOverlayProps {
  visible: boolean;
  song: Song | null;
  accentColor?: string;
  backgroundColor?: string;
  liked: boolean;
  queue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  isShuffled: boolean;
  repeatMode: "off" | "all" | "one";
  standByStyle: StandByStyle;
  controlsDimmed: boolean;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrev: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onSeek: (progressRatio: number) => void;
  onSelectStyle: (style: StandByStyle) => void;
  onToggleLike: () => void;
  onPlayQueueSong: (song: Song) => void;
  onExitStandBy?: () => void;
  onTouchActivity: () => void;
}

export const StandByOverlay = memo(function StandByOverlay({
  visible,
  song,
  accentColor = "#E4E4E7",
  backgroundColor = "#243B55",
  liked,
  queue,
  queueIndex,
  isPlaying,
  isShuffled,
  repeatMode,
  standByStyle,
  controlsDimmed,
  onTogglePlay,
  onSkipNext,
  onSkipPrev,
  onToggleShuffle,
  onToggleRepeat,
  onSeek,
  onSelectStyle,
  onToggleLike,
  onPlayQueueSong,
  onExitStandBy,
  onTouchActivity,
}: StandByOverlayProps) {
  const { width, height, fontScale } = useWindowDimensions();
  const [viewport, setViewport] = useState({ width, height });
  const measureViewport = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = nativeEvent.layout;
    if (nextWidth <= 0 || nextHeight <= 0) return;
    setViewport(previous => previous.width === nextWidth && previous.height === nextHeight
      ? previous : { width: nextWidth, height: nextHeight });
  }, []);
  const isNightMode = standByStyle === "night";
  const isAmbient = standByStyle === "ambient";
  const shouldDim = controlsDimmed && !isAmbient;
  // Measure inside native safe-area padding: window dimensions can lag rotation.
  const layout = getStandByLayout(viewport.width, viewport.height, fontScale, { top: 0, right: 0, bottom: 0, left: 0 });
  // Until the native preference is known, use a static transition.
  const [reduceMotion, setReduceMotion] = useState(true);
  const [panel, setPanel] = useState<StandByPanel | null>(null);
  const controlsOpacity = shouldDim ? 0.55 : 1;
  const backToControls = useCallback(() => {
    onTouchActivity();
    setPanel(null);
  }, [onTouchActivity]);

  useEffect(() => {
    if (!visible) setPanel(null);
  }, [visible]);

  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      preferenceChanged = true;
      if (mounted) setReduceMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && !preferenceChanged) setReduceMotion(enabled);
    }).catch(() => {});
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  if (!visible) return null;

  const primaryColor = isNightMode ? "#FF3B30" : "#FFFFFF";
  const secondaryColor = isNightMode ? "rgba(255, 59, 48, 0.72)" : "rgba(255, 255, 255, 0.65)";
  const inactiveColor = isNightMode ? "rgba(255, 59, 48, 0.45)" : "rgba(255, 255, 255, 0.45)";
  const selectedColor = isNightMode ? primaryColor : accentColor;
  const title = unescapeHtml(song?.title || "No track playing");
  const artist = unescapeHtml(song?.artist || "Unknown Artist");
  const titleStyle = [styles.trackTitle, layout.compact && styles.compactTrackTitle, { color: primaryColor }];
  const artistStyle = [styles.trackArtist, layout.compact && styles.compactTrackArtist, { color: secondaryColor }];
  const pingPongFade = (() => {
    if (isNightMode || !isAmbient) return "rgba(0, 0, 0, 0.98)";
    if (backgroundColor && backgroundColor.startsWith("#")) {
      const hex = backgroundColor.slice(1);
      const r = parseInt(hex.substring(0, 2), 16) || 20;
      const g = parseInt(hex.substring(2, 4), 16) || 24;
      const b = parseInt(hex.substring(4, 6), 16) || 34;
      return `rgba(${r}, ${g}, ${b}, 0.95)`;
    }
    return "rgba(20, 24, 34, 0.95)";
  })();
  const runAction = (action: () => void) => {
    onTouchActivity();
    action();
  };
  const nextStyle = standByStyle === "classic" ? "night" : standByStyle === "night" ? "ambient" : "classic";
  const styleName = standByStyle === "classic" ? "Classic" : standByStyle === "night" ? "Night" : "Ambient";
  const compactControls = layout.compact || layout.controlsWidth < STANDBY_CONTROL_SIZE * 4 + 64;
  const artworkSize = Math.max(0, layout.artworkSize - 24);
  const verticalSpacing = { gap: Math.max(10, Math.min(28, Math.round(layout.contentHeight / 20))) };
  const controlButtonStyle = [styles.controlButton, compactControls && styles.compactControl];

  const controlRows = (
    <View style={[styles.controlRows, compactControls && styles.compactRows]}>
      <View testID="standby-playback-controls" style={[styles.controls, { opacity: controlsOpacity }]}>
        <Pressable onPress={() => runAction(onToggleShuffle)} style={controlButtonStyle} accessibilityRole="button" accessibilityLabel="Shuffle" accessibilityState={{ selected: isShuffled }}>
          <Ionicons name="shuffle" size={24} color={isShuffled ? selectedColor : inactiveColor} />
        </Pressable>
        <Pressable onPress={() => runAction(onSkipPrev)} style={[...controlButtonStyle, styles.flexControl]} accessibilityRole="button" accessibilityLabel="Previous track">
          <Ionicons name="play-skip-back" size={30} color={primaryColor} />
        </Pressable>
        <View style={[styles.playSlot, compactControls && styles.compactPlaySlot]}>
          <Pressable
            onPress={() => runAction(onTogglePlay)}
            style={({ pressed }) => [styles.playButton, compactControls && styles.compactPlayButton, { backgroundColor: primaryColor }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
          >
            <Ionicons name={isPlaying ? "pause" : "play"} size={30} color="#000000" />
          </Pressable>
        </View>
        <Pressable onPress={() => runAction(onSkipNext)} style={[...controlButtonStyle, styles.flexControl]} accessibilityRole="button" accessibilityLabel="Next track">
          <Ionicons name="play-skip-forward" size={30} color={primaryColor} />
        </Pressable>
        <Pressable onPress={() => runAction(onToggleRepeat)} style={controlButtonStyle} accessibilityRole="button" accessibilityLabel={`Repeat: ${repeatMode}`} accessibilityState={{ selected: repeatMode !== "off" }}>
          <Ionicons name="repeat" size={24} color={repeatMode !== "off" ? selectedColor : inactiveColor} />
          {repeatMode === "one" && <Text accessible={false} style={[styles.repeatBadge, { color: selectedColor }]}>1</Text>}
        </Pressable>
      </View>
      <View style={{ opacity: controlsOpacity }}>
        <StandByActions compact={layout.compact} primaryColor={primaryColor} secondaryColor={secondaryColor} onSelectPanel={setPanel} onTouchActivity={onTouchActivity} />
      </View>
    </View>
  );

  // Keep transport visible; short or enlarged-text windows
  // scroll the whole pane, where all controls cannot physically fit together.
  const scrollAll = layout.contentHeight < 300 || fontScale > 1.4;
  const trackDetails = (
    <View style={[styles.trackDetails, verticalSpacing]}>
      <View style={[styles.header, { opacity: controlsOpacity }]}>
        <StandByClock active={visible} compact={layout.compact} primaryColor={primaryColor} secondaryColor={secondaryColor} />
        <View style={styles.headerActions}>
          <Pressable onPress={() => runAction(() => onSelectStyle(nextStyle))} style={styles.headerButton} accessibilityRole="button" accessibilityLabel={`StandBy style: ${styleName}`} accessibilityHint={`Switch to ${nextStyle === "classic" ? "Classic" : nextStyle === "night" ? "Night" : "Ambient"}`} accessibilityValue={{ text: styleName }}>
            <Ionicons name={isAmbient ? "color-palette-outline" : isNightMode ? "moon" : "moon-outline"} size={22} color={primaryColor} />
          </Pressable>
          {onExitStandBy && (
            <Pressable onPress={() => runAction(onExitStandBy)} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Exit StandBy">
              <Ionicons name="close" size={24} color={primaryColor} />
            </Pressable>
          )}
        </View>
      </View>

      <View testID="standby-track-info" style={styles.trackInfo}>
        <View style={styles.trackText} accessible accessibilityLabel={`${title}, ${artist}`}>
          <PingPongScroll
            text={title}
            style={titleStyle}
            velocity={14}
            paused={reduceMotion}
            showFade
            fadeColor={pingPongFade}
            fadeWidth={layout.compact ? 14 : 18}
            startDelay={1500}
            endDelay={1200}
          />
          <PingPongScroll
            text={artist}
            style={artistStyle}
            velocity={11}
            paused={reduceMotion}
            showFade
            fadeColor={pingPongFade}
            fadeWidth={layout.compact ? 14 : 18}
            startDelay={2000}
            endDelay={1200}
          />
        </View>
        <Pressable onPress={() => runAction(onToggleLike)} style={styles.saveButton} accessibilityRole="button" accessibilityLabel={liked ? "Remove from liked songs" : "Save to liked songs"} accessibilityState={{ selected: liked }}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={22} color={liked ? selectedColor : primaryColor} />
        </Pressable>
      </View>
    </View>
  );
  const transport = (
    <View testID="standby-transport" style={[styles.transport, verticalSpacing]}>
      <StandByProgress active={visible} songDuration={song?.duration ?? 0} color={secondaryColor} onSeek={onSeek} onTouchActivity={onTouchActivity} />

      {layout.controlsWidth < STANDBY_MIN_CONTROLS_WIDTH ? (
        <ScrollView horizontal style={styles.narrowControls} contentContainerStyle={{ width: STANDBY_MIN_CONTROLS_WIDTH }} showsHorizontalScrollIndicator={false} bounces={false}>
          {controlRows}
        </ScrollView>
      ) : controlRows}
    </View>
  );

  return (
    <Modal visible presentationStyle="fullScreen" animationType="fade"
      supportedOrientations={["portrait", "landscape-left", "landscape-right"]}
      onRequestClose={panel === null ? onExitStandBy : backToControls}>
    <SafeAreaProvider style={styles.surface}>
    <GestureHandlerRootView style={styles.surface}>
    <SafeAreaView
      testID="standby-overlay"
      pointerEvents={visible ? "auto" : "none"}
      accessibilityViewIsModal={visible}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "yes" : "no-hide-descendants"}
      onAccessibilityEscape={panel === null ? onExitStandBy : backToControls}
      onTouchStart={onTouchActivity}
      style={[styles.surface, { backgroundColor: isAmbient ? backgroundColor : "#000000" }]}
    >
      {visible && isAmbient && song && <StandByAmbientBackdrop key={song.id} song={song} accentColor={accentColor} backgroundColor={backgroundColor} reduceMotion={reduceMotion} />}
      <View onLayout={measureViewport} testID="standby-viewport" style={[
        styles.root,
        {
          paddingLeft: layout.paddingLeft,
          paddingRight: layout.paddingRight,
          paddingTop: layout.paddingTop,
          paddingBottom: layout.paddingBottom,
          gap: layout.gap,
        },
      ]}
    >
      {layout.showArtwork && (
        <View testID="standby-artwork" collapsable={false} style={[styles.artworkColumn, { width: layout.artworkColumnWidth }]}>
          <View collapsable={false} style={[styles.artworkCard, { width: artworkSize, height: artworkSize }]}>
          {song?.coverUrl ? (
            <Image source={{ uri: song.coverUrl }} style={{ width: artworkSize, height: artworkSize }} contentFit="contain" transition={0} accessible={false} />
          ) : (
            <View style={styles.artworkFallback}>
              <Ionicons name="musical-notes" size={Math.min(layout.artworkColumnWidth, layout.contentHeight) * 0.35} color={secondaryColor} />
            </View>
          )}
          {isNightMode && <View pointerEvents="none" style={styles.artworkNightOverlay} />}
          </View>
          <View style={styles.brand} accessible accessibilityLabel="Mavrixfy Music">
            <Text numberOfLines={1} style={[styles.brandLabel, { color: secondaryColor }]}>MAVRIXFY MUSIC</Text>
          </View>
        </View>
      )}

      <View testID="standby-content" style={styles.contentSection}>
        {panel === null ? (
          <View style={[styles.playerPane, verticalSpacing]}>
            {scrollAll ? (
              <ScrollView style={styles.panelScroll} contentContainerStyle={[styles.content, verticalSpacing]} showsVerticalScrollIndicator={false} bounces={false}>
                {trackDetails}
                {transport}
              </ScrollView>
            ) : (
              <>
                <ScrollView testID="standby-metadata-scroll" style={styles.metadataScroll} contentContainerStyle={styles.metadataContent} showsVerticalScrollIndicator={false} bounces={false}>
                  {trackDetails}
                </ScrollView>
                {transport}
              </>
            )}
          </View>
        ) : (
          <View style={styles.detailPane}>
            <View style={styles.detailHeader}>
              <Pressable onPress={backToControls} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to player controls">
                <Ionicons name="chevron-back" size={22} color={primaryColor} />
                <Text style={[styles.backLabel, { color: primaryColor }]}>Back</Text>
              </Pressable>
              <Text accessibilityRole="header" style={[styles.paneTitle, { color: primaryColor }]}>{panel === "queue" ? "Queue" : "Lyrics"}</Text>
            </View>
            {visible && song && <StandBySidePanel panel={panel} song={song} queue={queue} queueIndex={queueIndex} primaryColor={primaryColor} secondaryColor={secondaryColor} reduceMotion={reduceMotion} onPlayQueueSong={onPlayQueueSong} onSeek={onSeek} onTouchActivity={onTouchActivity} />}
          </View>
        )}
      </View>
      </View>
    </SafeAreaView>
    </GestureHandlerRootView>
    </SafeAreaProvider>
    </Modal>
  );
});

const subscribeInactive = () => () => {};

/** Playback ticks update only the slider and timestamps, never artwork or the clock. */
const StandByProgress = memo(function StandByProgress({ active, songDuration, color, onSeek, onTouchActivity }: {
  active: boolean;
  songDuration: number;
  color: string;
  onSeek: (ratio: number) => void;
  onTouchActivity: () => void;
}) {
  const foreground = useAppIsActive();
  const { positionMillis, duration } = useSyncExternalStore(
    active && foreground ? subscribePlaybackProgress : subscribeInactive,
    getPlaybackProgressSnapshot,
    getPlaybackProgressSnapshot
  );
  const durationSeconds = Number.isFinite(duration) && duration > 0 ? duration / 1000 : Number.isFinite(songDuration) && songDuration > 0 ? songDuration : 0;
  const positionSeconds = Number.isFinite(positionMillis) ? Math.max(0, positionMillis / 1000) : 0;
  const value = durationSeconds > 0 ? Math.min(positionSeconds, durationSeconds) : positionSeconds;
  const handleSeek = useCallback((seconds: number) => {
    if (!active || !foreground) return;
    onTouchActivity();
    if (durationSeconds > 0 && Number.isFinite(seconds)) onSeek(Math.max(0, Math.min(1, seconds / durationSeconds)));
  }, [active, durationSeconds, foreground, onSeek, onTouchActivity]);

  return (
    <View testID="standby-progress" style={styles.progress}>
      <PlayerSlider
        value={durationSeconds > 0 ? value : 0}
        minimumValue={0}
        maximumValue={durationSeconds || 1}
        disabled={!active || !foreground || durationSeconds <= 0}
        onSlidingStart={onTouchActivity}
        onValueChange={onTouchActivity}
        onSlidingComplete={handleSeek}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={durationSeconds > 0 ? { min: 0, max: durationSeconds, now: value, text: `${formatDuration(Math.floor(value))} of ${formatDuration(Math.floor(durationSeconds))}` } : { text: "Duration unavailable" }}
      />
      <View pointerEvents="none" style={styles.timeRow}>
        <Text style={[styles.timeText, { color }]}>{formatDuration(Math.floor(value))}</Text>
        <Text style={[styles.timeText, { color }]}>{durationSeconds > 0 ? `-${formatDuration(Math.ceil(Math.max(0, durationSeconds - value)))}` : "--:--"}</Text>
      </View>
    </View>
  );
});

/** Align each tick to a minute boundary and suspend timers while hidden or backgrounded. */
const StandByClock = memo(function StandByClock({ active, compact, primaryColor, secondaryColor }: {
  active: boolean;
  compact: boolean;
  primaryColor: string;
  secondaryColor: string;
}) {
  const foreground = useAppIsActive();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active || !foreground) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    tick();
    return () => clearTimeout(timer);
  }, [active, foreground]);

  return (
    <View style={styles.clock}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.clockTime, compact && styles.compactClockTime, { color: primaryColor }]}>
        {`${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, "0")} ${now.getHours() >= 12 ? "PM" : "AM"}`}
      </Text>
      <View style={styles.dateRow}>
        <Text numberOfLines={1} style={[styles.clockDate, compact && styles.compactClockDate, { color: secondaryColor }]}>
          {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}
        </Text>
        {active && foreground && <StandByBattery color={secondaryColor} />}
      </View>
    </View>
  );
});

const StandByBattery = memo(function StandByBattery({ color }: { color: string }) {
  const level = useBatteryLevel();
  const state = useBatteryState();
  if (!Number.isFinite(level) || level < 0 || level > 1) return null;
  const percentage = Math.round(level * 100);
  const charging = state === BatteryState.CHARGING;
  return (
    <View style={styles.battery} accessible accessibilityLabel={`Battery ${percentage}%${charging ? ", charging" : ""}`}>
      <Ionicons name={charging ? "battery-charging-outline" : level <= 0.2 ? "battery-dead-outline" : level >= 0.95 ? "battery-full-outline" : "battery-half-outline"} size={18} color={color} />
      <Text numberOfLines={1} style={[styles.batteryText, { color }]}>{percentage}%</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  surface: { ...StyleSheet.absoluteFillObject, overflow: "hidden", zIndex: 9999 },
  root: { flex: 1, flexDirection: "row", alignItems: "stretch", overflow: "hidden" },
  artworkColumn: { alignItems: "center", justifyContent: "center" },
  artworkCard: { borderRadius: 20, overflow: "hidden", backgroundColor: "#0E1016" },
  artworkFallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#181A20" },
  artworkNightOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255, 59, 48, 0.28)" },
  contentSection: { flex: 1, minWidth: 0, overflow: "hidden" },
  playerPane: { flex: 1, minHeight: 0, justifyContent: "center", gap: 12 },
  panelScroll: { flex: 1, minHeight: 0 },
  metadataScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  metadataContent: { flexGrow: 0 },
  trackDetails: { gap: 12 },
  brand: { height: 16, marginTop: 8, maxWidth: "100%", alignItems: "center", justifyContent: "center" },
  brandLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2, textAlign: "center", opacity: 0.65 },
  transport: { flexShrink: 0, gap: 12 },
  content: { flexGrow: 1, justifyContent: "center", gap: 12 },
  detailPane: { flex: 1, minHeight: 0, paddingHorizontal: 8 },
  detailHeader: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  backButton: { minWidth: 48, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 4 },
  backLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  paneTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 8 },
  clock: { flex: 1, minWidth: 100 },
  clockTime: { fontSize: 44, lineHeight: 48, fontFamily: "Inter_700Bold", letterSpacing: -1.2, fontVariant: ["tabular-nums"] },
  compactClockTime: { fontSize: 32, lineHeight: 36 },
  dateRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 4 },
  clockDate: { fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 1.0 },
  compactClockDate: { fontSize: 11 },
  battery: { flexDirection: "row", alignItems: "center", gap: 5 },
  batteryText: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
  headerActions: { flexDirection: "row", flexWrap: "wrap", maxWidth: "100%", alignItems: "center", gap: 4 },
  headerButton: { width: STANDBY_CONTROL_SIZE, height: STANDBY_CONTROL_SIZE, borderRadius: STANDBY_CONTROL_SIZE / 2, backgroundColor: "rgba(255, 255, 255, 0.1)", alignItems: "center", justifyContent: "center" },
  trackInfo: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 },
  trackText: { flex: 1, minWidth: 0, justifyContent: "center" },
  saveButton: { width: STANDBY_CONTROL_SIZE, height: STANDBY_CONTROL_SIZE, alignItems: "center", justifyContent: "center" },
  trackTitle: { fontSize: 26, lineHeight: 32, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  compactTrackTitle: { fontSize: 20, lineHeight: 26 },
  trackArtist: { fontSize: 16, lineHeight: 22, fontFamily: "Inter_500Medium", marginTop: 4 },
  compactTrackArtist: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  progress: { paddingHorizontal: 8 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: -16 },
  timeText: { fontSize: 12, lineHeight: 15, fontFamily: "Inter_500Medium", fontVariant: ["tabular-nums"] },
  controlRows: { gap: 8 },
  compactRows: { gap: 4 },
  controls: { flexDirection: "row", alignItems: "center" },
  controlButton: { width: STANDBY_CONTROL_SIZE, height: 64, alignItems: "center", justifyContent: "center" },
  compactControl: { height: 56 },
  flexControl: { flex: 1, minWidth: 48 },
  playSlot: { flex: 1, minWidth: 64, height: 64, alignItems: "center", justifyContent: "center" },
  compactPlaySlot: { minWidth: 56, height: 56 },
  narrowControls: { flexGrow: 0, flexShrink: 0 },
  playButton: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  compactPlayButton: { width: 56, height: 56, borderRadius: 28 },
  repeatBadge: { position: "absolute", top: 6, right: 8, fontSize: 10, fontFamily: "Inter_700Bold" },
  pressed: { opacity: 0.85 },
});
