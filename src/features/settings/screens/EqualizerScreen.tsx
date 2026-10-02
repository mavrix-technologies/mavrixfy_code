import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { getSettings, saveSettings, type AppSettings } from "@/lib/storage";
import { detectMatchingPreset,EQUALIZER_BANDS as EQUALIZER_BAND_KEYS,EQUALIZER_PRESETS,type EqualizerPreset } from "../constants/settingsConstants";
import {
  applyEqualizerBands,
  applyEqualizerEnabled,
  checkSystemEqualizerAvailable,
  getAudioEffects,
  syncEqualizerWithNative,
  type AudioEffectsState,
  openDeviceSystemEqualizer,
} from "@/services/audio/audioEqualizer";
import { safeGoBack } from "@/utils/navigation";
import { isRunningInExpoGo } from "expo";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import { useFocusEffect } from "expo-router";
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

const EQUALIZER_BANDS = EQUALIZER_BAND_KEYS.map((key) => ({
  key,
  label: key.endsWith("KHz") ? key.replace("KHz", " kHz") : key.replace("Hz", " Hz"),
}));

const GRAPH_HEIGHT = 220;
const PAD_TOP = 28;
const PAD_BOTTOM = 28;
const USABLE_HEIGHT = GRAPH_HEIGHT - PAD_TOP - PAD_BOTTOM;
const MIN_DB = -10;
const MAX_DB = 10;
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
  systemEqAvailable: boolean;
  onToggle: (newVal: boolean) => void;
  onSelectPreset: (preset: EqualizerPreset) => void;
}

function EqualizerControlsSection({
  enabled,
  equalizerReady,
  effectsError,
  activePresetId,
  systemEqAvailable,
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

      {systemEqAvailable && (
        <View style={styles.systemEqSection}>
          <Pressable
            onPress={() => {
              void triggerImpact(ImpactFeedbackStyle.Medium);
              void openDeviceSystemEqualizer();
            }}
            style={({ pressed }) => [
              styles.systemEqButton,
              pressed && styles.presetRowPressed,
            ]}
          >
            <View style={styles.systemEqInfo}>
              <View style={styles.switchTitleWithIcon}>
                <Ionicons name="hardware-chip-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.systemEqTitle}>Device Equalizer</Text>
              </View>
              <Text style={styles.systemEqSubtitle}>
                Open device audio effect controls, if available
              </Text>
            </View>
            <Ionicons name="open-outline" size={20} color={Colors.primary} />
          </Pressable>
        </View>
      )}
    </>
  );
}

function useEqualizerState() {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const containerWidth = measuredWidth ?? windowWidth;
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeBandIdx, setActiveBandIdx] = useState<number | null>(null);
  const [systemEqAvailable, setSystemEqAvailable] = useState(false);
  const [effectsState, setEffectsState] = useState<AudioEffectsState | null>(null);
  const [effectsError, setEffectsError] = useState<string | null>(null);
  const syncedSessionRef = useRef("");
  const equalizerReady = Boolean(effectsState?.sessionId && effectsState.equalizerAvailable && effectsState.equalizerControl !== false);

  const reportEffectError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : "The audio effect could not be applied.";
    setEffectsError(message);
    Alert.alert("Audio effect unavailable", message);
  }, []);

  const bands = useMemo<Record<string, number>>(() => {
    const raw = settings?.equalizer || {};
    return {
      "60Hz": typeof raw["60Hz"] === "number" ? raw["60Hz"] : 0,
      "150Hz": typeof raw["150Hz"] === "number" ? raw["150Hz"] : 0,
      "400Hz": typeof raw["400Hz"] === "number" ? raw["400Hz"] : 0,
      "1KHz": typeof raw["1KHz"] === "number" ? raw["1KHz"] : 0,
      "2.4KHz": typeof raw["2.4KHz"] === "number" ? raw["2.4KHz"] : 0,
      "15KHz": typeof raw["15KHz"] === "number" ? raw["15KHz"] : 0,
    };
  }, [settings?.equalizer]);

  const activeBandIndexRef = useRef<number | null>(null);
  const bandsRef = useRef(bands);

  useEffect(() => {
    bandsRef.current = bands;
  }, [bands]);

  useEffect(() => {
    let mounted = true;
    void getSettings().then((s) => {
      if (mounted) setSettings(s);
    });
    void checkSystemEqualizerAvailable().then((avail) => {
      if (mounted) setSystemEqAvailable(avail);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const refresh = () => {
      void getAudioEffects().then((state) => {
        if (!active) return;
        setEffectsState(state);
        setEffectsError(null);
        if (!state.sessionId && attempts < 5) {
          attempts++;
          timer = setTimeout(refresh, 1000);
        }
      }).catch((error) => {
        if (!active) return;
        setEffectsState(null);
        setEffectsError(error instanceof Error ? error.message : "Audio effects are unavailable.");
      });
    };
    refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []));

  useEffect(() => {
    if (!settings || !effectsState?.sessionId || !effectsState.equalizerAvailable) return;
    const syncKey = `${effectsState.sessionId}:${effectsState.equalizerAvailable}`;
    if (syncedSessionRef.current === syncKey) return;
    syncedSessionRef.current = syncKey;
    void syncEqualizerWithNative(settings);
  }, [settings, effectsState?.sessionId, effectsState?.equalizerAvailable]);

  const enabled = Boolean(settings?.equalizerEnabled);
  const activePresetId = useMemo(() => detectMatchingPreset(bands), [bands]);

  const handleToggle = useCallback(
    async (newVal: boolean) => {
      if (!newVal && !equalizerReady) {
        setSettings((prev) => prev ? { ...prev, equalizerEnabled: false } : prev);
        void saveSettings({ equalizerEnabled: false });
        return;
      }
      if (!equalizerReady) return;
      void triggerImpact(ImpactFeedbackStyle.Light);
      try {
        await applyEqualizerEnabled(newVal);
      } catch (error) {
        reportEffectError(error);
        return;
      }
      setSettings((prev) => (prev ? { ...prev, equalizerEnabled: newVal } : prev));
      void saveSettings({ equalizerEnabled: newVal });
    },
    [equalizerReady, reportEffectError]
  );

  const handleSelectPreset = useCallback(async (preset: EqualizerPreset) => {
    if (!equalizerReady) return;
    void triggerImpact(ImpactFeedbackStyle.Light);
    const newBands = { ...preset.bands };
    try {
      await applyEqualizerBands(newBands);
      await applyEqualizerEnabled(true);
    } catch (error) {
      reportEffectError(error);
      return;
    }
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            equalizer: newBands,
            equalizerEnabled: true,
          }
        : prev
    );
    void saveSettings({
      equalizer: newBands,
      equalizerEnabled: true,
    });
  }, [equalizerReady, reportEffectError]);

  const handleResetToFlat = useCallback(async () => {
    if (!equalizerReady) return;
    void triggerImpact(ImpactFeedbackStyle.Light);
    const flatPreset = EQUALIZER_PRESETS.find((p) => p.id === "flat");
    const flatBands = flatPreset
      ? { ...flatPreset.bands }
      : { "60Hz": 0, "150Hz": 0, "400Hz": 0, "1KHz": 0, "2.4KHz": 0, "15KHz": 0 };

    try {
      await applyEqualizerBands(flatBands);
    } catch (error) {
      reportEffectError(error);
      return;
    }

    setSettings((prev) =>
      prev
        ? {
            ...prev,
            equalizer: flatBands,
          }
        : prev
    );
    void saveSettings({
      equalizer: flatBands,
    });
  }, [equalizerReady, reportEffectError]);

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

  // Touch and drag handling using Gesture Responder System
  const handleTouchStart = useCallback(
    (evt: GestureResponderEvent) => {
      const { locationX, locationY } = evt.nativeEvent;

      let closestIdx = 0;
      let minDistance = Infinity;
      points.forEach((pt, idx) => {
        const dist = Math.abs(pt.x - locationX);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      activeBandIndexRef.current = closestIdx;
      setActiveBandIdx(closestIdx);
      setIsDragging(true);

      const clampedY = Math.max(PAD_TOP, Math.min(GRAPH_HEIGHT - PAD_BOTTOM, locationY));
      const ratio = 1 - (clampedY - PAD_TOP) / USABLE_HEIGHT;
      const targetDb = Math.max(MIN_DB, Math.min(MAX_DB, Math.round(ratio * DB_RANGE + MIN_DB)));

      const bandKey = EQUALIZER_BANDS[closestIdx].key;
      const updated = { ...bandsRef.current, [bandKey]: targetDb };
      bandsRef.current = updated;

      setSettings((prev) =>
        prev ? { ...prev, equalizer: updated, equalizerEnabled: true } : prev
      );
      void applyEqualizerBands(updated).then(() => applyEqualizerEnabled(true)).catch(reportEffectError);
    },
    [points, reportEffectError]
  );

  const handleTouchMove = useCallback(
    (evt: GestureResponderEvent) => {
      const idx = activeBandIndexRef.current;
      if (idx === null || idx < 0 || idx >= EQUALIZER_BANDS.length) return;

      const { locationY } = evt.nativeEvent;
      const clampedY = Math.max(PAD_TOP, Math.min(GRAPH_HEIGHT - PAD_BOTTOM, locationY));
      const ratio = 1 - (clampedY - PAD_TOP) / USABLE_HEIGHT;
      const targetDb = Math.max(MIN_DB, Math.min(MAX_DB, Math.round(ratio * DB_RANGE + MIN_DB)));

      const bandKey = EQUALIZER_BANDS[idx].key;
      if (bandsRef.current[bandKey] !== targetDb) {
        if (targetDb === 0) {
          void triggerImpact(ImpactFeedbackStyle.Light);
        }
        const updated = { ...bandsRef.current, [bandKey]: targetDb };
        bandsRef.current = updated;
        setSettings((prev) =>
          prev ? { ...prev, equalizer: updated, equalizerEnabled: true } : prev
        );
        void applyEqualizerBands(updated).catch(reportEffectError);
      }
    },
    [reportEffectError]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    setActiveBandIdx(null);
    activeBandIndexRef.current = null;
    const currentBands = bandsRef.current;
    void saveSettings({
      equalizer: currentBands,
      equalizerEnabled: true,
    });
    void applyEqualizerBands(currentBands).catch(reportEffectError);
  }, [reportEffectError]);

  return {
    equalizerReady,
    enabled,
    activeBandIdx,
    points,
    padX,
    graphWidth,
    fillPath,
    linePath,
    effectsError,
    activePresetId,
    systemEqAvailable,
    isDragging,
    handleToggle,
    handleSelectPreset,
    handleResetToFlat,
    onLayoutGraph,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
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
          systemEqAvailable={eq.systemEqAvailable}
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
  switchTitleWithIcon: {
    flexDirection: "row",
    alignItems: "center",
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
  systemEqSection: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.12)",
  },
  systemEqButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  systemEqInfo: {
    flex: 1,
    marginRight: 16,
  },
  systemEqTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  systemEqSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 2,
  },
});
