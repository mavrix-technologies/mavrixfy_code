import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, AppState, Linking, useWindowDimensions, type AppStateStatus } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { mapFilter } from "@/lib/arrayUtils";

const BANNER_HEIGHT = 128;
const ROTATION_INTERVAL_MS = 8_000;

const subscribeToAppStateChanges = (listener: (state: AppStateStatus) => void) => {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
};

type MediaType   = "image" | "gif" | "video" | "audio";
type AppPlatform = "web" | "app";
type ActionType  = "none" | "external" | "song" | "playlist" | "artist" | "album";
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

interface Promotion {
  id: string;
  title: string;
  description: string;
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
  visibilityMode?: VisibilityMode;
}

const BRAND = {
  teal:          "#26E19A",
  textPrimary:   "#DFE2EB",
  textSecondary: "rgba(223,226,235,0.9)",
};

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

export default function PromotionBanner() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [failedMediaIds, setFailedMediaIds] = useState<Record<string, boolean>>({});
  const isVisibleRef = React.useRef(true);
  const { playSong } = usePlayerActions();
  const { width } = useWindowDimensions();
  const bannerWidth = Math.max(0, width - 16);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const today = new Date().toISOString().split("T")[0];

    // Query only on status; platform filtering is client-side so "both" works for app and web.
    const q = query(
      collection(db, "promotions"),
      where("status",    "==", "active"),
      limit(10)
    );

    getDocs(q)
      .then((snapshot) => {
        if (!active) return;
        const promos = mapFilter(snapshot.docs, (doc) => ({ id: doc.id, ...doc.data() } as Promotion), (p) => {
            const startOk = !p.startDate || p.startDate <= today;
            const endOk   = !p.endDate   || p.endDate   >= today;
            const platformOk = isForApp(p.platforms);
            const isModal = p.placement === "home_modal" || p.layout === "modal";
            const visibleInBuild = (p.visibilityMode || "public") !== "dev" || __DEV__;
            return startOk && endOk && platformOk && !isModal && visibleInBuild;
          })
          // Client-side sort by priority descending
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          .slice(0, 1);

        setPromotions(promos);
      })
      .catch(() => {
        // Silent fail — banner is non-critical
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // ── Pause rotation when app is backgrounded ────────────────────────────────
  useEffect(() => {
    return subscribeToAppStateChanges((state) => {
      isVisibleRef.current = state === "active";
    });
  }, []);

  // ── Auto-rotate ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (promotions.length <= 1) return;
    const id = setInterval(
      () => {
        if (isVisibleRef.current) {
          setCurrentIndex((prev) => (prev + 1) % promotions.length);
        }
      },
      ROTATION_INTERVAL_MS
    );
    return () => clearInterval(id);
  }, [promotions.length]);

  // ── Action handler ─────────────────────────────────────────────────────────
  const handlePress = useCallback(async (promo: Promotion) => {
    switch (promo.actionType ?? "none") {
      case "song":
        if (promo.attachedSong) {
          playSong({
            id:       promo.attachedSong.id,
            title:    promo.attachedSong.title,
            artist:   promo.attachedSong.artist,
            coverUrl: promo.attachedSong.coverUrl || promo.attachedSong.imageUrl || "",
            audioUrl: promo.attachedSong.audioUrl || promo.attachedSong.streamUrl || "",
            duration: 0,
          } as any);
        }
        break;

      case "external":
        if (promo.actionUrl) {
          const ok = await Linking.canOpenURL(promo.actionUrl).catch(() => false);
          if (ok) Linking.openURL(promo.actionUrl).catch(() => {});
        }
        break;

      case "playlist":
        if (promo.actionUrl) {
          const id = getRouteId(promo.actionUrl);
          router.push(`/playlist/${id}` as any);
        }
        break;

      case "artist":
        if (promo.actionUrl) {
          const id = getRouteId(promo.actionUrl);
          router.push(`/artist/${id}` as any);
        }
        break;

      case "album":
        if (promo.actionUrl?.startsWith("http")) {
          const ok = await Linking.canOpenURL(promo.actionUrl).catch(() => false);
          if (ok) Linking.openURL(promo.actionUrl).catch(() => {});
        }
        break;

      default:
        break;
    }
  }, [playSong]);

  if (loading || promotions.length === 0) return null;

  const promo = promotions[currentIndex];
  const mediaUrl = (promo.mediaUrl || promo.targetImageUrl || promo.attachedSong?.coverUrl || promo.attachedSong?.imageUrl || "").trim();
  const showMedia = Boolean(mediaUrl) && !failedMediaIds[promo.id];
  const title = promo.targetTitle || promo.attachedSong?.title || promo.title;
  const subtitle = promo.description || promo.targetSubtitle || promo.attachedSong?.artist;

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [styles.banner, { width: bannerWidth }, pressed && styles.bannerPressed]}
        onPress={() => handlePress(promo)}
      >
        {showMedia ? (
          <>
            <Image
              source={{ uri: mediaUrl }}
              style={styles.bannerImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              recyclingKey={`${promo.id}:${mediaUrl}`}
              onError={() => setFailedMediaIds((prev) => ({ ...prev, [promo.id]: true }))}
            />
            <LinearGradient
              colors={["rgba(17,22,29,0.02)", "rgba(17,22,29,0.48)", "rgba(17,22,29,0.94)"]}
              locations={[0, 0.48, 1]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : (
          <LinearGradient
            colors={["#1a2332", "#0f1419"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        <View style={styles.content}>
          <Text style={styles.eyebrow} numberOfLines={1}>{promo.title}</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {!!subtitle && (
            <Text style={styles.description} numberOfLines={1}>{subtitle}</Text>
          )}
        </View>

        {promo.mediaType && promo.mediaType !== "image" && (
          <View style={styles.mediaTypeBadge}>
            <Ionicons
              name={
                promo.mediaType === "video" ? "play-circle"
                : promo.mediaType === "audio" ? "musical-notes"
                : "images"
              }
              size={14}
              color={BRAND.teal}
            />
          </View>
        )}
        <View style={styles.openPill}>
          <Text style={styles.openPillText}>Open</Text>
          <Ionicons name="chevron-forward" size={13} color={Colors.black} />
        </View>
      </Pressable>

      {promotions.length > 1 && (
        <View style={styles.dotsContainer}>
          {promotions.map((promotion, i) => (
            <Pressable key={promotion.id} onPress={() => setCurrentIndex(i)} hitSlop={8}>
              <View style={[styles.dot, i === currentIndex && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingHorizontal: 8,
  },
  banner: {
    height: BANNER_HEIGHT,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.24)",
    backgroundColor: "#11161D",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  bannerPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 14,
    justifyContent: "flex-end",
    gap: 3,
    paddingRight: 86,
  },
  eyebrow: {
    color: BRAND.teal,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: BRAND.textPrimary,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  description: {
    color: BRAND.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
  },
  mediaTypeBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(16,20,26,0.7)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.3)",
  },
  openPill: {
    position: "absolute",
    right: 12,
    bottom: 14,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: BRAND.teal,
  },
  openPillText: {
    color: Colors.black,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(223,226,235,0.3)",
  },
  dotActive: {
    width: 20,
    backgroundColor: BRAND.teal,
  },
});
