import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { getSettings, saveSettings, type AppSettings } from "@/lib/storage";
import {
  applyEqualizerBands,
  applyEqualizerEnabled,
  applySurroundSoundEnabled,
  applySurroundStrength,
  checkSystemEqualizerAvailable,
  getAudioEffects,
  openDeviceSystemEqualizer,
} from "@/services/audio/audioEqualizer";
import { safeGoBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  GestureResponderEvent,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
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

export interface EqualizerBand {
  key: string;
  label: string;
}

export const EQUALIZER_BANDS: EqualizerBand[] = [
  { key: "60Hz", label: "60 Hz" },
  { key: "150Hz", label: "150 Hz" },
  { key: "400Hz", label: "400 Hz" },
  { key: "1KHz", label: "1 kHz" },
  { key: "2.4KHz", label: "2.4 kHz" },
  { key: "15KHz", label: "15 kHz" },
];

export interface EqualizerPreset {
  id: string;
  name: string;
  bands: Record<string, number>;
}

export const EQUALIZER_PRESETS: EqualizerPreset[] = [
  { id: "flat", name: "Flat", bands: { "60Hz": 0, "150Hz": 0, "400Hz": 0, "1KHz": 0, "2.4KHz": 0, "15KHz": 0 } },
  { id: "acoustic", name: "Acoustic", bands: { "60Hz": 3, "150Hz": 2, "400Hz": 1, "1KHz": 1, "2.4KHz": 2, "15KHz": 2 } },
  { id: "bass_booster", name: "Bass Booster", bands: { "60Hz": 5, "150Hz": 3, "400Hz": 1, "1KHz": 0, "2.4KHz": 0, "15KHz": 0 } },
  { id: "bass_reducer", name: "Bass Reducer", bands: { "60Hz": -5, "150Hz": -3, "400Hz": -1, "1KHz": 0, "2.4KHz": 0, "15KHz": 0 } },
  { id: "classical", name: "Classical", bands: { "60Hz": 3, "150Hz": 2, "400Hz": -1, "1KHz": 1, "2.4KHz": 2, "15KHz": 2 } },
  { id: "dance", name: "Dance", bands: { "60Hz": 4, "150Hz": 3, "400Hz": 1, "1KHz": 0, "2.4KHz": 2, "15KHz": 3 } },
  { id: "deep", name: "Deep", bands: { "60Hz": 4, "150Hz": 2, "400Hz": 0, "1KHz": 1, "2.4KHz": 1, "15KHz": -2 } },
  { id: "electronic", name: "Electronic", bands: { "60Hz": 3, "150Hz": 2, "400Hz": -1, "1KHz": 1, "2.4KHz": 2, "15KHz": 3 } },
  { id: "hip_hop", name: "Hip-Hop", bands: { "60Hz": 4, "150Hz": 2, "400Hz": 0, "1KHz": 1, "2.4KHz": 2, "15KHz": 2 } },
  { id: "jazz", name: "Jazz", bands: { "60Hz": 2, "150Hz": 2, "400Hz": -1, "1KHz": 1, "2.4KHz": 2, "15KHz": 2 } },
  { id: "latin", name: "Latin", bands: { "60Hz": 3, "150Hz": 2, "400Hz": 0, "1KHz": -1, "2.4KHz": 2, "15KHz": 3 } },
  { id: "loudness", name: "Loudness", bands: { "60Hz": 4, "150Hz": 2, "400Hz": -1, "1KHz": 0, "2.4KHz": 1, "15KHz": 3 } },
  { id: "lounge", name: "Lounge", bands: { "60Hz": -2, "150Hz": 1, "400Hz": 2, "1KHz": 1, "2.4KHz": 0, "15KHz": -1 } },
  { id: "piano", name: "Piano", bands: { "60Hz": 2, "150Hz": 2, "400Hz": 0, "1KHz": 1, "2.4KHz": 2, "15KHz": 2 } },
  { id: "pop", name: "Pop", bands: { "60Hz": -1, "150Hz": 1, "400Hz": 2, "1KHz": 2, "2.4KHz": 1, "15KHz": -1 } },
  { id: "r_and_b", name: "R&B", bands: { "60Hz": 3, "150Hz": 3, "400Hz": -1, "1KHz": 1, "2.4KHz": 2, "15KHz": 3 } },
  { id: "rock", name: "Rock", bands: { "60Hz": 4, "150Hz": 2, "400Hz": -1, "1KHz": 1, "2.4KHz": 2, "15KHz": 3 } },
  { id: "small_speakers", name: "Small Speakers", bands: { "60Hz": 4, "150Hz": 3, "400Hz": 1, "1KHz": 1, "2.4KHz": 0, "15KHz": -1 } },
  { id: "spoken_word", name: "Spoken Word", bands: { "60Hz": -2, "150Hz": 0, "400Hz": 2, "1KHz": 3, "2.4KHz": 1, "15KHz": 0 } },
  { id: "treble_booster", name: "Treble Booster", bands: { "60Hz": 0, "150Hz": 0, "400Hz": 0, "1KHz": 1, "2.4KHz": 3, "15KHz": 5 } },
  { id: "treble_reducer", name: "Treble Reducer", bands: { "60Hz": 0, "150Hz": 0, "400Hz": 0, "1KHz": -1, "2.4KHz": -3, "15KHz": -5 } },
  { id: "vocal_booster", name: "Vocal Booster", bands: { "60Hz": -1, "150Hz": 1, "400Hz": 2, "1KHz": 3, "2.4KHz": 2, "15KHz": 1 } },
];

export function detectMatchingPreset(currentBands: Record<string, number>): string | null {
  for (const preset of EQUALIZER_PRESETS) {
    let match = true;
    for (const [key, val] of Object.entries(preset.bands)) {
      if ((currentBands[key] ?? 0) !== val) {
        match = false;
        break;
      }
    }
    if (match) return preset.id;
  }
  return null;
}

const GRAPH_HEIGHT = 220;
const PAD_TOP = 28;
const PAD_BOTTOM = 28;
const USABLE_HEIGHT = GRAPH_HEIGHT - PAD_TOP - PAD_BOTTOM;
const MIN_DB = -10;
const MAX_DB = 10;
const DB_RANGE = MAX_DB - MIN_DB;

export function EqualizerScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 16 : insets.top;
  const bottomInset = Platform.OS === "web" ? 20 : insets.bottom;

  const [containerWidth, setContainerWidth] = useState(
    Dimensions.get("window").width
  );
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeBandIdx, setActiveBandIdx] = useState<number | null>(null);
  const [systemEqAvailable, setSystemEqAvailable] = useState(false);
  const [headphonesConnected, setHeadphonesConnected] = useState(false);

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
    void getAudioEffects()
      .then((eff) => {
        if (mounted && eff) {
          setHeadphonesConnected(Boolean(eff.headphonesConnected));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const enabled = Boolean(settings?.equalizerEnabled);
  const activePresetId = useMemo(() => detectMatchingPreset(bands), [bands]);
  const surroundEnabled = Boolean(settings?.surroundSoundEnabled);

  const handleToggle = useCallback(
    (newVal: boolean) => {
      void triggerImpact(ImpactFeedbackStyle.Light);
      setSettings((prev) => (prev ? { ...prev, equalizerEnabled: newVal } : prev));
      void saveSettings({ equalizerEnabled: newVal });
      void applyEqualizerEnabled(newVal);
    },
    []
  );

  const handleToggleSurround = useCallback(
    (newVal: boolean) => {
      void triggerImpact(ImpactFeedbackStyle.Light);
      const targetStrength = 350;
      setSettings((prev) => (prev ? { ...prev, surroundSoundEnabled: newVal, surroundStrength: targetStrength } : prev));
      void saveSettings({ surroundSoundEnabled: newVal, surroundStrength: targetStrength });
      void applySurroundSoundEnabled(newVal);
      if (newVal) {
        void applySurroundStrength(targetStrength);
      }
    },
    []
  );

  const handleSelectPreset = useCallback((preset: EqualizerPreset) => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    const newBands = { ...preset.bands };
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
    void applyEqualizerBands(newBands);
    void applyEqualizerEnabled(true);
  }, []);

  const handleResetToFlat = useCallback(() => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    const flatPreset = EQUALIZER_PRESETS.find((p) => p.id === "flat");
    const flatBands = flatPreset
      ? { ...flatPreset.bands }
      : { "60Hz": 0, "150Hz": 0, "400Hz": 0, "1KHz": 0, "2.4KHz": 0, "15KHz": 0 };

    setSettings((prev) =>
      prev
        ? {
            ...prev,
            equalizer: flatBands,
            surroundSoundEnabled: false,
          }
        : prev
    );
    void saveSettings({
      equalizer: flatBands,
      surroundSoundEnabled: false,
    });
    void applyEqualizerBands(flatBands);
    void applySurroundSoundEnabled(false);
  }, []);

  const onLayoutGraph = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      setContainerWidth(w);
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

      setSettings((prev) =>
        prev ? { ...prev, equalizer: updated, equalizerEnabled: true } : prev
      );
      void applyEqualizerBands(updated);
      void applyEqualizerEnabled(true);
    },
    [points]
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
        setSettings((prev) =>
          prev ? { ...prev, equalizer: updated, equalizerEnabled: true } : prev
        );
        void applyEqualizerBands(updated);
      }
    },
    []
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
    void applyEqualizerBands(currentBands);
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      {/* ── Spotify Top Header with Reset Button ── */}
      <View style={styles.topBar}>
        <Pressable onPress={safeGoBack} style={styles.backBtn} hitSlop={14}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Equalizer</Text>
        <Pressable onPress={handleResetToFlat} style={styles.resetBtn} hitSlop={14}>
          <Text style={styles.resetBtnText}>Reset</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        scrollEnabled={!isDragging}
        contentContainerStyle={[
          styles.scrollBody,
          { paddingBottom: Math.max(bottomInset, 20) + 36 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Interactive Graph with Subtle Grid Lines ── */}
        <View
          style={styles.graphContainer}
          onLayout={onLayoutGraph}
          onStartShouldSetResponder={() => true}
          onStartShouldSetResponderCapture={() => true}
          onMoveShouldSetResponder={() => true}
          onMoveShouldSetResponderCapture={() => true}
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
            {points.map((pt, idx) => (
              <Line
                key={`grid-${idx}`}
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
                <React.Fragment key={`node-group-${idx}`}>
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
                key={`freq-${idx}`}
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

        {/* ── Toggles Section (Official Spotify Layout) ── */}
        <View style={styles.togglesContainer}>
          {/* Equalizer Switch */}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Equalizer</Text>
            <Switch
              value={enabled}
              onValueChange={handleToggle}
              trackColor={{ false: "#3E3E3E", true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* 3D Surround Sound Switch (Headphone Protected) */}
          <View style={styles.switchRow}>
            <View style={styles.switchLabelContainer}>
              <View style={styles.switchTitleWithIcon}>
                <Ionicons name="headset-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.switchLabel}>3D Surround Sound</Text>
              </View>
              <Text style={styles.switchSublabel}>
                {headphonesConnected
                  ? "Active on headphones • Wide immersive soundstage"
                  : "Optimized for headphones • Speaker audio protected"}
              </Text>
            </View>
            <Switch
              value={surroundEnabled}
              onValueChange={handleToggleSurround}
              trackColor={{ false: "#3E3E3E", true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* ── Clean Vertical Presets List (Official Spotify Style) ── */}
        <View style={styles.presetsList}>
          {EQUALIZER_PRESETS.map((preset) => {
            const isSelected = enabled && activePresetId === preset.id;
            return (
              <Pressable
                key={preset.id}
                onPress={() => handleSelectPreset(preset)}
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

        {/* ── System Equalizer (Official Android Dolby Atmos / Vivo DeepField) ── */}
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
                  <Text style={styles.systemEqTitle}>Device Equalizer & 3D Audio</Text>
                </View>
                <Text style={styles.systemEqSubtitle}>
                  Open phone's native Dolby Atmos & Vivo DeepField sound engine
                </Text>
              </View>
              <Ionicons name="open-outline" size={20} color={Colors.primary} />
            </Pressable>
          </View>
        )}
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
  switchLabelContainer: {
    flex: 1,
    marginRight: 16,
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
