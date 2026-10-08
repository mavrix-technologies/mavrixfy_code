import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { getSettings } from "@/lib/storage";
import { detectMatchingPreset,EQUALIZER_PRESETS,type EqualizerPreset } from "../constants/settingsConstants";
import { previewEqualizer, saveEqualizer, equalizerSupported, type EqualizerSettings } from "@/services/audio/audioEqualizer";
import { EQ_FREQUENCIES_HZ, EQ_MAX_GAIN_DB, FLAT_EQUALIZER, normalizeEqualizer } from "@/services/audio/equalizerConfig";
import { safeGoBack } from "@/utils/navigation";
import { isRunningInExpoGo } from "expo";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  GestureResponderEvent,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

const EQUALIZER_BANDS = [
  { key: "60Hz", label: "60 Hz", hz: 60 }, { key: "150Hz", label: "150 Hz", hz: 150 },
  { key: "400Hz", label: "400 Hz", hz: 400 }, { key: "1KHz", label: "1 kHz", hz: 1000 },
  { key: "2.4KHz", label: "2.4 kHz", hz: 2400 }, { key: "15KHz", label: "15 kHz", hz: 15000 },
];
const GRAPH_HEIGHT = 220;
const PAD_TOP = 28;
const PAD_BOTTOM = 28;
const USABLE_HEIGHT = GRAPH_HEIGHT - PAD_TOP - PAD_BOTTOM;
const MIN_DB = -EQ_MAX_GAIN_DB;
const MAX_DB = EQ_MAX_GAIN_DB;
const DB_RANGE = MAX_DB - MIN_DB;

interface EqualizerTopBarProps {
  equalizerReady: boolean;
  onReset: () => void;
}

function EqualizerTopBar({ equalizerReady, onReset }: EqualizerTopBarProps) {
  return (
    <View style={styles.topBar}>
      <Pressable onPress={safeGoBack} style={styles.backBtn} hitSlop={14}>
        <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
      </Pressable>
      <Text style={styles.headerTitle}>Equalizer</Text>
      <Pressable onPress={onReset} disabled={!equalizerReady} style={styles.resetBtn} hitSlop={14}>
        <Text style={styles.resetBtnText}>Reset</Text>
      </Pressable>
    </View>
  );
}

interface EqualizerGraphSectionProps {
  equalizerReady: boolean;
  enabled: boolean;
  activeBandIdx: number | null;
  points: { key: string; x: number; y: number; db: number }[];
  padX: number;
  graphWidth: number;
  fillPath: string | null;
  linePath: string | null;
  onLayoutGraph: (e: LayoutChangeEvent) => void;
  handleTouchStart: (e: GestureResponderEvent) => void;
  handleTouchMove: (e: GestureResponderEvent) => void;
  handleTouchEnd: () => void;
}

function EqualizerGraphSection({
  equalizerReady,
  enabled,
  activeBandIdx,
  points,
  padX,
  graphWidth,
  fillPath,
  linePath,
  onLayoutGraph,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
}: EqualizerGraphSectionProps) {
  return (
    <View
      style={styles.graphContainer}
      onLayout={onLayoutGraph}
      onStartShouldSetResponder={() => equalizerReady}
      onStartShouldSetResponderCapture={() => equalizerReady}
      onMoveShouldSetResponder={() => equalizerReady}
      onMoveShouldSetResponderCapture={() => equalizerReady}
      onResponderGrant={handleTouchStart}
      onResponderMove={handleTouchMove}
      onResponderRelease={handleTouchEnd}
      onResponderTerminate={handleTouchEnd}
    >
      <Svg width="100%" height={GRAPH_HEIGHT} style={styles.svg}>
        <Defs>
          <LinearGradient id="spotifyEqFill" x1="0" y1="0" x2="0" y2="1">
            <Stop
              offset="0%"
              stopColor={Colors.primary}
              stopOpacity={enabled ? 0.6 : 0.08}
            />
            <Stop
              offset="100%"
              stopColor={Colors.primary}
              stopOpacity={0}
            />
          </LinearGradient>
        </Defs>

        {/* Subtle horizontal 0 dB reference line */}
        <Line
          x1={padX}
          y1={PAD_TOP + 0.5 * USABLE_HEIGHT}
          x2={padX + graphWidth}
          y2={PAD_TOP + 0.5 * USABLE_HEIGHT}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={1}
        />

        {/* Subtle vertical grid lines behind each frequency */}
        {points.map((pt) => (
          <Line
            key={`grid-${pt.key}`}
            x1={pt.x}
            y1={PAD_TOP - 6}
            x2={pt.x}
            y2={GRAPH_HEIGHT - PAD_BOTTOM + 6}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={1}
          />
        ))}

        {/* Gradient fill under the line */}
        {fillPath ? <Path d={fillPath} fill="url(#spotifyEqFill)" /> : null}

        {/* Spotify Green Connected Line */}
        {linePath ? (
          <Path
            d={linePath}
            stroke={enabled ? Colors.primary : "rgba(255, 255, 255, 0.25)"}
            strokeWidth={3.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />
        ) : null}

        {/* 6 White Circular Draggable Handles */}
        {points.map((pt, idx) => {
          const isSelectedNode = activeBandIdx === idx;
          return (
            <React.Fragment key={`node-group-${pt.key}`}>
              {isSelectedNode && (
                <Circle
                  cx={pt.x}
                  cy={pt.y}
                  r={14}
                  fill={Colors.primary}
                  opacity={0.3}
                />
              )}
              <Circle
                cx={pt.x}
                cy={pt.y}
                r={isSelectedNode ? 8 : 7}
                fill="#FFFFFF"
                opacity={enabled ? 1 : 0.4}
              />
            </React.Fragment>
          );
        })}
      </Svg>

      {/* Frequency labels directly under nodes */}
      <View style={styles.frequencyRow} pointerEvents="none">
        {points.map((pt, idx) => (
          <Text
            key={`freq-${pt.key}`}
            style={[
              styles.freqLabel,
              {
                position: "absolute",
                left: pt.x - 26,
                width: 52,
                textAlign: "center",
              },
            ]}
          >
            {EQUALIZER_BANDS[idx].label}
          </Text>
        ))}
      </View>
    </View>
  );
}

interface EqualizerControlsSectionProps {
  enabled: boolean;
  equalizerReady: boolean;
  effectsError: string | null;
  activePresetId: string | null;
  onToggle: (newVal: boolean) => void;
  onSelectPreset: (preset: EqualizerPreset) => void;
}

function EqualizerControlsSection({
  enabled,
  equalizerReady,
  effectsError,
  activePresetId,
  onToggle,
  onSelectPreset,
}: EqualizerControlsSectionProps) {
  return (
    <>
      <View style={styles.togglesContainer}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Equalizer</Text>
          <Switch
            value={enabled}
            onValueChange={onToggle}
            disabled={!equalizerReady && !enabled}
            trackColor={{ false: "#3E3E3E", true: Colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
        {(!equalizerReady || effectsError) && (
          <Text style={styles.switchSublabel}>
            {effectsError ?? (isRunningInExpoGo() ? "Equalizer requires an installed development build. Expo Go does not include the native audio engine." : "Audio engine is starting.")}
          </Text>
        )}
      </View>

      <View style={styles.presetsList}>
        {EQUALIZER_PRESETS.map((preset) => {
          const isSelected = enabled && activePresetId === preset.id;
          return (
            <Pressable
              key={preset.id}
              onPress={() => onSelectPreset(preset)}
              disabled={!equalizerReady}
              style={({ pressed }) => [
                styles.presetRow,
                pressed && styles.presetRowPressed,
              ]}
            >
              <Text
                style={[
                  styles.presetName,
                  isSelected && styles.presetNameSelected,
                ]}
              >
                {preset.name}
              </Text>
              {isSelected && (
                <Ionicons name="checkmark" size={20} color={Colors.primary} />
              )}
            </Pressable>
          );
        })}
      </View>

    </>
  );
}

function useEqualizerState() {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const containerWidth = measuredWidth ?? windowWidth;
  const [settings, setSettings] = useState<EqualizerSettings | null>(null);
  const current = useRef<EqualizerSettings>({ equalizer: { ...FLAT_EQUALIZER }, equalizerEnabled: false });
  const [isDragging, setIsDragging] = useState(false);
  const [activeBandIdx, setActiveBandIdx] = useState<number | null>(null);
  const activeBandIndexRef = useRef<number | null>(null);
  const equalizerReady = settings !== null;
  const effectsError = equalizerSupported() ? null : "Presets are saved. To hear the equalizer, use an installed APK or IPA; Expo Go does not include the audio processor.";
  useEffect(() => {
    let mounted = true;
    void getSettings().then(saved => { if (mounted) {
      const initial = { equalizer: saved.equalizer, equalizerEnabled: saved.equalizerEnabled };
      current.current = initial; setSettings(initial);
    } })
      .catch(() => Alert.alert("Settings unavailable", "Please reopen the equalizer."));
    return () => { mounted = false; };
  }, []);
  const update = useCallback((next: EqualizerSettings, persist: boolean) => {
    current.current = next;
    setSettings(next);
    if (persist) void saveEqualizer(next).catch(() => Alert.alert("Settings not saved", "Please try again."));
    else previewEqualizer(next);
  }, []);
  const bands = useMemo(() => Object.fromEntries(EQUALIZER_BANDS.map(band => {
    const hz = EQ_FREQUENCIES_HZ.reduce((nearest, value) => Math.abs(Math.log(band.hz / value)) < Math.abs(Math.log(band.hz / nearest)) ? value : nearest);
    return [band.key, settings?.equalizer[`${hz}Hz`] ?? 0];
  })), [settings]);
  const enabled = Boolean(settings?.equalizerEnabled);
  const activePresetId = settings ? detectMatchingPreset(settings.equalizer) : null;
  const handleToggle = useCallback((enabled: boolean) => update({ ...current.current, equalizerEnabled: enabled }, true), [update]);
  const handleSelectPreset = useCallback((preset: EqualizerPreset) => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    update({ equalizer: { ...preset.bands }, equalizerEnabled: true }, true);
  }, [update]);
  const handleResetToFlat = useCallback(() => update({ equalizer: { ...FLAT_EQUALIZER }, equalizerEnabled: true }, true), [update]);
  const onLayoutGraph = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      setMeasuredWidth(w);
    }
  }, []);

  // Compute graph geometry
  const padX = 32;
  const graphWidth = Math.max(200, containerWidth - padX * 2);

  const points = useMemo(() => {
    return EQUALIZER_BANDS.map((band, idx) => {
      const x = padX + (idx / (EQUALIZER_BANDS.length - 1)) * graphWidth;
      const db = enabled ? bands[band.key] ?? 0 : 0;
      const ratio = (MAX_DB - db) / DB_RANGE;
      const y = PAD_TOP + ratio * USABLE_HEIGHT;
      return { x, y, db, key: band.key };
    });
  }, [bands, enabled, graphWidth, padX]);

  // Connected direct line and polygon gradient fill
  const { linePath, fillPath } = useMemo(() => {
    if (points.length < 2) return { linePath: "", fillPath: "" };

    let lPath = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      lPath += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
    }

    const last = points[points.length - 1];
    const fPath = `${lPath} L ${last.x.toFixed(1)} ${GRAPH_HEIGHT} L ${points[0].x.toFixed(1)} ${GRAPH_HEIGHT} Z`;

    return { linePath: lPath, fillPath: fPath };
  }, [points]);


  // Keep the original six-handle graph; a manual curve maps to the shared 15-band DSP.
  const dragBands = useRef<Record<string, number>>({});
  const changeAt = useCallback((idx: number, y: number) => {
    const ratio = 1 - (Math.max(PAD_TOP, Math.min(GRAPH_HEIGHT - PAD_BOTTOM, y)) - PAD_TOP) / USABLE_HEIGHT;
    const db = Math.max(MIN_DB, Math.min(MAX_DB, Math.round(ratio * DB_RANGE + MIN_DB)));
    dragBands.current = { ...dragBands.current, [EQUALIZER_BANDS[idx].key]: db };
    update({ equalizer: normalizeEqualizer(dragBands.current), equalizerEnabled: true }, false);
  }, [update]);
  const handleTouchStart = useCallback((evt: GestureResponderEvent) => {
    if (!equalizerReady) return;
    const { locationX, locationY } = evt.nativeEvent;
    let closest = 0;
    points.forEach((pt, idx) => { if (Math.abs(pt.x - locationX) < Math.abs(points[closest].x - locationX)) closest = idx; });
    dragBands.current = { ...bands };
    activeBandIndexRef.current = closest;
    setActiveBandIdx(closest); setIsDragging(true); changeAt(closest, locationY);
  }, [bands, changeAt, equalizerReady, points]);
  const handleTouchMove = useCallback((evt: GestureResponderEvent) => {
    const idx = activeBandIndexRef.current;
    if (idx !== null) changeAt(idx, evt.nativeEvent.locationY);
  }, [changeAt]);
  const handleTouchEnd = useCallback(() => {
    if (activeBandIndexRef.current === null) return;
    activeBandIndexRef.current = null;
    setIsDragging(false); setActiveBandIdx(null); update(current.current, true);
  }, [update]);
  return { equalizerReady, enabled, activeBandIdx, points, padX, graphWidth, fillPath, linePath,
    effectsError, activePresetId, isDragging, handleToggle, handleSelectPreset, handleResetToFlat,
    onLayoutGraph, handleTouchStart, handleTouchMove, handleTouchEnd };
}

export function EqualizerScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 16 : insets.top;
  const bottomInset = Platform.OS === "web" ? 20 : insets.bottom;

  const eq = useEqualizerState();

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <EqualizerTopBar
        equalizerReady={eq.equalizerReady}
        onReset={eq.handleResetToFlat}
      />

      <ScrollView
        style={styles.scrollView}
        scrollEnabled={!eq.isDragging}
        contentContainerStyle={[
          styles.scrollBody,
          { paddingBottom: Math.max(bottomInset, 20) + 36 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <EqualizerGraphSection
          equalizerReady={eq.equalizerReady}
          enabled={eq.enabled}
          activeBandIdx={eq.activeBandIdx}
          points={eq.points}
          padX={eq.padX}
          graphWidth={eq.graphWidth}
          fillPath={eq.fillPath}
          linePath={eq.linePath}
          onLayoutGraph={eq.onLayoutGraph}
          handleTouchStart={eq.handleTouchStart}
          handleTouchMove={eq.handleTouchMove}
          handleTouchEnd={eq.handleTouchEnd}
        />

        <EqualizerControlsSection
          enabled={eq.enabled}
          equalizerReady={eq.equalizerReady}
          effectsError={eq.effectsError}
          activePresetId={eq.activePresetId}
          onToggle={eq.handleToggle}
          onSelectPreset={eq.handleSelectPreset}
        />
      </ScrollView>
    </View>
  );
}

export default EqualizerScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 44,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  resetBtn: {
    width: 44,
    height: 36,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  resetBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollBody: {
    paddingTop: 8,
  },
  graphContainer: {
    height: GRAPH_HEIGHT + 34,
    backgroundColor: Colors.background,
    position: "relative",
    marginBottom: 8,
  },
  svg: {
    overflow: "visible",
  },
  frequencyRow: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    height: 20,
  },
  freqLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.65)",
  },
  togglesContainer: {
    marginTop: 4,
    marginBottom: 6,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  switchLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  switchSublabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.55)",
    marginTop: 2,
  },
  presetsList: {
    marginTop: 4,
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  presetRowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  presetName: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#FFFFFF",
  },
  presetNameSelected: {
    color: Colors.primary,
    fontFamily: "Inter_600SemiBold",
  },
});
