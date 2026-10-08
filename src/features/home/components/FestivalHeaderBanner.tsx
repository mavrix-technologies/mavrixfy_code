import { useVisibleImageAnimation } from "@/lib/useVisibleImageAnimation";
import { type FestivalThemeConfig } from "@/services/festivalThemeService";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import { type SharedValue } from "react-native-reanimated";
import {
  ActivityIndicator,
  PixelRatio,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { getFestivalArtworkUrl } from "./festivalArtwork";

// Module-level aspect ratio cache to avoid recalculating on re-renders across the app lifecycle
const gBannerAspectRatioCache: Record<string, number> = {};

// Fallback aspect ratio (16:9 is the universal standard for mobile media banners)
const DEFAULT_BANNER_ASPECT_RATIO = 16 / 9;

interface FestivalHeaderBannerProps {
  themeConfig?: FestivalThemeConfig;
  scrollY?: SharedValue<number>;
  contentTopOffset?: number;
}

export const FestivalHeaderBanner = React.memo(function FestivalHeaderBanner({
  themeConfig,
  scrollY,
  contentTopOffset = 0,
}: FestivalHeaderBannerProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const screenWidth = windowWidth || 390;
  const screenHeight = windowHeight || 844;

  const backgroundImageUrl = themeConfig?.backgroundImageUrl?.trim() || null;
  const [failedOptimizedSource, setFailedOptimizedSource] = useState<string | null>(null);
  const optimizedSource = backgroundImageUrl
    ? getFestivalArtworkUrl(backgroundImageUrl, screenWidth * PixelRatio.get()) : null;
  const imageSource = optimizedSource === failedOptimizedSource ? backgroundImageUrl : optimizedSource;
  const configuredRatio = themeConfig?.aspectRatio;

  // 1. Stable aspect ratio resolution (Configured > Cached > Standard 16:9)
  const [aspectRatio, setAspectRatio] = useState<number>(() => {
    if (configuredRatio && configuredRatio > 0) return configuredRatio;
    if (backgroundImageUrl && gBannerAspectRatioCache[backgroundImageUrl]) {
      return gBannerAspectRatioCache[backgroundImageUrl];
    }
    return DEFAULT_BANNER_ASPECT_RATIO;
  });

  const [isLoaded, setIsLoaded] = useState<boolean>(() => {
    // If the image was already measured in cache, it's likely already in memory/disk cache
    return Boolean(backgroundImageUrl && gBannerAspectRatioCache[backgroundImageUrl]);
  });
  const [hasError, setHasError] = useState<boolean>(false);

  const effectiveRatio = aspectRatio > 0 ? aspectRatio : DEFAULT_BANNER_ASPECT_RATIO;
  const rawHeight = Math.round(screenWidth / effectiveRatio);
  const minHeight = 140;
  const maxHeight = Math.round(Math.min(screenHeight * 0.42, 330));
  const bannerHeight = Math.max(minHeight, Math.min(rawHeight, maxHeight));

  const { imageRef, animationActive } = useVisibleImageAnimation(imageSource, scrollY,
    contentTopOffset + bannerHeight);

  // Sync aspect ratio if themeConfig changes dynamically
  useEffect(() => {
    if (configuredRatio && configuredRatio > 0) {
      setAspectRatio(configuredRatio);
    } else if (backgroundImageUrl && gBannerAspectRatioCache[backgroundImageUrl]) {
      setAspectRatio(gBannerAspectRatioCache[backgroundImageUrl]);
    }
  }, [configuredRatio, backgroundImageUrl]);

  // Handle successful image load
  const handleLoad = useCallback(
    (e: { source: { width: number; height: number } }) => {
      const { width, height } = e.source;
      setIsLoaded(true);
      setHasError(false);

      if (width > 0 && height > 0) {
        const ratio = width / height;
        if (backgroundImageUrl) {
          gBannerAspectRatioCache[backgroundImageUrl] = ratio;
        }
        // Only update if not explicitly pinned by remote config
        if (!configuredRatio) {
          setAspectRatio((prev) => (Math.abs(prev - ratio) > 0.05 ? ratio : prev));
        }
      }
    },
    [backgroundImageUrl, configuredRatio]
  );

  const handleError = useCallback(() => {
    if (imageSource && imageSource !== backgroundImageUrl) {
      setFailedOptimizedSource(imageSource);
      return;
    }
    setIsLoaded(true);
    setHasError(true);
  }, [imageSource, backgroundImageUrl]);

  if (!themeConfig || !themeConfig.enabled) {
    return null;
  }

  const subTitle = themeConfig?.subTitle?.trim() || "";
  const mainTitle = themeConfig?.mainTitle?.trim() || "";
  const badgeText = themeConfig?.badgeText?.trim() || "";
  const accentColor = themeConfig?.themeAccentColor || "#014D52";

  const hasImage = Boolean(backgroundImageUrl && backgroundImageUrl.length > 0 && !hasError);
  const hasAnyText = subTitle.length > 0 || mainTitle.length > 0 || badgeText.length > 0;

  // Don't render an empty banner if there's neither an image nor text
  if (!hasImage && !hasAnyText) {
    return null;
  }

  // 2. Predictable, non-jumping banner geometry
  // Clamped between 140px and 42% screen height (max 330px on larger phones)

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
      {/* 1. Underlying Festive Ambient Gradient (Shown during load, on error, or as fallback) */}
      <LinearGradient
        colors={[accentColor, "#0B1015"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* 2. Loading Placeholder Shimmer/Spinner for heavy GIFs on slower connections */}
      {hasImage && !isLoaded && (
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      )}

      {/* 3. High-Performance Hardware-Accelerated Image / Animated GIF */}
      {hasImage && (
        <Image
          ref={imageRef}
          source={{ uri: imageSource! }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          contentPosition="center"
          priority="high"
          cachePolicy="memory-disk"
          allowDownscaling={true}
          recyclingKey={backgroundImageUrl!}
          autoplay={animationActive}
          transition={250}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* 4. Text Scrim Gradient: Guarantees 100% text readability over dynamic/bright GIF frames */}
      {hasAnyText && (
        <LinearGradient
          colors={["transparent", "rgba(0, 0, 0, 0.28)", "rgba(0, 0, 0, 0.82)"]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      )}

      {/* 5. Text Metadata Overlay */}
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
    marginHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    overflow: "hidden",
  },
  loaderCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  textBottomWrapper: {
    width: "100%",
    paddingHorizontal: 20,
    paddingBottom: 20,
    justifyContent: "flex-end",
    zIndex: 5,
  },
  badgePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.25)",
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
    letterSpacing: 2.5,
    color: "#C5E6DA",
    opacity: 0.95,
    marginBottom: 4,
    textTransform: "uppercase",
    textShadowColor: "rgba(0, 0, 0, 0.60)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  mainTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#FFFDF2",
    lineHeight: 30,
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

export default FestivalHeaderBanner;
