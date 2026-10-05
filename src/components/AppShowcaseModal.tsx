import { triggerImpact } from "@/lib/haptics";
import {
  dismissAppShowcaseModal,
  subscribeAppShowcaseModal,
} from "@/features/home/hooks/useAppShowcasePrompt";
import {
  getAppShowcaseConfig,
  initAppShowcaseFirestore,
  subscribeAppShowcaseConfig,
  type AppShowcaseConfig,
} from "@/lib/appShowcaseConfig";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { logger } from "@/lib/logger";

export const AppShowcaseModal = memo(function AppShowcaseModal() {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AppShowcaseConfig>(() => getAppShowcaseConfig());

  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Initialize real-time Firestore sync & listen to updates
  useEffect(() => {
    const unsubFirestoreInit = initAppShowcaseFirestore();
    const unsubConfigListener = subscribeAppShowcaseConfig((updated) => {
      if (updated) {
        setConfig(updated);
      }
    });

    return () => {
      if (typeof unsubFirestoreInit === "function") unsubFirestoreInit();
      unsubConfigListener();
    };
  }, []);

  // Listen to open/close trigger events
  useEffect(() => {
    return subscribeAppShowcaseModal((isOpen) => {
      if (isOpen && config.enabled !== false) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    });
  }, [config.enabled]);

  const handleClose = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setVisible(false);
    dismissAppShowcaseModal();
  }, []);

  const handleCTA = useCallback(async () => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    setVisible(false);
    dismissAppShowcaseModal();

    const target = config.ctaRoute?.trim() || "/profile/streaming-downloads";

    try {
      if (
        target.startsWith("http://") ||
        target.startsWith("https://") ||
        target.startsWith("mailto:") ||
        target.startsWith("tel:")
      ) {
        const canOpen = await Linking.canOpenURL(target);
        if (canOpen) {
          await Linking.openURL(target);
        } else {
          logger.warn("[AppShowcase] Cannot open external URL:", target);
        }
        return;
      }

      router.push(target as any);
    } catch (error) {
      logger.warn("[AppShowcase] Failed to navigate to route:", target, error);
      try {
        router.push("/profile/streaming-downloads");
      } catch {}
    }
  }, [config.ctaRoute, router]);

  if (!visible || !config.enabled || !config.title) return null;

  const cardBg = config.cardBgColor || "#1DB954";
  const textColor = config.cardTextColor || "#FFFFFF";
  const ctaBg = config.ctaBgColor || "#FFFFFF";
  const ctaTextColor = config.ctaTextColor || "#000000";

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        {/* Dimmed backdrop */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss prompt"
        />

        <View style={styles.contentWrap}>
          {/* High-Impact Showcase Card */}
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            {/* Bold Headline */}
            <Text style={[styles.title, { color: textColor }]}>
              {config.title}
            </Text>

            {/* Subtitle / Description */}
            {config.subtitle ? (
              <Text style={[styles.subtitle, { color: textColor }]}>
                {config.subtitle}
              </Text>
            ) : null}

            {/* Pill CTA Button */}
            {config.ctaText ? (
              <Pressable
                onPress={handleCTA}
                style={({ pressed }) => [
                  styles.ctaButton,
                  { backgroundColor: ctaBg },
                  pressed && styles.ctaButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={config.ctaText}
              >
                <Text style={[styles.ctaButtonText, { color: ctaTextColor }]}>
                  {config.ctaText}
                </Text>
              </Pressable>
            ) : null}

            {/* Terms / Subtext */}
            {config.subtext ? (
              <Text style={[styles.disclaimer, { color: textColor }]}>
                {config.subtext}
              </Text>
            ) : null}
          </View>

          {/* Standalone DISMISS button below card */}
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.dismissBtn, pressed && styles.pressed]}
            hitSlop={{ top: 16, bottom: 16, left: 32, right: 32 }}
            accessibilityRole="button"
            accessibilityLabel={config.dismissText || "DISMISS"}
          >
            <Text style={styles.dismissBtnText}>{config.dismissText || "DISMISS"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
  },
  contentWrap: {
    width: "100%",
    maxWidth: 350,
    alignItems: "center",
  },
  card: {
    width: "100%",
    borderRadius: 28,
    paddingTop: 40,
    paddingBottom: 36,
    paddingHorizontal: 28,
    alignItems: "center",
    boxShadow: "0px 16px 28px rgba(0, 0, 0, 0.35)",
  },
  title: {
    fontSize: 27,
    fontFamily: "Inter_800ExtraBold",
    textAlign: "center",
    lineHeight: 33,
    letterSpacing: -0.6,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    opacity: 0.9,
    marginBottom: 30,
    paddingHorizontal: 4,
  },
  ctaButton: {
    width: "100%",
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.2)",
  },
  ctaButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  ctaButtonText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  disclaimer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 16,
    opacity: 0.75,
    paddingHorizontal: 6,
  },
  dismissBtn: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  pressed: {
    opacity: 0.6,
  },
  dismissBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    textAlign: "center",
  },
});
