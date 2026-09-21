import React, { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import ActionPlayButton from "./ActionPlayButton";
import ActionCircleButton from "./ActionCircleButton";

export interface CollectionHeroProps {
  iconName?: keyof typeof Ionicons.glyphMap;
  customIcon?: ReactNode;
  iconColor?: string;
  iconCardBackground?: string;
  iconCardBorderColor?: string;
  iconGradientColors?: readonly [string, string, ...string[]];
  showIconCard?: boolean;
  playButtonColor?: string;
  playButtonIconColor?: string;
  title: string;
  meta: string;
  isPlaying: boolean;
  isShuffled?: boolean;
  onPlayAll: () => void;
  onShufflePlay?: () => void;
  leftAction?: ReactNode;
  rightExtraAction?: ReactNode;
  playDisabled?: boolean;
}

export const CollectionHero: React.FC<CollectionHeroProps> = ({
  iconName = "musical-notes",
  customIcon,
  iconColor = "#26E19A",
  iconCardBackground = "rgba(38, 225, 154, 0.12)",
  iconCardBorderColor = "rgba(38, 225, 154, 0.25)",
  iconGradientColors,
  showIconCard = false,
  playButtonColor,
  playButtonIconColor,
  title,
  meta,
  isPlaying,
  isShuffled = false,
  onPlayAll,
  onShufflePlay,
  leftAction,
  rightExtraAction,
  playDisabled = false,
}) => {
  return (
    <View style={styles.container}>
      {/* Centered Hero Artwork / Icon */}
      <View style={styles.heroArtworkWrapper}>
        {showIconCard ? (
          iconGradientColors ? (
            <LinearGradient
              colors={iconGradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCard}
            >
              {customIcon ? customIcon : <Ionicons name={iconName} size={46} color={iconColor} />}
            </LinearGradient>
          ) : (
            <View
              style={[
                styles.iconCard,
                {
                  backgroundColor: iconCardBackground,
                  borderColor: iconCardBorderColor,
                },
              ]}
            >
              {customIcon ? customIcon : <Ionicons name={iconName} size={46} color={iconColor} />}
            </View>
          )
        ) : (
          <View style={styles.iconDirectWrapper}>
            {customIcon ? customIcon : <Ionicons name={iconName} size={54} color={iconColor} />}
          </View>
        )}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta.toUpperCase()}
        </Text>
      </View>

      {/* Signature Action Row */}
      <View style={styles.actionRow}>
        <View style={styles.leftSlot}>
          {leftAction}
        </View>

        <View style={styles.rightSlot}>
          {rightExtraAction}

          {onShufflePlay && (
            <ActionCircleButton
              iconName="shuffle"
              onPress={onShufflePlay}
              isActive={isShuffled}
              showActiveDot
              accessibilityLabel={isShuffled ? "Shuffle on" : "Shuffle off"}
            />
          )}

          <ActionPlayButton
            isPlaying={isPlaying}
            onPress={onPlayAll}
            disabled={playDisabled}
            color={playButtonColor}
            iconColor={playButtonIconColor}
            accessibilityLabel={isPlaying ? `Pause ${title}` : `Play ${title}`}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingTop: 10,
    paddingBottom: 8,
  },
  heroArtworkWrapper: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  iconDirectWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  iconCard: {
    width: 112,
    height: 112,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  meta: {
    color: "#8E99A8",
    fontSize: 11.5,
    letterSpacing: 1.1,
    fontFamily: "Inter_600SemiBold",
    marginTop: 6,
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 2,
    minHeight: 52,
  },
  leftSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  rightSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});

export default CollectionHero;
