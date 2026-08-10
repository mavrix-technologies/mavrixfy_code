import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { Button, Card, Dialog, Portal, Text as PaperText } from "react-native-paper";

import Colors from "@/constants/colors";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { mapFilter } from "@/lib/arrayUtils";
import { db } from "@/lib/firebase";
import type { Song } from "@/lib/musicData";

const APP_BRAND_ICON = require("@/assets/images/mavrixfy_icone.png");
const DISMISS_PREFIX = "@mavrixfy_promotion_modal_dismissed";

type AppPlatform = "web" | "app";
type ActionType = "none" | "external" | "song" | "playlist" | "artist" | "album";
type Frequency = "once" | "daily" | "every_open";
type VisibilityMode = "public" | "dev";

type AttachedSong = {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  imageUrl?: string;
  audioUrl?: string;
  streamUrl?: string;
};

type ModalPromotion = {
  id: string;
  title: string;
  description?: string;
  mediaUrl?: string;
  platforms?: AppPlatform | AppPlatform[] | "both";
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
};

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

function attachedSongToSong(song: AttachedSong): Song {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: "",
    duration: 0,
    coverUrl: song.coverUrl || song.imageUrl || "",
    genre: "",
    audioUrl: song.audioUrl || song.streamUrl || "",
  };
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
  if ((promo.frequency || "once") === "every_open") return;

  const value = promo.frequency === "daily" ? todayKey() : "true";
  await AsyncStorage.setItem(dismissStorageKey(promo), value);
}

export default function AppPromotionModal() {
  const [promotion, setPromotion] = useState<ModalPromotion | null>(null);
  const [visible, setVisible] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const { playSong } = usePlayerActions();

  useEffect(() => {
    let active = true;
    const promotionQuery = query(collection(db, "promotions"), where("status", "==", "active"), limit(20));

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

        // Check all dismissals in parallel instead of sequentially
        const dismissalChecks = await Promise.all(
          promotions.map(async (promo) => ({
            promo,
            dismissed: await isDismissed(promo),
          }))
        );

        // Find first non-dismissed promotion
        const firstAvailable = dismissalChecks.find((check) => !check.dismissed);
        if (firstAvailable && active) {
          setPromotion(firstAvailable.promo);
          setVisible(true);
          setImageFailed(false);
        }
      })
      .catch(() => {
        setPromotion(null);
      });

    return () => {
      active = false;
    };
  }, []);

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
          playSong(attachedSongToSong(promotion.attachedSong));
          router.push("/player");
        }
        break;

      case "playlist": {
        const id = getRouteId(promotion.actionUrl);
        if (id) router.push(`/playlist/${id}` as never);
        break;
      }

      case "artist": {
        const id = getRouteId(promotion.actionUrl);
        if (id) router.push(`/artist/${id}` as never);
        break;
      }

      case "album":
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
  const coverSource = mediaUrl && !imageFailed ? { uri: mediaUrl } : APP_BRAND_ICON;

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={() => {
          void close();
        }}
        dismissable
        dismissableBackButton
        style={styles.dialog}
      >
        <Dialog.Content style={styles.mediaContent}>
          <Card.Cover
            source={coverSource}
            resizeMode="cover"
            style={styles.cover}
            onError={() => setImageFailed(true)}
          />
        </Dialog.Content>

        <Dialog.Title>{promotion.title}</Dialog.Title>

        <Dialog.Content>
          <View style={styles.message}>
            {!!contentLabel && (
              <PaperText variant="titleSmall" numberOfLines={1} style={styles.contentLabel}>
                {contentLabel}
              </PaperText>
            )}
            {!!supportingText && (
              <PaperText variant="bodyMedium" numberOfLines={3} style={styles.description}>
                {supportingText}
              </PaperText>
            )}
          </View>
        </Dialog.Content>

        <Dialog.Actions>
          <Button onPress={close} textColor={Colors.subtext}>
            {promotion.dismissText || "Later"}
          </Button>
          <Button mode="contained" onPress={handleCta} buttonColor={Colors.primary} textColor={Colors.black}>
            {promotion.ctaText || "Open"}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    alignSelf: "center",
    width: "88%",
    maxWidth: 360,
    backgroundColor: Colors.surface,
  },
  mediaContent: {
    paddingTop: 24,
    paddingBottom: 0,
  },
  cover: {
    height: 196,
    backgroundColor: Colors.surfaceLight,
  },
  message: {
    gap: 6,
  },
  contentLabel: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
  },
  description: {
    color: "rgba(223,226,235,0.72)",
    fontFamily: "Inter_500Medium",
  },
});
