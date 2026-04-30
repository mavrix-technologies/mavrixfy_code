import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, AppState, Linking, Alert } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePlayer } from "@/contexts/PlayerContext";
import { router } from "expo-router";
import Colors from "@/constants/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Layout dimensions
const LAYOUT_DIMENSIONS = {
  hero: {
    width: SCREEN_WIDTH - 32,
    height: 180,
    borderRadius: 16,
  },
  card: {
    width: SCREEN_WIDTH - 32,
    height: 140,
    borderRadius: 12,
  },
  'full-width': {
    width: SCREEN_WIDTH,
    height: 120,
    borderRadius: 0,
  },
  sidebar: {
    width: (SCREEN_WIDTH - 48) / 2, // Half width minus padding
    height: 200,
    borderRadius: 12,
  },
};

type MediaType = "image" | "gif" | "video" | "audio";
type Platform = "web" | "app";
type BannerLayout = "hero" | "card" | "full-width" | "sidebar";
type ActionType = "none" | "external" | "song" | "playlist" | "artist" | "album";

interface AttachedSong {
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
  streamUrl: string;
}

interface Promotion {
  id: string;
  title: string;
  description: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  platforms?: Platform;
  status: "active" | "scheduled" | "ended";
  startDate?: string;
  endDate?: string;
  layout?: BannerLayout;
  actionType?: ActionType;
  actionUrl?: string;
  attachedSong?: AttachedSong;
  priority?: number;
}

const BRAND = {
  blue: "#26E19A",
  teal: "#26E19A",
  green: "#00B87B",
  ink900: "#10141A",
  ink800: "#181C22",
  ink700: "#262A31",
  textPrimary: "#DFE2EB",
  textSecondary: "rgba(223,226,235,0.9)",
  textMuted: "rgba(188,203,185,0.76)",
};

export default function PromotionBanner() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const { playSong, addToQueue } = usePlayer();

  useEffect(() => {
    fetchActivePromotions();
  }, []);

  // Monitor app state to pause rotation when app is in background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setIsVisible(nextAppState === 'active');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (promotions.length <= 1 || !isVisible) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % promotions.length);
    }, 8000); // Increased from 5s to 8s to reduce battery drain

    return () => clearInterval(interval);
  }, [promotions.length, isVisible]);

  const fetchActivePromotions = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      
      // Simplified query to avoid composite index requirement
      // Fetch active promotions for app platform (no orderBy to avoid index)
      const q = query(
        collection(db, "promotions"),
        where("status", "==", "active"),
        where("platforms", "==", "app"),
        limit(10) // Fetch more, then filter and sort in memory
      );

      const snapshot = await getDocs(q);
      const promos = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Promotion[];

      // Filter by date range if specified
      const validPromos = promos.filter((promo) => {
        const startValid = !promo.startDate || promo.startDate <= today;
        const endValid = !promo.endDate || promo.endDate >= today;
        return startValid && endValid;
      });

      // Sort by priority in memory (descending)
      validPromos.sort((a, b) => (b.priority || 0) - (a.priority || 0));

      // Take top 5
      setPromotions(validPromos.slice(0, 5));
    } catch (error) {
      console.error("[PromotionBanner] Error fetching promotions:", error);
      // Silently fail - banner just won't show
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDotPress = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const handleBannerPress = useCallback(async (promo: Promotion) => {
    const actionType = promo.actionType || "none";

    try {
      switch (actionType) {
        case "song":
          if (promo.attachedSong) {
            // Play the attached song with proper structure
            await playSong({
              id: promo.attachedSong.id,
              title: promo.attachedSong.title,
              artist: promo.attachedSong.artist,
              coverUrl: promo.attachedSong.imageUrl, // ✅ Changed from imageUrl to coverUrl
              audioUrl: promo.attachedSong.streamUrl, // ✅ Changed from streamUrl to audioUrl
              album: "", // Default empty album
              duration: 0, // Duration not stored in promotion
              genre: "",
              year: "",
              source: "promotion" as const,
            });
            console.log("[PromotionBanner] Playing song:", promo.attachedSong.title);
          } else {
            Alert.alert("Error", "No song attached to this promotion");
          }
          break;

        case "external":
          if (promo.actionUrl) {
            const supported = await Linking.canOpenURL(promo.actionUrl);
            if (supported) {
              await Linking.openURL(promo.actionUrl);
            } else {
              Alert.alert("Error", "Cannot open this link");
            }
          }
          break;

        case "playlist":
          if (promo.actionUrl) {
            // Extract playlist ID from URL or use actionUrl as ID
            const playlistId = promo.actionUrl.split("/").pop() || promo.actionUrl;
            router.push(`/playlist/${playlistId}`);
          }
          break;

        case "artist":
          if (promo.actionUrl) {
            // Extract artist ID from URL or use actionUrl as ID
            const artistId = promo.actionUrl.split("/").pop() || promo.actionUrl;
            router.push(`/artist/${artistId}`);
          }
          break;

        case "album":
          if (promo.actionUrl) {
            // You can implement album navigation if you have album pages
            console.log("[PromotionBanner] Album navigation:", promo.actionUrl);
            Alert.alert("Album", "Album page coming soon!");
          }
          break;

        case "none":
        default:
          // No action - just log
          console.log("[PromotionBanner] Promotion clicked (no action):", promo.title);
          break;
      }
    } catch (error) {
      console.error("[PromotionBanner] Error handling banner action:", error);
      Alert.alert("Error", "Failed to perform action");
    }
  }, [playSong]);

  if (loading || promotions.length === 0) {
    return null;
  }

  const currentPromo = promotions[currentIndex];
  const layout = currentPromo.layout || 'card'; // Default to card layout
  const dimensions = LAYOUT_DIMENSIONS[layout];

  return (
    <View style={[
      styles.container,
      layout === 'full-width' && styles.containerFullWidth,
    ]}>
      <Pressable
        style={({ pressed }) => [
          styles.banner,
          {
            width: dimensions.width,
            height: dimensions.height,
            borderRadius: dimensions.borderRadius,
          },
          layout === 'hero' && styles.bannerHero,
          layout === 'sidebar' && styles.bannerSidebar,
          pressed && styles.bannerPressed,
        ]}
        onPress={() => handleBannerPress(currentPromo)}
      >
        {currentPromo.mediaUrl ? (
          <>
            <Image
              source={{ uri: currentPromo.mediaUrl }}
              style={styles.bannerImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
            <LinearGradient
              colors={[
                "transparent",
                "rgba(16,20,26,0.4)",
                "rgba(16,20,26,0.85)",
              ]}
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
          <View style={styles.textContainer}>
            <Text 
              style={[
                styles.title,
                layout === 'hero' && { fontSize: 22, lineHeight: 28 },
                layout === 'sidebar' && { fontSize: 16, lineHeight: 20 },
              ]} 
              numberOfLines={layout === 'sidebar' ? 3 : 2}
            >
              {currentPromo.title}
            </Text>
            {currentPromo.description && (
              <Text 
                style={[
                  styles.description,
                  layout === 'hero' && { fontSize: 14, lineHeight: 20 },
                  layout === 'sidebar' && { fontSize: 12, lineHeight: 16 },
                ]} 
                numberOfLines={layout === 'sidebar' ? 3 : 2}
              >
                {currentPromo.description}
              </Text>
            )}
          </View>

          {currentPromo.mediaType && (
            <View style={styles.mediaTypeBadge}>
              {currentPromo.mediaType === "video" && (
                <Ionicons name="play-circle" size={14} color={BRAND.teal} />
              )}
              {currentPromo.mediaType === "audio" && (
                <Ionicons name="musical-notes" size={14} color={BRAND.teal} />
              )}
              {currentPromo.mediaType === "gif" && (
                <Ionicons name="images" size={14} color={BRAND.teal} />
              )}
            </View>
          )}
        </View>
      </Pressable>

      {promotions.length > 1 && (
        <View style={styles.dotsContainer}>
          {promotions.map((_, index) => (
            <Pressable
              key={index}
              onPress={() => handleDotPress(index)}
              hitSlop={8}
            >
              <View
                style={[
                  styles.dot,
                  index === currentIndex && styles.dotActive,
                ]}
              />
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
  containerFullWidth: {
    paddingHorizontal: 0,
  },
  banner: {
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  bannerHero: {
    // Hero banner - larger, more prominent
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  bannerSidebar: {
    // Sidebar - compact, vertical
    aspectRatio: 0.6,
  },
  bannerPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  bannerImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: "flex-end",
  },
  textContainer: {
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
