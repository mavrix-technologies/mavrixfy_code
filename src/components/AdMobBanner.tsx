import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { AD_UNITS } from "@/constants/admob";
import { getGoogleMobileAdsModule, initializeMobileAds } from "@/lib/googleMobileAds";
import { logger } from "@/lib/logger";

const BANNER_AD_UNIT_ID = AD_UNITS.BANNER || AD_UNITS.NATIVE;

interface AdMobBannerProps {
  loadDelayMs?: number; // Backwards-compatible prop
}

export default function AdMobBanner(_props: AdMobBannerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    void initializeMobileAds();
  }, []);

  const adsModule = getGoogleMobileAdsModule();

  if (!adsModule || !BANNER_AD_UNIT_ID || hasError) {
    return null;
  }

  const { BannerAd, BannerAdSize } = adsModule;

  return (
    <View style={[styles.container, !isLoaded && styles.hidden]}>
      <BannerAd
        unitId={BANNER_AD_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          setIsLoaded(true);
        }}
        onAdFailedToLoad={(error) => {
          logger.warn("[Ads] Banner ad failed to load:", error);
          setHasError(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  hidden: {
    display: "none",
  },
});
