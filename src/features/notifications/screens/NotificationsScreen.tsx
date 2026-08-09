import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Linking,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { triggerImpact } from "@/lib/haptics";
import { showGlobalToast } from "@/utils/globalToast";
import { useAuth } from "@/contexts/AuthContext";
import {
  requestNotificationPermission,
  registerForPushNotificationsAsync,
} from "@/services/notificationService";
import {
  loadNotifications,
  getNotifications,
  subscribeNotifications,
  markNotificationAsRead,
  deleteNotification,
  syncFromFirestore,
  NotificationItem,
} from "@/stores/notificationStore";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(date.getTime()) || diffMs < 0) return "Just now";
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}h ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "1d ago";
    return `${diffDays}d ago`;
  } catch {
    return "Just now";
  }
}

function isThisWeek(isoString: string): boolean {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    return diffMs < 7 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function parseAppVersion(version: string) {
  return version
    .split(".")
    .map(Number)
    .reduce((acc, part, index) => acc + part * 10 ** (6 - index * 2), 0);
}

// ─── Suggested Artists ────────────────────────────────────────────────────────

const SUGGESTED_ARTISTS = [
  {
    id: "arijit",
    name: "Arijit Singh",
    subscribers: "6.21M subscribers",
    avatar: "https://c.saavncdn.com/artists/Arijit_Singh_500x500.jpg",
  },
  {
    id: "ap-dhillon",
    name: "AP Dhillon",
    subscribers: "2.4M subscribers",
    avatar: "https://c.saavncdn.com/artists/AP_Dhillon_500x500.jpg",
  },
  {
    id: "shreya",
    name: "Shreya Ghoshal",
    subscribers: "3.8M subscribers",
    avatar: "https://c.saavncdn.com/artists/Shreya_Ghoshal_500x500.jpg",
  },
];

// ─── Swipeable Row ────────────────────────────────────────────────────────────

function NotificationRow({
  item,
  onPress,
  onDelete,
}: {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
  onDelete: (id: string) => void;
}) {
  const slideX = useSharedValue(0);
  const rowHeight = useSharedValue(80);
  const rowOpacity = useSharedValue(1);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    height: rowHeight.value,
    opacity: rowOpacity.value,
    overflow: "hidden",
  }));

  const slideAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

  const revealDeleteGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(300)
        .onStart(() => {
          slideX.value = withSpring(-72, {
            damping: 10,
            stiffness: 120,
          });
          scheduleOnRN(triggerImpact, Haptics.ImpactFeedbackStyle.Light);
        }),
    [slideX]
  );

  const handleDelete = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    slideX.value = withTiming(-400, { duration: 220 });
    rowHeight.value = withTiming(0, { duration: 270 });
    rowOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
      if (finished) {
        scheduleOnRN(onDelete, item.id);
      }
    });
  }, [item.id, onDelete, slideX, rowHeight, rowOpacity]);

  const isUpdate = item.type === "update";
  const imageUri = item.imageUrl || item.meta?.imageUrl || item.meta?.coverUrl;

  return (
    <Animated.View style={containerAnimatedStyle}>
      {/* Red delete background */}
      <View style={styles.deleteBackground}>
        <Ionicons name="trash-outline" size={20} color="#fff" />
      </View>

      <Animated.View style={[styles.rowSlide, slideAnimatedStyle]}>
        <GestureDetector gesture={revealDeleteGesture}>
          <Pressable
            style={({ pressed }) => [styles.notifRow, pressed && { opacity: 0.75 }]}
            onPress={() => onPress(item)}
          >
          {/* Left: App Logo Icon */}
          <Image
            source={require("@/assets/images/mavrixfy_icone.png")}
            style={styles.leftAppIcon}
            contentFit="cover"
          />

          {/* Centre: title + body + time */}
          <View style={styles.notifText}>
            <Text style={styles.notifTitle} numberOfLines={2}>
              <Text style={styles.notifTitleBold}>{item.title}: </Text>
              {item.body}
            </Text>
            <View style={styles.timeBadgeContainer}>
              <Text style={styles.notifTime}>{getRelativeTime(item.timestamp)}</Text>
              {isUpdate && (
                <View style={styles.updateBadge}>
                  <Text style={styles.updateBadgeText}>App Update</Text>
                </View>
              )}
            </View>
          </View>

          {/* Right: action / thumbnail + three dots */}
          <View style={styles.notifRight}>
            {isUpdate ? (
              <View style={styles.updateActionBtn}>
                <Text style={styles.updateActionText}>Update</Text>
                <Ionicons name="logo-google-playstore" size={10} color="#000000" style={{ marginLeft: 2 }} />
              </View>
            ) : imageUri ? (
              <View style={styles.thumbStack}>
                <Image source={{ uri: imageUri }} style={styles.thumbBack} contentFit="cover" />
                <Image source={{ uri: imageUri }} style={styles.thumbFront} contentFit="cover" />
              </View>
            ) : null}
            <Pressable
              hitSlop={10}
              onPress={handleDelete}
              style={styles.threeDots}
            >
              <Ionicons name="ellipsis-vertical" size={18} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>
          </Pressable>
        </GestureDetector>
      </Animated.View>
    </Animated.View>
  );
}

function PromotionCard({
  item,
  onPress,
  onDelete,
}: {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
  onDelete: (id: string) => void;
}) {
  const slideX = useSharedValue(0);
  const rowHeight = useSharedValue(1000);
  const rowOpacity = useSharedValue(1);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    maxHeight: rowHeight.value,
    opacity: rowOpacity.value,
    overflow: "hidden",
    marginBottom: 12,
  }));

  const slideAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

  const revealDeleteGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(300)
        .onStart(() => {
          slideX.value = withSpring(-72, {
            damping: 10,
            stiffness: 120,
          });
          scheduleOnRN(triggerImpact, Haptics.ImpactFeedbackStyle.Light);
        }),
    [slideX]
  );

  const handleDelete = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    slideX.value = withTiming(-400, { duration: 220 });
    rowHeight.value = withTiming(0, { duration: 270 });
    rowOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
      if (finished) {
        scheduleOnRN(onDelete, item.id);
      }
    });
  }, [item.id, onDelete, slideX, rowHeight, rowOpacity]);

  const imageUri = item.imageUrl || item.meta?.imageUrl || item.meta?.coverUrl;

  return (
    <Animated.View style={containerAnimatedStyle}>
      {/* Red delete background */}
      <View style={styles.deleteBackground}>
        <Ionicons name="trash-outline" size={24} color="#fff" />
      </View>

      <Animated.View style={[styles.rowSlide, slideAnimatedStyle]}>
        <GestureDetector gesture={revealDeleteGesture}>
          <Pressable
            style={({ pressed }) => [styles.promoCard, pressed && { opacity: 0.95 }]}
            onPress={() => onPress(item)}
          >
          {/* Banner Image */}
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.promoBanner} contentFit="cover" />
          ) : (
            <View style={styles.promoBannerPlaceholder}>
              <Ionicons name="megaphone-outline" size={32} color="rgba(255,255,255,0.3)" />
            </View>
          )}

          {/* Text and Actions Overlay/Container */}
          <View style={styles.promoContent}>
            <View style={styles.promoHeader}>
              <Text style={styles.promoTime}>{getRelativeTime(item.timestamp)}</Text>
            </View>
            
            <Text style={styles.promoTitle}>
              {item.title}
            </Text>
            <Text style={styles.promoBody}>
              {item.body}
            </Text>

            {/* Custom CTA link button */}
            {item.meta?.route && (
              <View style={styles.promoActionRow}>
                <View style={styles.promoBtn}>
                  <Text style={styles.promoBtnText}>Check Out Now</Text>
                  <Ionicons name="arrow-forward" size={12} color="#000000" style={{ marginLeft: 4 }} />
                </View>
              </View>
            )}
          </View>
          
          {/* Top-right delete trigger dot */}
          <Pressable
            hitSlop={12}
            onPress={handleDelete}
            style={styles.promoDots}
          >
            <Ionicons name="ellipsis-vertical" size={18} color="rgba(255,255,255,0.6)" />
          </Pressable>
          </Pressable>
        </GestureDetector>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Artist Suggestion Row ───────────────────────────────────────────────────

function SuggestedArtistRow({
  artist,
}: {
  artist: (typeof SUGGESTED_ARTISTS)[0];
}) {
  const [subscribed, setSubscribed] = useState(false);

  return (
    <Pressable
      style={styles.artistRow}
      onPress={() => {
        router.push({ pathname: "/(tabs)/search", params: { q: artist.name } });
      }}
    >
      <Image
        source={{ uri: artist.avatar }}
        style={styles.artistAvatar}
        contentFit="cover"
      />
      <View style={styles.artistInfo}>
        <Text style={styles.artistName}>{artist.name}</Text>
        <Text style={styles.artistSubs}>{artist.subscribers}</Text>
      </View>
      <Pressable
        style={[styles.subscribeBtn, subscribed && styles.subscribeBtnActive]}
        onPress={() => {
          void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
          setSubscribed((v) => !v);
          showGlobalToast(subscribed ? `Unsubscribed from ${artist.name}` : `Subscribed to ${artist.name}`);
        }}
      >
        <Text style={[styles.subscribeBtnText, subscribed && styles.subscribeBtnTextActive]}>
          {subscribed ? "Subscribed" : "Subscribe"}
        </Text>
      </Pressable>
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, firebaseUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  // true = granted, false = denied/undetermined, null = checking
  const [permStatus, setPermStatus] = useState<"granted" | "denied" | "undetermined" | "checking">("checking");
  const [registering, setRegistering] = useState(false);

  const syncState = useCallback(() => {
    setNotifications([...getNotifications()]);
  }, []);

  // Load notifications
  useEffect(() => {
    loadNotifications()
      .then((items) => {
        setNotifications([...items]);
        if (firebaseUser?.uid) {
          void syncFromFirestore(firebaseUser.uid);
        }
      })
      .catch(() => {});
    const unsub = subscribeNotifications(syncState);
    return () => unsub();
  }, [syncState, firebaseUser?.uid]);

  // Check current OS permission status on mount
  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then(({ status }) => setPermStatus(status as "granted" | "denied" | "undetermined"))
      .catch(() => setPermStatus("undetermined"));
  }, []);

  // Save last notification screen viewed timestamp on mount
  useEffect(() => {
    void AsyncStorage.setItem("@Mavrixfy:lastNotificationScreenViewed", new Date().toISOString());
  }, []);

  const handleEnableNotifications = useCallback(async () => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);

    // If already denied → open OS settings
    if (permStatus === "denied") {
      showGlobalToast("Open Settings to allow notifications");
      await Linking.openSettings();
      // Re-check after returning
      const { status } = await Notifications.getPermissionsAsync();
      setPermStatus(status as "granted" | "denied" | "undetermined");
      return;
    }

    setRegistering(true);
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        setPermStatus("granted");
        // Register token if user is signed in
        if (firebaseUser?.uid) {
          await registerForPushNotificationsAsync(firebaseUser.uid);
        }
        showGlobalToast("Notifications enabled ✓");
      } else {
        setPermStatus("denied");
        showGlobalToast("Permission denied — check Settings");
      }
    } catch {
      showGlobalToast("Could not enable notifications");
    } finally {
      setRegistering(false);
    }
  }, [permStatus, firebaseUser?.uid]);

  const handleNotifPress = useCallback((item: NotificationItem) => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    if (!item.read) void markNotificationAsRead(item.id);
    if (item.type === "update") {
      const storeUrl = "https://play.google.com/store/apps/details?id=com.mavrixfy.app";
      Linking.openURL(storeUrl).catch(() => {});
      return;
    }
    const targetRoute = item.meta?.route || item.meta?.deeplink;
    if (targetRoute) {
      if (targetRoute.startsWith("http")) {
        Linking.openURL(targetRoute).catch(() => {});
      } else {
        safeGoBack();
        setTimeout(() => {
          router.push(targetRoute as any);
        }, 200);
      }
      return;
    }
    if (item.meta?.artistName) {
      safeGoBack();
      setTimeout(() => {
        router.push({ pathname: "/(tabs)/search", params: { q: item.meta?.artistName } });
      }, 200);
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    void deleteNotification(id, firebaseUser?.uid);
  }, [firebaseUser?.uid]);

  // Group notifications
  const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
  const filteredNotifs = useMemo(() => notifications.filter((n) => {
    if (n.type === "update" && n.meta?.maxAppVersion) {
      try {
        const current = parseAppVersion(currentVersion);
        const maxTarget = parseAppVersion(n.meta.maxAppVersion);
        if (current >= maxTarget) {
          return false;
        }
      } catch {}
    }
    return true;
  }), [currentVersion, notifications]);

  const thisWeek = useMemo(() => filteredNotifs.filter((n) => isThisWeek(n.timestamp)), [filteredNotifs]);
  const older = useMemo(() => filteredNotifs.filter((n) => !isThisWeek(n.timestamp)), [filteredNotifs]);
  const bottomContentInset = insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable onPress={safeGoBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Activity</Text>
        {isAuthenticated && user?.picture ? (
          <Pressable onPress={() => router.push("/profile")} style={styles.headerAvatar}>
            <Image source={{ uri: user.picture }} style={styles.avatarImg} contentFit="cover" />
          </Pressable>
        ) : (
          <View style={styles.headerAvatar}>
            <Ionicons name="person-circle" size={32} color="rgba(255,255,255,0.55)" />
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        contentInset={{ bottom: bottomContentInset }}
        scrollIndicatorInsets={{ bottom: bottomContentInset }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Turn on notifications banner ───────────────────────────── */}
        {permStatus !== "granted" && permStatus !== "checking" && (
          <View style={styles.notifBanner}>
            <View style={styles.notifBannerText}>
              <Text style={styles.notifBannerTitle}>
                {permStatus === "denied" ? "Notifications are off" : "Turn on notifications"}
              </Text>
              <Text style={styles.notifBannerSub}>
                {permStatus === "denied"
                  ? "Go to Settings and enable notifications for Mavrixfy"
                  : "Stay up to date on new releases, recommendations and more"}
              </Text>
            </View>
            <Pressable
              style={[styles.notifBannerArrow, registering && { opacity: 0.6 }]}
              onPress={() => void handleEnableNotifications()}
              disabled={registering}
            >
              <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        )}

        {/* ── This week ──────────────────────────────────────────────── */}
        {thisWeek.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>This week</Text>
            {thisWeek.map((item) => (
              item.type === "promotion" ? (
                <PromotionCard
                  key={item.id}
                  item={item}
                  onPress={handleNotifPress}
                  onDelete={handleDelete}
                />
              ) : (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onPress={handleNotifPress}
                  onDelete={handleDelete}
                />
              )
            ))}
          </View>
        )}

        {/* ── Older ──────────────────────────────────────────────────── */}
        {older.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>Earlier</Text>
            {older.map((item) => (
              item.type === "promotion" ? (
                <PromotionCard
                  key={item.id}
                  item={item}
                  onPress={handleNotifPress}
                  onDelete={handleDelete}
                />
              ) : (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onPress={handleNotifPress}
                  onDelete={handleDelete}
                />
              )
            ))}
          </View>
        )}

        {/* ── Empty activity state ────────────────────────────────────── */}
        {notifications.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="notifications-outline" size={40} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyText}>No activity yet</Text>
            <Text style={styles.emptySub}>Songs, playlists and artists you engage with will show up here</Text>
          </View>
        )}

        {/* ── Suggested for you ────────────────────────────────────────── */}
        <View style={styles.suggestedSection}>
          <Text style={styles.suggestedTitle}>Suggested for you</Text>
          {SUGGESTED_ARTISTS.map((artist) => (
            <SuggestedArtistRow key={artist.id} artist={artist} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 56,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginLeft: 4,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Turn on notifications banner
  notifBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 20,
    padding: 16,
    gap: 12,
  },
  notifBannerText: {
    flex: 1,
  },
  notifBannerTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  notifBannerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 18,
  },
  notifBannerArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // Section label
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.5)",
    marginHorizontal: 14,
    marginTop: 16,
    marginBottom: 8,
  },

  // Notification rows
  deleteBackground: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: "#C62828",
    alignItems: "center",
    justifyContent: "center",
  },
  rowSlide: {
    backgroundColor: "#000000",
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 80,
  },
  playCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FF0000",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  notifText: {
    flex: 1,
    justifyContent: "center",
    marginRight: 12,
  },
  notifTitle: {
    fontSize: 13.5,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.88)",
    lineHeight: 18,
    marginBottom: 4,
  },
  notifTitleBold: {
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  notifTime: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)",
  },
  notifRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  thumbStack: {
    width: 56,
    height: 56,
    position: "relative",
  },
  thumbBack: {
    position: "absolute",
    right: 0,
    top: 4,
    width: 44,
    height: 44,
    borderRadius: 4,
    opacity: 0.65,
  },
  thumbFront: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 46,
    height: 46,
    borderRadius: 4,
  },
  thumbPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  threeDots: {
    width: 28,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  // Empty state
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingTop: 48,
    paddingBottom: 24,
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    lineHeight: 18,
  },

  // Suggested for you
  suggestedSection: {
    marginTop: 32,
    paddingHorizontal: 14,
  },
  suggestedTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  artistAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  artistInfo: {
    flex: 1,
    justifyContent: "center",
  },
  artistName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  artistSubs: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  subscribeBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "transparent",
  },
  subscribeBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: "transparent",
  },
   subscribeBtnText: {
     fontSize: 13,
     fontFamily: "Inter_600SemiBold",
     color: "#FFFFFF",
   },
   subscribeBtnTextActive: {
     color: Colors.primary,
   },
   updatePlayCircle: {
     backgroundColor: "rgba(38, 225, 154, 0.15)",
     borderWidth: 1,
     borderColor: "rgba(38, 225, 154, 0.3)",
   },
   timeBadgeContainer: {
     flexDirection: "row",
     alignItems: "center",
     gap: 8,
     marginTop: 4,
   },
   updateBadge: {
     backgroundColor: "rgba(38, 225, 154, 0.12)",
     paddingHorizontal: 6,
     paddingVertical: 1.5,
     borderRadius: 4,
     borderWidth: 0.5,
     borderColor: "rgba(38, 225, 154, 0.25)",
   },
   updateBadgeText: {
     fontSize: 9.5,
     fontFamily: "Inter_600SemiBold",
     color: "#26E19A",
     textTransform: "uppercase",
     letterSpacing: 0.5,
   },
   updateActionBtn: {
     flexDirection: "row",
     alignItems: "center",
     backgroundColor: "#26E19A",
     paddingHorizontal: 10,
     paddingVertical: 5,
     borderRadius: 12,
   },
   updateActionText: {
     fontSize: 11,
     fontFamily: "Inter_700Bold",
     color: "#000000",
   },
    leftAppIcon: {
      width: 44,
      height: 44,
      borderRadius: 10,
      marginRight: 12,
      flexShrink: 0,
    },
    leftIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      flexShrink: 0,
    },
    updateIconBg: {
      backgroundColor: "rgba(38, 225, 154, 0.12)",
      borderWidth: 1,
      borderColor: "rgba(38, 225, 154, 0.25)",
    },
    musicIconBg: {
      backgroundColor: "rgba(38, 225, 154, 0.12)",
      borderWidth: 1,
      borderColor: "rgba(38, 225, 154, 0.25)",
    },
    purpleIconBg: {
      backgroundColor: "rgba(167, 139, 250, 0.12)",
      borderWidth: 1,
      borderColor: "rgba(167, 139, 250, 0.25)",
    },
    systemIconBg: {
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.12)",
    },
    promoCard: {
      backgroundColor: "rgba(255, 255, 255, 0.04)",
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.08)",
      marginHorizontal: 14,
    },
    promoBanner: {
      width: "100%",
      aspectRatio: 16 / 9,
      backgroundColor: "rgba(255,255,255,0.05)",
    },
    promoBannerPlaceholder: {
      width: "100%",
      aspectRatio: 16 / 9,
      backgroundColor: "rgba(255,255,255,0.05)",
      alignItems: "center",
      justifyContent: "center",
    },
    promoContent: {
      padding: 12,
    },
    promoHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    promoBadge: {
      backgroundColor: "rgba(236, 72, 153, 0.12)",
      paddingHorizontal: 6,
      paddingVertical: 2.5,
      borderRadius: 4,
      borderWidth: 0.5,
      borderColor: "rgba(236, 72, 153, 0.3)",
    },
    promoBadgeText: {
      fontSize: 8.5,
      fontFamily: "Inter_700Bold",
      color: "#EC4899",
      letterSpacing: 0.5,
    },
    promoTime: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.4)",
    },
    promoTitle: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: "#FFFFFF",
      marginBottom: 4,
    },
    promoBody: {
      fontSize: 12.5,
      fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.65)",
      lineHeight: 18,
    },
    promoActionRow: {
      marginTop: 10,
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    promoBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#FFFFFF",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    promoBtnText: {
      fontSize: 10.5,
      fontFamily: "Inter_700Bold",
      color: "#000000",
    },
    promoDots: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
    },
  });

export default NotificationsScreen;
