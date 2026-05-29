import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { db } from "@/lib/firebase";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { mapFilter } from "@/lib/arrayUtils";

const APP_BRAND_ICON = require("@/assets/images/mavrixfy_icone.png");
const DISMISS_PREFIX = "@mavrixfy_promotion_modal_dismissed";

type ActionType = "none" | "external" | "song" | "playlist" | "artist" | "album";
type Frequency = "once" | "daily" | "every_open";
type VisibilityMode = "public" | "dev";

interface AttachedSong {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  imageUrl?: string;
  audioUrl?: string;
  streamUrl?: string;
}

interface ModalPromotion {
  id: string;
  title: string;
  description?: string;
  mediaUrl?: string;
  platforms?: "web" | "app" | "both" | ("web" | "app")[];
  status: "active" | "scheduled" | "ended";
  startDate?: string;
  endDate?: string;
  placement?: string;
  layout?: string;
  actionType?: ActionType;
  actionUrl?: string;
  attachedSong?: AttachedSong;
  targetTitle?: string;
  targetSubtitle?: string;
  targetImageUrl?: string;
  priority?: number;
  ctaText?: string;
  dismissText?: string;
  frequency?: Frequency;
  visibilityMode?: VisibilityMode;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isInDateWindow(promo: ModalPromotion): boolean {
  const today = todayKey();
  return (!promo.startDate || promo.startDate <= today) && (!promo.endDate || promo.endDate >= today);
}

function isModalPromotion(promo: ModalPromotion): boolean {
  return promo.placement === "home_modal" || promo.layout === "modal";
}

function isVisibleInThisBuild(promo: ModalPromotion): boolean {
  return (promo.visibilityMode || "public") !== "dev" || __DEV__;
}

function isForApp(platforms: ModalPromotion["platforms"]): boolean {
  if (!platforms) return true;
  if (Array.isArray(platforms)) return platforms.includes("app");
  return platforms === "app" || platforms === "both";
}

function getRouteId(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("http")) return raw;
  try {
    const url = new URL(raw);
    return url.pathname.split("/").filter(Boolean).pop() || raw;
  } catch {
    return raw.split("/").filter(Boolean).pop() || raw;
  }
}

function dismissStorageKey(promo: ModalPromotion): string {
  return `${DISMISS_PREFIX}:${promo.id}`;
}

async function isDismissed(promo: ModalPromotion): Promise<boolean> {
  if (promo.visibilityMode === "dev") return false;
  if ((promo.frequency || "once") === "every_open") return false;

  const dismissedValue = await AsyncStorage.getItem(dismissStorageKey(promo));
  if (!dismissedValue) return false;
  if (promo.frequency === "daily") return dismissedValue === todayKey();
  return dismissedValue === "true";
}

async function storeDismissal(promo: ModalPromotion): Promise<void> {
  if (promo.visibilityMode === "dev") return;
  const value = promo.frequency === "daily" ? todayKey() : "true";
  await AsyncStorage.setItem(dismissStorageKey(promo), value);
}

export default function AppPromotionModal() {
  const [promotion, setPromotion] = useState<ModalPromotion | null>(null);
  const [visible, setVisible] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const { width, height } = useWindowDimensions();
  const { playSong } = usePlayerActions();

  useEffect(() => {
    let active = true;
    const promotionQuery = query(
      collection(db, "promotions"),
      where("status", "==", "active"),
      limit(20)
    );

    getDocs(promotionQuery)
      .then(async (snapshot) => {
        if (!active) return;
        const promotions = mapFilter(
          snapshot.docs,
          (doc) => ({ id: doc.id, ...doc.data() } as ModalPromotion),
          (promo) =>
            isForApp(promo.platforms) &&
            isModalPromotion(promo) &&
            isInDateWindow(promo) &&
            isVisibleInThisBuild(promo)
        ).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

        for (const promo of promotions) {
          if (!(await isDismissed(promo))) {
            if (!active) return;
            setPromotion(promo);
            setVisible(true);
            return;
          }
        }
      })
      .catch(() => {
        // In-app campaigns should never block Home.
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setImageFailed(false);
  }, [promotion?.id, promotion?.mediaUrl]);

  const modalWidth = Math.min(width - 40, 348);
  const modalMaxHeight = Math.min(height - 104, 540);
  const artHeight = Math.min(218, Math.round(modalWidth * 0.62));

  const close = useCallback(async () => {
    if (promotion) {
      await storeDismissal(promotion).catch(() => {});
    }
    setVisible(false);
  }, [promotion]);

  const handleCta = useCallback(async () => {
    if (!promotion) return;

    await storeDismissal(promotion).catch(() => {});
    setVisible(false);

    switch (promotion.actionType || "none") {
      case "song":
        if (promotion.attachedSong) {
          playSong({
            id: promotion.attachedSong.id,
            title: promotion.attachedSong.title,
            artist: promotion.attachedSong.artist,
            coverUrl: promotion.attachedSong.coverUrl || promotion.attachedSong.imageUrl || "",
            audioUrl: promotion.attachedSong.audioUrl || promotion.attachedSong.streamUrl || "",
            duration: 0,
          } as any);
          router.push("/player");
        }
        break;
      case "playlist": {
        const id = getRouteId(promotion.actionUrl);
        if (id) router.push(`/playlist/${id}` as any);
        break;
      }
      case "artist": {
        const id = getRouteId(promotion.actionUrl);
        if (id) router.push(`/artist/${id}` as any);
        break;
      }
      case "album":
        if (promotion.actionUrl?.startsWith("http")) {
          const canOpen = await Linking.canOpenURL(promotion.actionUrl).catch(() => false);
          if (canOpen) Linking.openURL(promotion.actionUrl).catch(() => {});
        }
        break;
      case "external":
        if (promotion.actionUrl) {
          const canOpen = await Linking.canOpenURL(promotion.actionUrl).catch(() => false);
          if (canOpen) Linking.openURL(promotion.actionUrl).catch(() => {});
        }
        break;
      default:
        break;
    }
  }, [playSong, promotion]);

  if (!promotion) return null;

  const mediaUrl = (
    promotion.mediaUrl ||
    promotion.targetImageUrl ||
    promotion.attachedSong?.imageUrl ||
    promotion.attachedSong?.coverUrl ||
    ""
  ).trim();
  const contentLabel = promotion.targetTitle || promotion.attachedSong?.title;
  const supportingText = promotion.description || promotion.targetSubtitle || promotion.attachedSong?.artist;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[styles.card, { width: modalWidth, maxHeight: modalMaxHeight }]}>
          <View style={[styles.artWrap, { height: artHeight }]}>
            {mediaUrl && !imageFailed ? (
              <Image
                source={{ uri: mediaUrl }}
                style={styles.artImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={180}
                recyclingKey={`${promotion.id}:${mediaUrl}`}
                onError={() => setImageFailed(true)}
              />
            ) : (
              <LinearGradient colors={Colors.gradientGreen as [string, string, string]} style={styles.artFallback}>
                <Ionicons name="sparkles" size={44} color={Colors.black} />
              </LinearGradient>
            )}
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(17,22,29,0)", "rgba(17,22,29,0.32)", "#11161D"]}
              locations={[0.18, 0.68, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.brandPill}>
              <Image source={APP_BRAND_ICON} style={styles.brandIcon} contentFit="cover" />
              <Text style={styles.brandText}>Mavrixfy</Text>
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {promotion.title}
            </Text>

            {contentLabel ? (
              <Text style={styles.contentLabel} numberOfLines={1}>
                {contentLabel}
              </Text>
            ) : null}

            {supportingText ? (
              <Text style={styles.description} numberOfLines={2}>
                {supportingText}
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable style={({ pressed }) => [styles.ctaButton, pressed && styles.buttonPressed]} onPress={handleCta}>
                <Text style={styles.ctaText}>{promotion.ctaText || "Open"}</Text>
              </Pressable>
              <Pressable style={styles.inlineDismissButton} onPress={close}>
                <Text style={styles.inlineDismissText}>{promotion.dismissText || "Later"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3,6,10,0.82)",
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#11161D",
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.18)",
  },
  brandPill: {
    position: "absolute",
    top: 12,
    left: 12,
    height: 34,
    borderRadius: 17,
    paddingLeft: 5,
    paddingRight: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(10,15,20,0.82)",
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.32)",
  },
  brandIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  brandText: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  title: {
    color: Colors.text,
    fontSize: 21,
    lineHeight: 26,
    textAlign: "left",
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  artWrap: {
    overflow: "hidden",
    backgroundColor: "#080C11",
    width: "100%",
  },
  artImage: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.background,
  },
  artFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  contentLabel: {
    marginTop: 10,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 18,
    textAlign: "left",
    fontFamily: "Inter_700Bold",
  },
  description: {
    marginTop: 6,
    color: "rgba(223,226,235,0.72)",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "left",
    fontFamily: "Inter_500Medium",
  },
  actionRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ctaButton: {
    minHeight: 48,
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#26E19A",
    paddingHorizontal: 28,
  },
  ctaText: {
    color: Colors.black,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.88,
  },
  inlineDismissButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  inlineDismissText: {
    color: "rgba(223,226,235,0.78)",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
