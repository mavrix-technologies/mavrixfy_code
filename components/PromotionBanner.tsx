import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  StyleSheet,
  View,
  type AppStateStatus,
} from "react-native";
import { Image } from "expo-image";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { router } from "expo-router";
import { Banner, Text as PaperText } from "react-native-paper";

import Colors from "@/constants/colors";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { mapFilter } from "@/lib/arrayUtils";
import { db } from "@/lib/firebase";
import type { Song } from "@/lib/musicData";

const ROTATION_INTERVAL_MS = 8_000;
const APP_BRAND_ICON = require("@/assets/images/mavrixfy_icone.png");

type MediaType = "image" | "gif" | "video" | "audio";
type AppPlatform = "web" | "app";
type ActionType = "none" | "external" | "song" | "playlist" | "artist" | "album";
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

type Promotion = {
  id: string;
  title: string;
  description?: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  platforms?: AppPlatform | AppPlatform[] | "both";
  status: "active" | "scheduled" | "ended";
  startDate?: string;
  endDate?: string;
  actionType?: ActionType;
  actionUrl?: string;
  attachedSong?: AttachedSong;
  targetTitle?: string;
  targetSubtitle?: string;
  targetImageUrl?: string;
  priority?: number;
  placement?: string;
  layout?: string;
  ctaText?: string;
  visibilityMode?: VisibilityMode;
};

function subscribeToAppStateChanges(listener: (state: AppStateStatus) => void) {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
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

function isForApp(platforms: Promotion["platforms"]): boolean {
  if (!platforms) return true;
  if (Array.isArray(platforms)) return platforms.includes("app");
  return platforms === "app" || platforms === "both";
}

function isInDateWindow(promo: Promotion, today: string): boolean {
  return (!promo.startDate || promo.startDate <= today) && (!promo.endDate || promo.endDate >= today);
}

function isVisibleInThisBuild(promo: Promotion): boolean {
  return (promo.visibilityMode || "public") !== "dev" || __DEV__;
}

function isBannerPromotion(promo: Promotion): boolean {
  return promo.placement !== "home_modal" && promo.layout !== "modal";
}

function getPromotionMediaUrl(promo: Promotion): string {
  return (
    promo.mediaUrl ||
    promo.targetImageUrl ||
    promo.attachedSong?.coverUrl ||
    promo.attachedSong?.imageUrl ||
    ""
  ).trim();
}

function attachedSongToSong(song: AttachedSong): Song {
  const coverUrl = song.coverUrl || song.imageUrl || "";
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: "",
    duration: 0,
    coverUrl,
    genre: "",
    audioUrl: song.audioUrl || song.streamUrl || "",
  };
}

export default function PromotionBanner() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failedMediaIds, setFailedMediaIds] = useState<Record<string, boolean>>({});
  const isVisibleRef = useRef(true);
  const { playSong } = usePlayerActions();

  useEffect(() => {
    let active = true;
    const today = new Date().toISOString().slice(0, 10);
    const promotionQuery = query(collection(db, "promotions"), where("status", "==", "active"), limit(10));

    getDocs(promotionQuery)
      .then((snapshot) => {
        if (!active) return;

        const visiblePromotions = mapFilter(
          snapshot.docs,
          (doc) => ({ id: doc.id, ...doc.data() } as Promotion),
          (promo) =>
            isInDateWindow(promo, today) &&
            isForApp(promo.platforms) &&
            isBannerPromotion(promo) &&
            isVisibleInThisBuild(promo)
        )
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          .slice(0, 3);

        setPromotions(visiblePromotions);
        setCurrentIndex(0);
      })
      .catch(() => {
        setPromotions([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return subscribeToAppStateChanges((state) => {
      isVisibleRef.current = state === "active";
    });
  }, []);

  useEffect(() => {
    if (promotions.length <= 1) return;

    const rotationId = setInterval(() => {
      if (isVisibleRef.current) {
        setCurrentIndex((prev) => (prev + 1) % promotions.length);
      }
    }, ROTATION_INTERVAL_MS);

    return () => clearInterval(rotationId);
  }, [promotions.length]);

  const handlePress = useCallback(
    async (promo: Promotion) => {
      switch (promo.actionType || "none") {
        case "song":
          if (promo.attachedSong) {
            playSong(attachedSongToSong(promo.attachedSong));
          }
          break;

        case "external":
          if (promo.actionUrl) {
            const canOpen = await Linking.canOpenURL(promo.actionUrl).catch(() => false);
            if (canOpen) Linking.openURL(promo.actionUrl).catch(() => {});
          }
          break;

        case "playlist": {
          const id = getRouteId(promo.actionUrl);
          if (id) router.push(`/playlist/${id}` as never);
          break;
        }

        case "artist": {
          const id = getRouteId(promo.actionUrl);
          if (id) router.push(`/artist/${id}` as never);
          break;
        }

        case "album":
          if (promo.actionUrl?.startsWith("http")) {
            const canOpen = await Linking.canOpenURL(promo.actionUrl).catch(() => false);
            if (canOpen) Linking.openURL(promo.actionUrl).catch(() => {});
          }
          break;

        default:
          break;
      }
    },
    [playSong]
  );

  if (loading || promotions.length === 0) return null;

  const promo = promotions[currentIndex] || promotions[0];
  const mediaUrl = getPromotionMediaUrl(promo);
  const showMedia = Boolean(mediaUrl) && !failedMediaIds[promo.id];
  const title = promo.targetTitle || promo.attachedSong?.title || promo.title;
  const subtitle = promo.description || promo.targetSubtitle || promo.attachedSong?.artist || "";
  const actionLabel = promo.ctaText || "Open";

  return (
    <View style={styles.container}>
      <Banner
        visible
        elevation={2}
        style={styles.banner}
        contentStyle={styles.bannerContent}
        actions={[
          {
            label: actionLabel,
            onPress: () => {
              void handlePress(promo);
            },
          },
        ]}
        icon={({ size }) =>
          showMedia ? (
            <Image
              source={{ uri: mediaUrl }}
              style={[styles.bannerIcon, { width: size, height: size }]}
              contentFit="cover"
              transition={160}
              cachePolicy="memory-disk"
              recyclingKey={`${promo.id}:${mediaUrl}`}
              onError={() => setFailedMediaIds((prev) => ({ ...prev, [promo.id]: true }))}
            />
          ) : (
            <Image source={APP_BRAND_ICON} style={[styles.bannerIcon, { width: size, height: size }]} contentFit="cover" />
          )
        }
        theme={{
          colors: {
            primary: Colors.primary,
            surface: Colors.surface,
            onSurface: Colors.text,
            onSurfaceVariant: Colors.subtext,
          },
        }}
      >
        <View style={styles.bannerText}>
          <PaperText variant="labelSmall" numberOfLines={1} style={styles.eyebrow}>
            {promo.title}
          </PaperText>
          <PaperText variant="titleSmall" numberOfLines={2} style={styles.title}>
            {title}
          </PaperText>
          {!!subtitle && (
            <PaperText variant="bodySmall" numberOfLines={2} style={styles.description}>
              {subtitle}
            </PaperText>
          )}
        </View>
      </Banner>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 14,
    paddingHorizontal: 16,
  },
  banner: {
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "rgba(223,226,235,0.12)",
  },
  bannerContent: {
    minHeight: 96,
    alignItems: "center",
  },
  bannerIcon: {
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  bannerText: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    color: Colors.subtext,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  title: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  description: {
    color: "rgba(223,226,235,0.76)",
    fontFamily: "Inter_500Medium",
    letterSpacing: 0,
  },
});
