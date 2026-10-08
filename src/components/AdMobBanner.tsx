import { AD_UNITS } from "@/constants/admob";
import { getGoogleMobileAdsModule,initializeMobileAds,type GoogleMobileAdsModule } from "@/lib/googleMobileAds";
import { logger } from "@/lib/logger";
import { memo,useEffect,useState } from "react";
import { StyleSheet,View } from "react-native";

const BANNER_AD_UNIT_ID = AD_UNITS.BANNER || AD_UNITS.NATIVE;
const REQUEST_OPTIONS = { requestNonPersonalizedAdsOnly: true };

interface AdMobBannerProps {
  loadDelayMs?: number;
}

const AdMobBanner = memo(function AdMobBanner({ loadDelayMs = 0 }: AdMobBannerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [adsModule, setAdsModule] = useState<GoogleMobileAdsModule | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void initializeMobileAds().then(() => {
        if (!cancelled) setAdsModule(getGoogleMobileAdsModule());
      });
    }, Math.max(0, loadDelayMs));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loadDelayMs]);

  if (!adsModule || !BANNER_AD_UNIT_ID || hasError) {
    return null;
  }

  const { BannerAd, BannerAdSize } = adsModule;

  return (
    <View style={[styles.container, !isLoaded && styles.hidden]}>
      <BannerAd
        unitId={BANNER_AD_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={REQUEST_OPTIONS}
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
});

export default AdMobBanner;

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
