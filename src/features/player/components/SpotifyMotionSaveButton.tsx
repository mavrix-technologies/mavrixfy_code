import { Ionicons,MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React,{ useEffect,useRef } from "react";
import {
Platform,
Pressable,
StyleSheet,
type StyleProp,
type ViewStyle,
} from "react-native";
import Animated,{
interpolate,
useAnimatedStyle,
useSharedValue,
withSpring,
withTiming,
} from "react-native-reanimated";

import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";

export interface SpotifyMotionSaveButtonProps {
  liked: boolean;
  onToggleLike: () => void;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  activeColor?: string;
  inactiveColor?: string;
  accessibilityLabel?: string;
}

const SPRING_CONFIG = {
  damping: 12,
  stiffness: 240,
  mass: 0.5,
};

export const SpotifyMotionSaveButton = React.memo(
  function SpotifyMotionSaveButton({
    liked,
    onToggleLike,
    iconSize = 26,
    style,
    activeColor = Colors.primary || "#1ED760",
    inactiveColor = "#FFFFFF",
    accessibilityLabel,
  }: SpotifyMotionSaveButtonProps) {
    const isFirstRender = useRef(true);

    // Shared values for physics-driven motion
    const likedProgress = useSharedValue(liked ? 1 : 0);
    const pressScale = useSharedValue(1);
    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(0);

    useEffect(() => {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        likedProgress.value = liked ? 1 : 0;
        return;
      }

      if (liked) {
        // Give the filled heart a light spring when a song is saved.
        likedProgress.value = withSpring(1, SPRING_CONFIG);

        // Tactile celebratory pulse ripple
        pulseScale.value = 0.8;
        pulseOpacity.value = 0.55;
        pulseScale.value = withTiming(1.65, { duration: 340 });
        pulseOpacity.value = withTiming(0, { duration: 340 });
      } else {
        // Return smoothly to the outline heart when a song is unsaved.
        likedProgress.value = withSpring(0, SPRING_CONFIG);
        pulseOpacity.value = 0;
      }
    }, [liked, likedProgress, pulseOpacity, pulseScale]);

    const handlePressIn = () => {
      pressScale.value = withTiming(0.85, { duration: 70 });
    };

    const handlePressOut = () => {
      pressScale.value = withSpring(1, { damping: 12, stiffness: 260 });
    };

    const handlePress = () => {
      if (Platform.OS !== "web") {
        void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      }
      onToggleLike();
    };

    // Animated container: handles press scale and bounce
    const containerAnimatedStyle = useAnimatedStyle(() => {
      return {
        transform: [{ scale: pressScale.value }],
      };
    });

    // Crossfade between add and liked states.
    const addIconStyle = useAnimatedStyle(() => {
      const opacity = interpolate(likedProgress.value, [0, 0.45, 1], [1, 0, 0]);
      const scale = interpolate(likedProgress.value, [0, 1], [1, 0.55]);
      return {
        opacity,
        transform: [{ scale }],
      };
    });

    const likedHeartStyle = useAnimatedStyle(() => {
      const opacity = interpolate(likedProgress.value, [0, 0.55, 1], [0, 0, 1]);
      const scale = interpolate(likedProgress.value, [0, 1], [0.55, 1]);
      return {
        opacity,
        transform: [{ scale }],
      };
    });

    // Pulse ripple ring animation
    const pulseRingStyle = useAnimatedStyle(() => {
      return {
        opacity: pulseOpacity.value,
        transform: [{ scale: pulseScale.value }],
      };
    });

    const ringSize = iconSize + 6;

    return (
      <Pressable
        android_disableSound
        accessibilityRole="button"
        accessibilityLabel={
          accessibilityLabel ??
          (liked ? "Remove from Liked Songs" : "Add to Liked Songs")
        }
        accessibilityState={{ selected: liked }}
        hitSlop={8}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={[styles.buttonBase, style]}
      >
        <Animated.View style={[styles.contentWrap, containerAnimatedStyle]}>
          {/* Subtle pulse ring confirms the save action. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulseRing,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                borderColor: activeColor,
              },
              pulseRingStyle,
            ]}
          />

          {/* Add to Liked Songs */}
          <Animated.View style={[styles.iconLayer, addIconStyle]}>
            <Ionicons
              name="add"
              size={iconSize}
              color={inactiveColor}
            />
          </Animated.View>

          {/* Liked */}
          <Animated.View style={[styles.iconLayer, likedHeartStyle]}>
            <MaterialCommunityIcons
              name="heart"
              size={iconSize}
              color={activeColor}
            />
          </Animated.View>
        </Animated.View>
      </Pressable>
    );
  }
);

SpotifyMotionSaveButton.displayName = "SpotifyMotionSaveButton";

const styles = StyleSheet.create({
  buttonBase: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  contentWrap: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  iconLayer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    borderWidth: 2,
  },
});
