import { useOptionalPlayerProgress } from "@/contexts/PlayerContext";
import { compactMap } from "@/lib/arrayUtils";
import { useLastMix } from "@/lib/lastMix";
import {
openMiniPlayerBannerLink,
type MiniPlayerBannerConfig,
} from "@/lib/miniPlayerBannerConfig";
import type { Song } from "@/lib/musicData";
import * as Animated from "@/lib/nativeAnimated";
import type { MiniPlayerSecondaryControl } from "@/lib/storage";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React,{ useCallback,useEffect,useMemo,useRef,useState } from "react";
import {
Pressable,
Text,
View
} from "react-native";
import { styles } from "./layoutStyles";
import { toProgressWidth } from "./layoutUtils";

export type MiniPlayerSecondaryControlButtonProps = {
  control: MiniPlayerSecondaryControl;
  size: number;
  radius: number;
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
  shellStyle?: object | object[];
  onQueue: () => void;
  onNext: () => void;
  onPrev: () => void;
  onMore: () => void;
};

export function MiniPlayerSecondaryControlButton({
  control,
  size,
  radius,
  backgroundColor,
  borderColor,
  iconColor,
  shellStyle,
  onQueue,
  onNext,
  onPrev,
  onMore,
}: MiniPlayerSecondaryControlButtonProps) {
  const buttonRef = useRef<View>(null);
  const action = (() => {
    switch (control) {
      case "next":
        return { icon: "play-skip-forward" as const, onPress: onNext, label: "Next track" };
      case "prev":
        return { icon: "play-skip-back" as const, onPress: onPrev, label: "Previous track" };
      case "more":
        return { icon: "ellipsis-horizontal" as const, onPress: onMore, label: "More options" };
      default:
        return { icon: "list" as const, onPress: onQueue, label: "Open queue" };
    }
  })();

  return (
    <View ref={buttonRef} collapsable={false}>
      <Pressable
        android_disableSound
        onPress={action.onPress}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        style={({ pressed }) => [
          shellStyle,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor,
            borderColor,
          },
          pressed && styles.miniButtonPressed,
        ]}
      >
        <Ionicons
          name={action.icon}
          size={control === "more" ? 18 : 20}
          color={iconColor}
        />
      </Pressable>
    </View>
  );
}

export const MiniPlayerProgressBar = React.memo(function MiniPlayerProgressBar({
  fillColor,
}: {
  fillColor: string;
}) {
  const playerProgress = useOptionalPlayerProgress();
  const progress = playerProgress?.progress ?? 0;
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- `progress` is the destructured reactive value from playerProgress.progress
  const progressWidth = useMemo(() => toProgressWidth(progress), [progress]);

  return (
    <View pointerEvents="none" style={styles.playerProgressTrack}>
      <View
        style={[
          styles.playerProgressFill,
          {
            width: progressWidth,
            backgroundColor: fillColor,
          },
        ]}
      />
    </View>
  );
});
MiniPlayerProgressBar.displayName = "MiniPlayerProgressBar";

export const MiniPlayerBannerView = React.memo(function MiniPlayerBannerView({
  config,
}: {
  config: MiniPlayerBannerConfig;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const items = config.items;
  const count = items.length;

  const [fadeAnim] = useState(() => new Animated.Value(1));

  const [slideAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (count <= 1) {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      return;
    }
    const intervalMs = Math.max(2500, (config.intervalSeconds || 4.5) * 1000);
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const cycleNext = () => {
      // Step 1: Smoothly fade and slide out upwards
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -6,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;
        // Step 2: Advance index and reset position to bottom offset
        setCurrentIndex((prev) => (prev + 1) % count);
        slideAnim.setValue(6);

        // Step 3: Smoothly fade and slide in from bottom
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start(() => {
          timerId = setTimeout(cycleNext, intervalMs);
        });
      });
    };

    timerId = setTimeout(cycleNext, intervalMs);

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [count, config.intervalSeconds, fadeAnim, slideAnim]);

  const activeItem = items[currentIndex % (count || 1)];
  if (!activeItem) return null;

  return (
    <Pressable
      android_disableSound
      onPress={() => {
        void openMiniPlayerBannerLink(activeItem.linkUrl);
      }}
      style={({ pressed }) => [
        styles.miniBannerRow,
        pressed && styles.miniBannerRowPressed,
      ]}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={`Banner: ${activeItem.text}`}
    >
      <Animated.View
        style={[
          styles.miniBannerContent,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <Ionicons
          name={(activeItem.iconName as any) || "paper-plane"}
          size={12.5}
          color={activeItem.iconColor || "#38BDF8"}
          style={styles.miniBannerIcon}
        />
        <Text
          style={[
            styles.miniBannerText,
            activeItem.textColor ? { color: activeItem.textColor } : null,
          ]}
          numberOfLines={1}
        >
          {activeItem.text}
        </Text>
      </Animated.View>

      {count > 1 ? (
        <View style={styles.miniBannerDots}>
          {items.map((item, idx) => (
            <View
              key={`${item.linkUrl}-${item.text}`}
              style={[
                styles.miniBannerDot,
                idx === (currentIndex % count) && styles.miniBannerDotActive,
              ]}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
});
MiniPlayerBannerView.displayName = "MiniPlayerBannerView";

export const IOSMiniPlayerProgressBar = React.memo(function IOSMiniPlayerProgressBar({
  fillColor,
}: {
  fillColor: string;
}) {
  const playerProgress = useOptionalPlayerProgress();
  const progress = playerProgress?.progress ?? 0;
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- `progress` is the destructured reactive value from playerProgress.progress
  const progressWidth = useMemo(() => toProgressWidth(progress), [progress]);

  return (
    <View pointerEvents="none" style={styles.iosMiniPlayerProgressTrack}>
      <View
        style={[
          styles.iosMiniPlayerProgressFill,
          { width: progressWidth, backgroundColor: fillColor },
        ]}
      />
    </View>
  );
});
IOSMiniPlayerProgressBar.displayName = "IOSMiniPlayerProgressBar";

export interface IOSMiniPlayerMixBadgeProps {
  activeSongId: string;
  queue: Song[];
  isPlaying: boolean;
  onPress?: () => void;
}

export const IOSMiniPlayerMixBadge = React.memo(function IOSMiniPlayerMixBadge({
  activeSongId,
  queue,
  isPlaying,
  onPress,
}: IOSMiniPlayerMixBadgeProps) {
  const { push: overlayRouterPush } = useRouter();
  const lastMix = useLastMix();
  const [mixBarOne] = useState(() => new Animated.Value(0.32));
  const [mixBarTwo] = useState(() => new Animated.Value(0.58));
  const [mixBarThree] = useState(() => new Animated.Value(0.44));

  const mixImage = useMemo(() => {
    const first = compactMap((lastMix?.images ?? "").split(","), (value) => value.trim())[0];
    return first ?? "";
  }, [lastMix?.images]);

  const mixImages = useMemo(() => {
    return compactMap((lastMix?.images ?? "").split(","), (value) => value.trim());
  }, [lastMix?.images]);

  const mixSongIds = useMemo(() => {
    const raw = lastMix?.songIds ?? "";
    if (!raw) return [] as string[];
    return compactMap(raw.split(","), (id) => id.trim());
  }, [lastMix?.songIds]);

  const isPlayingFromLastMix = useMemo(() => {
    if (!isPlaying || !activeSongId || mixSongIds.length === 0) return false;
    if (!mixSongIds.includes(activeSongId)) return false;
    if (queue.length !== mixSongIds.length) return false;
    const mixSet = new Set(mixSongIds);
    return queue.every((song) => mixSet.has(song.id));
  }, [activeSongId, isPlaying, mixSongIds, queue]);

  useEffect(() => {
    const resetBars = () => {
      Animated.parallel([
        Animated.timing(mixBarOne, { toValue: 0.32, duration: 180, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarTwo, { toValue: 0.58, duration: 180, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarThree, { toValue: 0.44, duration: 180, useNativeDriver: true, isInteraction: false }),
      ]).start();
    };

    if (!lastMix || !isPlayingFromLastMix) {
      resetBars();
      return;
    }

    const loopOne = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarOne, { toValue: 0.96, duration: 230, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarOne, { toValue: 0.24, duration: 280, useNativeDriver: true, isInteraction: false }),
      ])
    );
    const loopTwo = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarTwo, { toValue: 0.84, duration: 180, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarTwo, { toValue: 0.3, duration: 240, useNativeDriver: true, isInteraction: false }),
      ])
    );
    const loopThree = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarThree, { toValue: 0.9, duration: 260, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarThree, { toValue: 0.22, duration: 210, useNativeDriver: true, isInteraction: false }),
      ])
    );

    loopOne.start();
    loopTwo.start();
    loopThree.start();

    return () => {
      loopOne.stop();
      loopTwo.stop();
      loopThree.stop();
    };
  }, [isPlayingFromLastMix, lastMix, mixBarOne, mixBarThree, mixBarTwo]);

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
    } else if (lastMix) {
      overlayRouterPush({ pathname: "/artist-mix", params: lastMix });
    }
  }, [lastMix, onPress, overlayRouterPush]);

  if (!lastMix) return null;

  return (
    <Pressable
      android_disableSound
      onPress={handlePress}
      hitSlop={8}
      style={styles.iosMiniPlayerInlineMixBtn}
    >
      <View style={styles.iosMiniPlayerMixCard}>
        {mixImages.length > 1 ? (
          <View style={styles.iosMiniPlayerMixGrid}>
            {mixImages.slice(0, 4).map((img) => (
              <View key={img} style={styles.iosMiniPlayerMixGridCell}>
                {img ? (
                  <Image
                    source={{ uri: img }}
                    style={styles.iosMiniPlayerMixGridImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View style={[styles.iosMiniPlayerMixGridImage, styles.iosMiniPlayerMixGridFallback]}>
                    <Ionicons name="person" size={8} color="rgba(255,255,255,0.88)" />
                  </View>
                )}
              </View>
            ))}
            {mixImages.length > 4 && (
              <View style={[styles.iosMiniPlayerMixGridCell, styles.iosMiniPlayerMixGridMore]}>
                <Text style={styles.iosMiniPlayerMixGridMoreText}>+{mixImages.length - 4}</Text>
              </View>
            )}
          </View>
        ) : mixImage ? (
          <Image
            source={{ uri: mixImage }}
            style={[styles.iosMiniPlayerMixFullImage, styles.iosMiniPlayerMixFullImageMuted]}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={[
              styles.iosMiniPlayerMixFullImage,
              styles.iosMiniPlayerMixHeroFallback,
              styles.iosMiniPlayerMixFullImageMuted,
            ]}
          >
            <Ionicons name="person" size={14} color="rgba(255,255,255,0.88)" />
          </View>
        )}
        <View style={styles.iosMiniPlayerMixEqOverlay}>
          <Animated.View
            style={[
              styles.iosMiniPlayerMixEqBar,
              { opacity: isPlayingFromLastMix ? 0.95 : 0.42, transform: [{ scaleY: mixBarOne }] },
            ]}
          />
          <Animated.View
            style={[
              styles.iosMiniPlayerMixEqBar,
              { opacity: isPlayingFromLastMix ? 0.95 : 0.42, transform: [{ scaleY: mixBarTwo }] },
            ]}
          />
          <Animated.View
            style={[
              styles.iosMiniPlayerMixEqBar,
              { opacity: isPlayingFromLastMix ? 0.95 : 0.42, transform: [{ scaleY: mixBarThree }] },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
});
IOSMiniPlayerMixBadge.displayName = "IOSMiniPlayerMixBadge";
