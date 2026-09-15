import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Image as RNImage,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { type FestivalThemeConfig } from "@/services/festivalThemeService";

// Module-level aspect ratio cache to avoid recalculating on re-renders
const gBannerAspectRatioCache: Record<string, number> = {};

interface FestivalHeaderBannerProps {
  themeConfig?: FestivalThemeConfig;
}

export const FestivalHeaderBanner = React.memo(function FestivalHeaderBanner({
  themeConfig,
}: FestivalHeaderBannerProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const screenWidth = windowWidth || 390;
  const screenHeight = windowHeight || 844;

  const backgroundImageUrl = themeConfig?.backgroundImageUrl?.trim() || null;

  // Dynamic aspect ratio state: measures real image width & height for any ratio format
  const [aspectRatio, setAspectRatio] = useState<number>(() => {
    if (backgroundImageUrl && gBannerAspectRatioCache[backgroundImageUrl]) {
      return gBannerAspectRatioCache[backgroundImageUrl];
    }
    return 1080 / 850;
  });

  useEffect(() => {
    if (!backgroundImageUrl) return;

    if (gBannerAspectRatioCache[backgroundImageUrl]) {
      setAspectRatio(gBannerAspectRatioCache[backgroundImageUrl]);
      return;
    }

    // Measure native image dimensions dynamically
    RNImage.getSize(
      backgroundImageUrl,
      (width, height) => {
        if (width > 0 && height > 0) {
          const ratio = width / height;
          gBannerAspectRatioCache[backgroundImageUrl] = ratio;
          setAspectRatio(ratio);
        }
      },
      () => {
        // Fallback: onLoad on Image component will supply it
      }
    );
  }, [backgroundImageUrl]);

  if (!themeConfig || !themeConfig.enabled) {
    return null;
  }

  const subTitle = themeConfig?.subTitle?.trim() || "";
  const mainTitle = themeConfig?.mainTitle?.trim() || "";
  const badgeText = themeConfig?.badgeText?.trim() || "";
  const accentColor = themeConfig?.themeAccentColor || "#014D52";

  const hasImage = Boolean(backgroundImageUrl && backgroundImageUrl.length > 0);
  const hasAnyText = subTitle.length > 0 || mainTitle.length > 0 || badgeText.length > 0;

  // Don't render an empty banner if there's neither an image nor text
  if (!hasImage && !hasAnyText) {
    return null;
  }

  // Responsive banner height: exactly matches the image's aspect ratio (zero bottom gap, zero letterboxing)
  const effectiveRatio = aspectRatio > 0 ? aspectRatio : 1080 / 850;
  const rawHeight = Math.round(screenWidth / effectiveRatio);
  const maxHeight = Math.round(screenHeight * 0.72);
  const bannerHeight = Math.max(140, Math.min(rawHeight, maxHeight));

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={mainTitle ? `${mainTitle} Special Music Showcase` : "Festival Showcase"}
      style={[
        styles.seamlessHeroRoot,
        {
          width: screenWidth,
          height: bannerHeight,
          backgroundColor: accentColor,
        },
      ]}
    >
      {/* 1. Full-Width Edge-to-Edge Hero Image — Dynamically sized to exact image ratio */}
      {hasImage && (
        <Image
          source={{ uri: backgroundImageUrl! }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          contentPosition="center"
          priority="high"
          cachePolicy="memory-disk"
          transition={150}
          onLoad={(e) => {
            const { width, height } = e.source;
            if (width > 0 && height > 0) {
              const ratio = width / height;
              if (ratio !== aspectRatio) {
                if (backgroundImageUrl) {
                  gBannerAspectRatioCache[backgroundImageUrl] = ratio;
                }
                setAspectRatio(ratio);
              }
            }
          }}
        />
      )}

      {/* 2. Fallback Ambient Gradient if No Image is configured */}
      {!hasImage && (
        <LinearGradient
          colors={[accentColor, "#0B0F14"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      {/* 6. Text Metadata Overlay at bottom of hero area */}
      {hasAnyText && (
        <View style={styles.textBottomWrapper}>
          {badgeText.length > 0 && (
            <View style={styles.badgePill}>
              <Text allowFontScaling={false} style={styles.dateBadge}>
                {badgeText}
              </Text>
            </View>
          )}

          {subTitle.length > 0 && (
            <Text allowFontScaling={false} style={styles.subTitle} numberOfLines={1}>
              {subTitle}
            </Text>
          )}

          {mainTitle.length > 0 && (
            <Text allowFontScaling={false} style={styles.mainTitle} numberOfLines={2}>
              {mainTitle}
            </Text>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  seamlessHeroRoot: {
    width: "100%",
    position: "relative",
    justifyContent: "flex-end",
    // Completely seamless: 0 margin, 0 padding, 0 border, 0 radius
    marginHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    overflow: "hidden",
  },
  textBottomWrapper: {
    width: "100%",
    paddingHorizontal: 20,
    paddingBottom: 22,
    justifyContent: "flex-end",
    zIndex: 5,
  },
  badgePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0, 0, 0, 0.50)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  dateBadge: {
    fontSize: 9.5,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#FDE6A6",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  subTitle: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 3,
    color: "#C5E6DA",
    opacity: 0.92,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  mainTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#FFFDF2",
    lineHeight: 30,
    textShadowColor: "rgba(0, 0, 0, 0.65)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
});

export default FestivalHeaderBanner;
