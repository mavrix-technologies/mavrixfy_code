import React, { useState, useEffect } from "react";
import { InteractionManager, View, Text, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";

import { AD_UNITS } from "@/constants/admob";
import { getGoogleMobileAdsModule, type GoogleNativeAd } from "@/lib/googleMobileAds";
import { logger } from "@/lib/logger";

const NATIVE_VIDEO_AD_UNIT_ID = AD_UNITS.NATIVE_VIDEO;
const DEFAULT_LOAD_DELAY_MS = 2500;

const APP_BRAND_ICON = require("@/assets/images/mavrixfy_icone.png");

export default function AdMobNativeVideo({ loadDelayMs = DEFAULT_LOAD_DELAY_MS }: { loadDelayMs?: number }) {
  const [nativeAd, setNativeAd] = useState<GoogleNativeAd | null>(null);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adError, setAdError] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(loadDelayMs <= 0);

  useEffect(() => {
    if (shouldLoad) return;

    let active = true;
    const timer = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        if (active) setShouldLoad(true);
      });
    }, loadDelayMs);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [loadDelayMs, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;

    let active = true;
    let loadedAd: GoogleNativeAd | null = null;

    const loadNativeVideoAd = async () => {
      try {
        const adsModule = getGoogleMobileAdsModule();
        if (!adsModule || !NATIVE_VIDEO_AD_UNIT_ID) {
          if (active) {
            setAdError(true);
          }
          return;
        }

        const { default: mobileAds, NativeAd } = adsModule;

        if (Platform.OS === "ios") {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { requestTrackingPermissionsAsync } = require("expo-tracking-transparency");
            await requestTrackingPermissionsAsync();
          } catch {
            // Ignore tracking permission errors if unsupported
          }
        }

        await mobileAds().initialize();
        
        if (!active) return;

        const ad = await NativeAd.createForAdRequest(NATIVE_VIDEO_AD_UNIT_ID, {
          requestNonPersonalizedAdsOnly: true,
          startVideoMuted: true, // Start video muted for better user experience
        });

        if (!active) {
          ad.destroy();
          return;
        }

        loadedAd = ad;
        setNativeAd(ad);
        setAdLoaded(true);
      } catch (err) {
        logger.warn("Failed to load native video ad:", err);
        if (active) {
          setAdError(true);
        }
      }
    };

    loadNativeVideoAd();

    return () => {
      active = false;
      if (loadedAd) {
        loadedAd.destroy();
      }
    };
  }, [shouldLoad]);

  const adsModule = nativeAd ? getGoogleMobileAdsModule() : null;

  if (adError || !NATIVE_VIDEO_AD_UNIT_ID || !nativeAd || !adsModule) {
    return null; // Return nothing if native ad fails to load
  }

  const { NativeAdView, NativeAsset, NativeAssetType, NativeMediaView } = adsModule;

  return (
    <View style={[styles.container, !adLoaded && styles.loading]}>
      <NativeAdView nativeAd={nativeAd} style={styles.nativeAdView}>
      {/* Immersive Video Media View */}
      <NativeMediaView resizeMode="cover" style={styles.mediaView} />
      
      {/* Information Row */}
      <View style={styles.infoRow}>
        {nativeAd.icon ? (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image
              source={{ uri: nativeAd.icon.url }}
              style={styles.logoImage}
              contentFit="cover"
              transition={80}
            />
          </NativeAsset>
        ) : (
          <Image
            source={APP_BRAND_ICON}
            style={styles.logoImage}
            contentFit="cover"
          />
        )}
        
        <View style={styles.textColumn}>
          <View style={styles.titleRow}>
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>AD</Text>
            </View>
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text style={styles.titleText} numberOfLines={1}>
                {nativeAd.headline}
              </Text>
            </NativeAsset>
          </View>
          
          {nativeAd.body && (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text style={styles.subtitleText} numberOfLines={2}>
                {nativeAd.body}
              </Text>
            </NativeAsset>
          )}
        </View>

        {nativeAd.callToAction && (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Text style={styles.actionButtonText}>{nativeAd.callToAction}</Text>
          </NativeAsset>
        )}
      </View>
      </NativeAdView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
    backgroundColor: "#11141a",
  },
  nativeAdView: {
    width: "100%",
    backgroundColor: "#11141a",
  },
  loading: {
    height: 0,
    marginVertical: 0,
    borderWidth: 0,
    overflow: "hidden",
  },
  mediaView: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000000",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  logoImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  textColumn: {
    flex: 1,
    justifyContent: "center",
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgeContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  badgeText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  titleText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  subtitleText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_400Regular",
  },
  actionButtonText: {
    color: "#10141a",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    backgroundColor: "#26e19a",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    overflow: "hidden",
    textAlign: "center",
  },
});
