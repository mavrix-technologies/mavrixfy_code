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

const BANNER_HEIGHT = 140;
const ROTATION_INTERVAL_MS = 8_000;

const subscribeToAppStateChanges = (listener: (state: AppStateStatus) => void) => {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
};

type MediaType   = "image" | "gif" | "video" | "audio";
type AppPlatform = "web" | "app";
type ActionType  = "none" | "external" | "song" | "playlist" | "artist";

interface AttachedSong {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;   // was imageUrl — matches Song type
  audioUrl: string;   // was streamUrl — matches Song type
}

interface Promotion {
  id: string;
  title: string;
  description: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  platforms?: AppPlatform;
  status: "active" | "scheduled" | "ended";
  startDate?: string;
  endDate?: string;
  actionType?: ActionType;
  actionUrl?: string;
  attachedSong?: AttachedSong;
  priority?: number;
}

const BRAND = {
  teal:          "#26E19A",
  textPrimary:   "#DFE2EB",
  textSecondary: "rgba(223,226,235,0.9)",
};

export default function PromotionBanner() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading]     = useState(true);
  const isVisibleRef = React.useRef(true);
  const { playSong } = usePlayerActions();
  const { width } = useWindowDimensions();
  const bannerWidth = Math.max(0, width - 32);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const today = new Date().toISOString().split("T")[0];

    // Query only on indexed fields (status + platforms).
    // Sorting by priority is done client-side to avoid requiring a composite index.
    const q = query(
      collection(db, "promotions"),
      where("status",    "==", "active"),
      where("platforms", "==", "app"),
      limit(10)
    );

    getDocs(q)
      .then((snapshot) => {
        if (!active) return;
        const promos = mapFilter(snapshot.docs, (doc) => ({ id: doc.id, ...doc.data() } as Promotion), (p) => {
            const startOk = !p.startDate || p.startDate <= today;
            const endOk   = !p.endDate   || p.endDate   >= today;
            return startOk && endOk;
          })
          // Client-side sort by priority descending
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          .slice(0, 5);

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
            coverUrl: promo.attachedSong.coverUrl,
            audioUrl: promo.attachedSong.audioUrl,
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
          const id = promo.actionUrl.split("/").pop() ?? promo.actionUrl;
          router.push(`/playlist/${id}` as any);
        }
        break;

      case "artist":
        if (promo.actionUrl) {
          const id = promo.actionUrl.split("/").pop() ?? promo.actionUrl;
          router.push(`/artist/${id}` as any);
        }
        break;

      default:
        break;
    }
  }, [playSong]);

  if (loading || promotions.length === 0) return null;

  const promo = promotions[currentIndex];

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [styles.banner, { width: bannerWidth }, pressed && styles.bannerPressed]}
        onPress={() => handlePress(promo)}
      >
        {promo.mediaUrl ? (
          <>
            <Image
              source={{ uri: promo.mediaUrl }}
              style={styles.bannerImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
            <LinearGradient
              colors={["transparent", "rgba(16,20,26,0.4)", "rgba(16,20,26,0.85)"]}
              locations={[0, 0.5, 1]}
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
          <Text style={styles.title} numberOfLines={2}>{promo.title}</Text>
          {!!promo.description && (
            <Text style={styles.description} numberOfLines={2}>{promo.description}</Text>
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
    paddingHorizontal: 16,
  },
  banner: {
    height: BANNER_HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  bannerPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: "flex-end",
    gap: 4,
  },
  title: {
    color: BRAND.textPrimary,
    fontSize: 18,
    lineHeight: 24,
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
