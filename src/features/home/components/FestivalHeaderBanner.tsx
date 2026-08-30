import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";
import { type FestivalThemeConfig } from "@/services/festivalThemeService";
import { FestiveSparklesParticleOverlay } from "./FestiveSparklesParticleOverlay";

interface FestivalHeaderBannerProps {
  themeConfig?: FestivalThemeConfig;
  onPress?: () => void;
}

export const FestivalHeaderBanner = React.memo(function FestivalHeaderBanner({
  themeConfig,
  onPress,
}: FestivalHeaderBannerProps) {
  const router = useRouter();

  if (!themeConfig || !themeConfig.enabled) {
    return null;
  }

  const subTitle = themeConfig?.subTitle?.trim() || "";
  const mainTitle = themeConfig?.mainTitle?.trim() || "";
  const badgeText = themeConfig?.badgeText?.trim() || "";
  const targetQuery = themeConfig?.targetQuery?.trim() || mainTitle;

  const hasAnyText = subTitle.length > 0 || mainTitle.length > 0 || badgeText.length > 0;

  const handlePress = () => {
    if (!targetQuery) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress();
    } else {
      router.push({
        pathname: "/(tabs)/search",
        params: { q: targetQuery },
      });
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={mainTitle ? `${mainTitle} Special Music` : "Festival Special Music"}
      onPress={handlePress}
      style={[
        styles.bannerContainer,
        !hasAnyText && styles.bannerContainerImageOnly,
      ]}
    >
      {/* Animated Sparkling Particles */}
      {themeConfig?.enableSparkles !== false && (
        <FestiveSparklesParticleOverlay />
      )}

      {hasAnyText && (
        <View style={styles.textCenterWrapper}>
          {subTitle.length > 0 && (
            <Text allowFontScaling={false} style={styles.subTitle}>
              {subTitle}
            </Text>
          )}

          {mainTitle.length > 0 && (
            <Text allowFontScaling={false} style={styles.mainTitle}>
              {mainTitle}
            </Text>
          )}

          {badgeText.length > 0 && (
            <Text allowFontScaling={false} style={styles.dateBadge}>
              {badgeText}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bannerContainer: {
    width: "100%",
    minHeight: 270,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    paddingTop: 44,
    paddingBottom: 72,
    paddingHorizontal: 20,
  },
  bannerContainerImageOnly: {
    minHeight: 240,
    paddingVertical: 36,
  },
  textCenterWrapper: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  subTitle: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 4.5,
    paddingLeft: 4.5,
    color: "#C5E6DA",
    opacity: 0.92,
    textAlign: "center",
    alignSelf: "center",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  mainTitle: {
    width: "100%",
    fontSize: 29,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#FFFDF2",
    textAlign: "center",
    alignSelf: "center",
    lineHeight: 35,
    textShadowColor: "rgba(0, 0, 0, 0.45)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  dateBadge: {
    marginTop: 8,
    fontSize: 9.5,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#FDE6A6",
    letterSpacing: 2,
    paddingLeft: 2,
    opacity: 0.95,
    textAlign: "center",
    alignSelf: "center",
    textTransform: "uppercase",
  },
});

export default FestivalHeaderBanner;
