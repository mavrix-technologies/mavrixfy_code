import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Share,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Easing
} from "react-native";
// react-doctor-disable-next-line rn-prefer-reanimated -- every animation below uses useNativeDriver.
import { Animated } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "expo-router";
import { CleanYouTubePlayer } from "react-native-clean-youtube-iframe";

import { usePlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackPlayState } from "@/lib/playbackEngine";

import { PingPongScroll } from "@/components/PingPongScroll";
import { Song } from "@/lib/musicData";

import { searchYouTubeMusicVideos } from "@/lib/youtubeMusicService";


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const MUSIC_ICONS = ["🎵", "🎶", "🎵", "♩", "♪"];

interface NoteItem {
  id: number;
  icon: string;
  animX: Animated.Value;
  animY: Animated.Value;
  animOpacity: Animated.Value;
  animScale: Animated.Value;
}

const FloatingNotes = React.memo(({ isPlaying }: { isPlaying: boolean }) => {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (!isPlaying) {
      setNotes([]);
      return;
    }

    const interval = setInterval(() => {
      const id = idRef.current++;
      const icon = MUSIC_ICONS[Math.floor(Math.random() * MUSIC_ICONS.length)];

      const animX = new Animated.Value(0);
      const animY = new Animated.Value(0);
      const animOpacity = new Animated.Value(1);
      const animScale = new Animated.Value(0.5);

      const note: NoteItem = { id, icon, animX, animY, animOpacity, animScale };
      setNotes(curr => [...curr, note]);

      Animated.parallel([
        Animated.timing(animY, {
          toValue: -120,
          duration: 2500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true
        }),
        Animated.sequence([
          Animated.timing(animX, {
            toValue: Math.random() > 0.5 ? -25 : -50,
            duration: 1250,
            easing: Easing.sin,
            useNativeDriver: true
          }),
          Animated.timing(animX, {
            toValue: Math.random() > 0.5 ? -45 : -70,
            duration: 1250,
            easing: Easing.sin,
            useNativeDriver: true
          })
        ]),
        Animated.timing(animScale, {
          toValue: 1.1,
          duration: 2500,
          useNativeDriver: true
        }),
        Animated.sequence([
          Animated.timing(animOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true
          }),
          Animated.timing(animOpacity, {
            toValue: 0,
            duration: 2100,
            useNativeDriver: true
          })
        ])
      ]).start(() => {
        setNotes(curr => curr.filter(n => n.id !== id));
      });
    }, 1400);

    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {notes.map(note => (
        <Animated.Text
          key={note.id}
          style={[
            styles.floatingNote,
            {
              transform: [
                { translateX: note.animX },
                { translateY: note.animY },
                { scale: note.animScale }
              ],
              opacity: note.animOpacity
            }
          ]}
        >
          {note.icon}
        </Animated.Text>
      ))}
    </View>
  );
});

FloatingNotes.displayName = "FloatingNotes";



export interface ShortItemType {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  author: string;
  avatar: string;
  likes: string;
  comments: string;
  description: string;
  song: Song;
  startOffset: number;
}

// Dynamic Recommendation/Suggestion Engine for Explore Screen queries
const getDynamicExploreQuery = (category: "LATEST" | "TRENDING" | "POPULAR"): string => {
  const artists = [
    "Arijit Singh", "Diljit Dosanjh", "Karan Aujla", "Sidhu Moose Wala", "Badshah",
    "Yo Yo Honey Singh", "Neha Kakkar", "Jubin Nautiyal", "Shreya Ghoshal", "Sonu Nigam",
    "Armaan Malik", "Divine", "Emiway Bantai", "MC Stan", "King", "AP Dhillon",
    "Sid Sriram", "Jonita Gandhi", "Anirudh Ravichander", "Devi Sri Prasad", "Thaman S",
    "A.R. Rahman", "Jasleen Royal", "Darshan Raval", "Prateek Kuhad", "Amit Trivedi",
    "Vishal Dadlani", "Pritam", "Sunidhi Chauhan", "Alan Walker", "Justin Bieber",
    "Marshmello", "Selena Gomez", "Ed Sheeran", "The Weeknd"
  ];

  const genres = [
    "Bollywood", "Punjabi Music", "Indie Pop India", "Telugu Hits", "Tamil Hits",
    "Desi Hip Hop", "Romantic Hindi", "Sad Songs India", "Lofi Beats Hindi",
    "Mashup India", "Dance Party India", "Sufi Beats", "Indipop"
  ];

  const trends = [
    "trending on reels india", "viral reels hits", "charts top hits india",
    "most played songs india", "instagram viral songs", "billboard india",
    "youtube trending music india"
  ];

  const modifiers = [
    "latest songs", "popular hits", "new releases", "unplugged session",
    "live performance", "retro mix", "party hits", "lofi mix", "remix"
  ];

  const randomOf = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  if (category === "LATEST") {
    const useArtist = Math.random() > 0.5;
    if (useArtist) {
      return `${randomOf(artists)} latest songs 2026`;
    } else {
      return `new releases ${randomOf(genres)} 2026`;
    }
  } else if (category === "TRENDING") {
    const type = Math.floor(Math.random() * 3);
    if (type === 0) {
      return `${randomOf(genres)} ${randomOf(trends)}`;
    } else if (type === 1) {
      return `${randomOf(artists)} trending songs`;
    } else {
      return `viral ${randomOf(genres)} mashup 2026`;
    }
  } else {
    const useArtist = Math.random() > 0.5;
    if (useArtist) {
      return `${randomOf(artists)} ${randomOf(modifiers)}`;
    } else {
      return `${randomOf(genres)} ${randomOf(modifiers)}`;
    }
  }
};

// Pre-computed portrait iframe dimensions for center-crop fill (no rotation)
// The iframe is rendered wider than the screen and centered so the landscape video
// fills the full portrait screen height with side-crop (cover fill)
const ZOOM_FACTOR = 1.35;
const PORTRAIT_IFRAME_H = Math.ceil(SCREEN_HEIGHT * ZOOM_FACTOR);
const PORTRAIT_IFRAME_W = Math.ceil(PORTRAIT_IFRAME_H * (16 / 9)); // 16:9 at zoomed height
const PORTRAIT_IFRAME_LEFT = -Math.floor((PORTRAIT_IFRAME_W - SCREEN_WIDTH) / 2);
const PORTRAIT_IFRAME_TOP = -Math.floor((PORTRAIT_IFRAME_H - SCREEN_HEIGHT) / 2);

interface ShortItemProps {
  item: ShortItemType;
  isActive: boolean;
  shouldLoad: boolean;
  isScreenFocused: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenComments: (id: string) => void;
  onPlayFullSong: (song: Song) => void;
  commentsCount: number;
}

type ShortComment = {
  id: string;
  user: string;
  text: string;
  time: string;
  likes: number;
};

const renderCommentItem = ({ item: comment }: { item: ShortComment }) => (
  <View style={styles.commentRow}>
    <View style={styles.commentAvatarBox}>
      <Text style={styles.commentAvatarText}>
        {comment.user.replace("@", "").slice(0, 2).toUpperCase()}
      </Text>
    </View>
    <View style={styles.commentBody}>
      <View style={styles.commentUserRow}>
        <Text style={styles.commentUser}>{comment.user}</Text>
        <Text style={styles.commentTime}>{comment.time}</Text>
      </View>
      <Text style={styles.commentText}>{comment.text}</Text>
    </View>
    <Pressable style={styles.commentLikeBtn}>
      <Ionicons name="heart-outline" size={14} color="#8e8e93" />
      <Text style={styles.commentLikeCount}>{comment.likes}</Text>
    </Pressable>
  </View>
);

// react-doctor-disable-next-line no-giant-component, no-many-boolean-props -- a Short needs its playback controls and visual overlays to share one lifecycle.
const ShortItem = React.memo(({
  item,
  isActive,
  shouldLoad,
  isScreenFocused,
  isMuted,
  onToggleMute,
  onOpenComments,
  onPlayFullSong,
  commentsCount
}: ShortItemProps) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);

  const insets = useSafeAreaInsets();
  const lastTapRef = useRef(0);
  const playerRef = useRef<any>(null);

  const handleStateChange = useCallback((state: string) => {
    if (state === "playing") {
      setHasStartedPlaying(true);
      setIsBuffering(false);
    } else if (state === "buffering" || state === "unstarted") {
      setIsBuffering(true);
    } else {
      setIsBuffering(false);
    }

    if (state === "ended") {
      playerRef.current?.seekTo?.(item.startOffset || 0, true);
    }
  }, [item.startOffset]);

  // Animations
  const [heartScale] = useState(() => new Animated.Value(0));
  const [heartOpacity] = useState(() => new Animated.Value(0));
  const [discRotation] = useState(() => new Animated.Value(0));
  const discAnim = useRef<Animated.CompositeAnimation | null>(null);

  // Rotate vinyl disc if video is active and playing
  useEffect(() => {
    if (isActive && isPlaying && videoReady) {
      discRotation.setValue(0);
      discAnim.current = Animated.loop(
        Animated.timing(discRotation, {
          toValue: 1,
          duration: 4000,
          easing: Easing.linear,
          useNativeDriver: true
        })
      );
      discAnim.current.start();
    } else {
      if (discAnim.current) {
        discAnim.current.stop();
      }
    }
    return () => {
      if (discAnim.current) {
        discAnim.current.stop();
      }
    };
  }, [discRotation, isActive, isPlaying, videoReady]);

  // Reset playback state when FlatList reassigns an existing row to a new active item.
  useEffect(() => {
    if (isActive) {
      if (isScreenFocused) {
        // react-doctor-disable-next-line no-adjust-state-on-prop-change -- this is an external playback lifecycle transition, not derived display state.
        setIsPlaying(true);
      } else {
        // react-doctor-disable-next-line no-adjust-state-on-prop-change -- this is an external playback lifecycle transition, not derived display state.
        setIsPlaying(false);
      }
    } else {
      // react-doctor-disable-next-line no-adjust-state-on-prop-change -- this is an external playback lifecycle transition, not derived display state.
      setIsPlaying(false);
      // react-doctor-disable-next-line no-adjust-state-on-prop-change -- inactive rows must release their player state.
      setVideoReady(false);
      // react-doctor-disable-next-line no-adjust-state-on-prop-change -- inactive rows must release their player state.
      setHasStartedPlaying(false);
      // react-doctor-disable-next-line no-adjust-state-on-prop-change -- inactive rows must release their player state.
      setIsBuffering(true);
    }
  }, [isActive, isScreenFocused]);

  const handleLike = useCallback(() => {
    setIsLiked(prev => !prev);
  }, []);

  const triggerDoubleTapLike = useCallback(() => {
    if (!isLiked) {
      handleLike();
    }

    // Heart pop-up animation
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, {
        toValue: 1.3,
        friction: 3,
        useNativeDriver: true
      }),
      Animated.timing(heartOpacity, {
        toValue: 0,
        duration: 900,
        useNativeDriver: true
      })
    ]).start();
  }, [heartOpacity, heartScale, isLiked, handleLike]);

  const handleVideoPress = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap -> Like
      triggerDoubleTapLike();
    } else {
      // Single tap -> Play/Pause
      lastTapRef.current = now;
      setTimeout(() => {
        if (Date.now() - lastTapRef.current >= DOUBLE_TAP_DELAY) {
          setIsPlaying(curr => !curr);
        }
      }, DOUBLE_TAP_DELAY);
    }
  }, [triggerDoubleTapLike]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Check out this music short preview of "${item.title}" by ${item.artist} on Mavrixfy! https://youtu.be/${item.videoId}`,
      });
    } catch (error) {
      console.warn("Error sharing short: ", error);
    }
  }, [item]);

  // Adjust bottom offset to prevent overlap with standard navigation overlays
  const bottomOffset = insets.bottom + 65;

  // Spinner/Loader overlay
  const showSpinner = isActive && (isBuffering || !videoReady);

  return (
    <View style={[styles.card, { height: SCREEN_HEIGHT }]}>
      {/* Full-screen portrait iframe */}
      <Pressable onPress={handleVideoPress} style={styles.videoPressArea}>
        <View style={styles.playerContainer}>
          {/* Landscape YouTube iframe rotated 90° and scaled to cover portrait screen */}
          {/* Landscape YouTube iframe loaded in background and shown when ready */}
          {shouldLoad && (
            <View
              pointerEvents="none"
              style={[
                styles.playerAbsoluteWrapper,
                {
                  width: PORTRAIT_IFRAME_W,
                  height: PORTRAIT_IFRAME_H,
                  left: PORTRAIT_IFRAME_LEFT,
                  top: PORTRAIT_IFRAME_TOP,
                  opacity: (isActive && hasStartedPlaying) ? 1 : 0
                }
              ]}
            >
              <CleanYouTubePlayer
                ref={playerRef}
                play={isActive && isPlaying}
                mute={isMuted}
                videoId={item.videoId}
                onReady={() => setVideoReady(true)}
                onStateChange={(state) => {
                  const states: Record<number, string> = {
                    1: "playing",
                    2: "paused",
                    3: "buffering",
                    0: "ended",
                  };
                  handleStateChange(states[state] || "unstarted");
                }}
                cropTopPercent={12}
                cropBottomPercent={12}
                style={{
                  width: PORTRAIT_IFRAME_W,
                  height: PORTRAIT_IFRAME_H,
                }}
              />
            </View>
          )}

          {/* High-quality cover thumbnail: remains visible until video is fully playing to prevent black flickering and hide YouTube play button */}
          {(!isActive || !hasStartedPlaying) && (
            <Image
              source={{ uri: `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg` }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
            />
          )}

          {/* Touch Shield: Intercepts all direct WebView touches to 100% block YouTube controls from appearing */}
          <View style={StyleSheet.absoluteFillObject} />

          {/* Semi-transparent dark gradients to ensure text readability */}
          <LinearGradient
            colors={["rgba(0,0,0,0.45)", "transparent", "rgba(0,0,0,0.68)"]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* Double tap Heart Anim */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.centerIndicator,
              {
                opacity: heartOpacity,
                transform: [{ scale: heartScale }]
              }
            ]}
          >
            <Ionicons name="heart" size={110} color="#ff3b30" />
          </Animated.View>

          {/* Play/Pause indicator overlay: Shows persistent play icon when paused, matching Reels/TikTok */}
          {!isPlaying && (
            <View style={styles.centerIndicator} pointerEvents="none">
              <View style={styles.playPausePill}>
                <Ionicons
                  name="play"
                  size={34}
                  color="#FFFFFF"
                  style={{ marginLeft: 4 }}
                />
              </View>
            </View>
          )}

          {/* Loading Indicator spinner */}
          {showSpinner && (
            <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
              <ActivityIndicator
                size="large"
                color="#FFFFFF"
                style={styles.spinner}
              />
            </View>
          )}
        </View>
      </Pressable>

      {/* Floating Action Columns (Right Side) */}
      <View style={[styles.rightSideContainer, { bottom: bottomOffset }]}>


        {/* Like Button */}
        <Pressable onPress={handleLike} style={styles.actionBtn}>
          <View style={[styles.actionIconWrap, isLiked && styles.activeHeartWrap]}>
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={21}
              color={isLiked ? "#ff3b30" : "#FFFFFF"}
            />
          </View>
          <Text style={styles.actionCountText}>
            {isLiked ? "1.3K" : "1.2K"}
          </Text>
        </Pressable>

        {/* Comment Button */}
        <Pressable onPress={() => onOpenComments(item.id)} style={styles.actionBtn}>
          <View style={styles.actionIconWrap}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.actionCountText}>
            {commentsCount}
          </Text>
        </Pressable>

        {/* Mute toggle button */}
        <Pressable onPress={onToggleMute} style={styles.actionBtn}>
          <View style={styles.actionIconWrap}>
            <Ionicons
              name={isMuted ? "volume-mute" : "volume-high"}
              size={20}
              color="#FFFFFF"
            />
          </View>
        </Pressable>

        {/* Spinning Vinyl Record Disc - Play Full Song */}
        <Pressable onPress={() => onPlayFullSong(item.song)} style={styles.actionBtn}>
          {isPlaying && videoReady && <FloatingNotes isPlaying={true} />}
          <Animated.View
            style={[
              styles.discWrap,
              isPlaying && videoReady && styles.discWrapPlaying,
              {
                transform: [
                  {
                    rotate: discRotation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"]
                    })
                  }
                ]
              }
            ]}
          >
            <Image
              source={{ uri: item.avatar }}
              style={styles.discImage}
              contentFit="cover"
            />
            <View style={styles.discInnerHole} />
          </Animated.View>
        </Pressable>
      </View>

      {/* Song info — bottom left, plays full song on tap */}
      <View style={[styles.detailsContainer, { bottom: bottomOffset }]}>
        <Pressable onPress={() => onPlayFullSong(item.song)}>
          <View style={{ width: SCREEN_WIDTH - 120 }}>
            <View style={{ overflow: "hidden", height: 18 }}>
              <PingPongScroll
                text={item.title}
                style={styles.songTitleText}
                velocity={14}
              />
            </View>
            <Text numberOfLines={1} style={styles.songArtistText}>
              {item.artist}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
});

ShortItem.displayName = "ShortItem";

// Helper: Normalize title and artist to detect different versions/uploads of the same song
const getSongSignature = (title: string, artist: string): string => {
  const mainPart = title.split(/[|\-\(\[/\:\\]/)[0] || "";
  const cleanTitle = mainPart
    .toLowerCase()
    .replace(/official|lyrical|video|audio|song|full|hd|4k|music/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
  
  if (!cleanTitle) return `raw_${Math.random().toString(36).slice(2, 8)}`;

  const firstArtistWord = artist.split(/[\s,]/)[0] || "";
  const cleanArtist = firstArtistWord
    .toLowerCase()
    .replace(/official|music|records|vevo|yt/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

  return `${cleanTitle}_${cleanArtist}`;
};

// react-doctor-disable-next-line no-giant-component -- feed loading, navigation lifecycle, and the coordinated comments sheet share one screen-level state boundary.
export default function ExploreScreen() {
  const [shortsList, setShortsList] = useState<ShortItemType[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [activeCommentsId, setActiveCommentsId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [commentsData, setCommentsData] = useState<Record<string, { id: string; user: string; text: string; time: string; likes: number }[]>>({});
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, setPage] = useState(1);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const navigation = useNavigation();
  const flatListRef = useRef<FlatList>(null);
  // Use a ref for the current page so loadShortsFeed always sees the latest value
  // without being recreated (avoids stale closure in useCallback with empty deps)
  const pageRef = useRef(1);
  const isFetchingMoreRef = useRef(false);
  const seenVideoIdsRef = useRef<Set<string>>(new Set());
  const seenSignaturesRef = useRef<Set<string>>(new Set());
  const listLengthRef = useRef(0);

  // App Player Context integration
  const playerActions = usePlayerActions();
  const playbackState = usePlaybackPlayState();

  useEffect(() => {
    listLengthRef.current = shortsList.length;
  }, [shortsList]);

  const loadShortsFeed = useCallback(async (isInitial = false) => {
    if (isFetchingMoreRef.current) return;
    isFetchingMoreRef.current = true;

    if (isInitial) {
      if (listLengthRef.current > 0) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      pageRef.current = 0;
      // Do NOT clear seenVideoIdsRef or seenSignaturesRef so that content is never repeated!
      // Limit seen set to last 200 entries to prevent infinite memory growth
      if (seenVideoIdsRef.current.size > 200) {
        const iterator = seenVideoIdsRef.current.values();
        for (let i = 0; i < 50; i++) {
          const val = iterator.next().value;
          if (val) seenVideoIdsRef.current.delete(val);
        }
      }
      setShortsList([]);
    } else {
      setIsFetchingMore(true);
    }

    const currentPage = pageRef.current;

    // Dynamically generate a query based on category rotation (Latest -> Trending -> Popular)
    const categories: ("LATEST" | "TRENDING" | "POPULAR")[] = ["LATEST", "TRENDING", "POPULAR"];
    const activeCategory = categories[currentPage % 3];
    const query = getDynamicExploreQuery(activeCategory);

    // Helper: fetch with a manual timeout (AbortSignal.timeout not supported in Hermes)
    const fetchWithTimeout = (url: string, ms = 7000): Promise<any[]> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      return fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      })
        .then(r => {
          clearTimeout(timer);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(data => {
          const list = data?.items || data?.data || data?.results || [];
          if (!Array.isArray(list) || list.length === 0) throw new Error("empty");
          return list;
        })
        .catch(err => { clearTimeout(timer); throw err; });
    };

    // Helper: extract a valid 11-char YouTube videoId from a Piped/Invidious result
    const extractVideoId = (item: any): string => {
      if (item.videoId && item.videoId.length === 11) return item.videoId;
      const raw: string = item.url || item.id || "";
      if (raw.includes("v=")) {
        const v = raw.split("v=")[1]?.split("&")[0] ?? "";
        if (v.length === 11) return v;
      }
      const seg = raw.split("/").pop()?.split("?")[0] ?? "";
      return seg.length === 11 ? seg : "";
    };

    // Helper: convert a raw search result item → ShortItemType (returns null if invalid)
    const toShortItem = (item: any): ShortItemType | null => {
      const videoId = extractVideoId(item);
      if (!videoId || seenVideoIdsRef.current.has(videoId)) return null;

      const title: string = item.title || "Unknown Song";
      const artist: string = item.uploaderName || item.uploader || item.author || "Artist";
      const signature = getSongSignature(title, artist);

      if (seenSignaturesRef.current.has(signature)) return null;

      const duration = Number(item.duration ?? item.lengthSeconds ?? 0);
      if (duration > 720) return null; // skip >12 min (likely not a music video)

      seenVideoIdsRef.current.add(videoId);
      seenSignaturesRef.current.add(signature);

      const thumb: string = item.thumbnail || item.thumbnailUrl
        || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      const startOffset = 20;

      return {
        id: `${videoId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        videoId,
        title,
        artist,
        author: "@" + artist.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 16),
        avatar: thumb,
        likes: `${(Math.random() * 4.8 + 0.2).toFixed(1)}M`,
        comments: `${Math.floor(Math.random() * 80 + 10)}K`,
        description: `${title} by ${artist} \uD83C\uDFB5 #music #bollywood #trending`,
        startOffset,
        song: {
          id: `youtube_${videoId}`,
          title,
          artist,
          album: "",
          duration,
          coverUrl: thumb,
          genre: "YouTube",
          audioUrl: "",
          source: "youtube",
          youtubeVideoId: videoId
        } as Song
      };
    };

    try {
      let rawItems: any[] = [];

      // ── Tier 1: Piped (correct filter=videos, manual timeout) ─────────────────
      const PIPED = [
        "https://pipedapi.ducks.party",
        "https://api.piped.private.coffee",
        "https://pipedapi.owo.si",
        "https://pipedapi.adminforge.de",
      ];
      try {
        rawItems = await Promise.any(
          PIPED.map(base =>
            fetchWithTimeout(`${base}/search?q=${encodeURIComponent(query)}&filter=videos&region=IN`, 6000)
          )
        );
      } catch { /* all Piped failed, try Invidious */ }

      // ── Tier 2: Invidious (if Piped failed) ─────────────────────────────────
      if (rawItems.length === 0) {
        const INVIDIOUS = [
          "https://invidious.nerdvpn.de",
          "https://inv.tux.pizza",
          "https://invidious.privacyredirect.com",
          "https://invidious.flokinet.to",
        ];
        try {
          rawItems = await Promise.any(
            INVIDIOUS.map(base =>
              fetchWithTimeout(
                `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=1&region=IN`,
                6000
              )
            )
          );
        } catch { /* all Invidious failed, fall through */ }
      }

      // ── Tier 3: YouTube Music search (final fallback) ─────────────────────────
      if (rawItems.length === 0) {
        const ytSongs = await searchYouTubeMusicVideos(query, 10);
        rawItems = ytSongs.reduce<any[]>((items, song) => {
          if (song.youtubeVideoId && song.youtubeVideoId.length === 11) {
            items.push({
              videoId: song.youtubeVideoId,
              title: song.title,
              uploaderName: song.artist,
              thumbnail: song.coverUrl,
              duration: song.duration,
            });
          }
          return items;
        }, []);
      }

      // ── Filter Out Foreign Music / Limit strictly to Indian & Mainstream English Channels/Artists ──
      const INDIAN_KEYWORDS = [
        "t-series", "t series", "tseries", "apnapunjab", "bhakti sagar", "bhaktisagar",
        "sony music", "sonymusic", "zee music", "zeemusic", "yrf", "yash raj", "yashraj",
        "tips official", "tips music", "tips industries", "aditya music", "speed records",
        "saregama", "lahari music", "times music", "timesmusic", "venus music", "venusmusic",
        "shemaroo", "white hill", "whitehill", "think music", "thinkmusic", "vyrl",
        "desi music factory", "desimusicfactory", "indie music label", "indiemusiclabel",
        "punjabi", "bhojpuri", "haryanvi", "telugu", "tamil", "kannada", "malayalam",
        "marathi", "bengali", "gujarati", "hindi", "sanskrit", "bhajan", "ghazal", "indian",
        "karan aujla", "diljit", "arijit singh", "sidhu moose wala", "badshah", "raftaar",
        "honey singh", "neha kakkar", "jubin nautiyal", "shreya ghoshal", "sonu nigam",
        "armaan malik", "atif aslam", "rahat fateh", "divine", "emiway", "mc stan",
        "udit narayan", "lata mangeshkar", "kishore kumar", "rd burman", "alka yagnik",
        "kumarsanu", "kumar sanu", "kailash kher", "hariharan", "spb", "s. p. balasubrahmanyam",
        "rahman", "a. r. rahman", "anirudh", "devi sri prasad", "dsp", "thaman", "g. v. prakash",
        "harris jayaraj", "ilayaraja", "yuvan", "sid sriram", "jonita gandhi", "anurag kulkarni",
        // Mainstream English Artists & Labels popular in India
        "vevo", "alan walker", "alanwalker", "justin bieber", "bieber", "marshmello",
        "ed sheeran", "sheeran", "the weeknd", "weeknd", "taylor swift", "taylorswift",
        "dua lipa", "dualipa", "coldplay", "bruno mars", "brunomars", "charlie puth",
        "shawn mendes", "billie eilish", "selena gomez", "chainsmokers", "sabrina carpenter",
        "one direction"
      ];

      const indianRawItems = rawItems.filter(item => {
        const uploader = (item.uploaderName || item.uploader || item.author || item.artist || "").toLowerCase();
        const title = (item.title || "").toLowerCase();
        return INDIAN_KEYWORDS.some(kw => uploader.includes(kw) || title.includes(kw));
      });

      const finalRawItems = indianRawItems.length > 0 ? indianRawItems : rawItems;

      // ── Sort & Prioritize Official Channels (T-Series, Sony, Zee, YRF, Tips, Saregama, Speed Records, Lahari) ──
      const OFFICIAL_KEYWORDS = [
        "t-series", "t series", "tseries", "sony music", "sonymusic", 
        "zee music", "zeemusic", "yrf", "yash raj", "yashraj", 
        "tips official", "tips music", "tips industries", "aditya music", "speed records", 
        "saregama", "lahari music", "apnapunjab", "bhakti sagar"
      ];

      const sortedRawItems = [...finalRawItems].sort((a, b) => {
        const authA = (a.uploaderName || a.uploader || a.author || a.artist || "").toLowerCase();
        const authB = (b.uploaderName || b.uploader || b.author || b.artist || "").toLowerCase();
        
        const isOfficialA = OFFICIAL_KEYWORDS.some(kw => authA.includes(kw));
        const isOfficialB = OFFICIAL_KEYWORDS.some(kw => authB.includes(kw));
        
        if (isOfficialA && !isOfficialB) return -1;
        if (!isOfficialA && isOfficialB) return 1;
        return 0;
      });

      const newItems: ShortItemType[] = [];
      for (const item of sortedRawItems) {
        const si = toShortItem(item);
        if (si) newItems.push(si);
        if (newItems.length >= 8) break;
      }

      pageRef.current = currentPage + 1;
      setPage(prev => prev + 1);

      if (newItems.length > 0) {
        setShortsList(prev => [...prev, ...newItems]);
      } else {
        // All tiers returned nothing usable; skip to next query
        isFetchingMoreRef.current = false;
        void loadShortsFeed(false);
        return;
      }
    } catch (error) {
      console.error("[Explore] All fetch tiers failed:", error);
    } finally {
      isFetchingMoreRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
      setIsFetchingMore(false);
    }
  }, []);

  useEffect(() => {
    loadShortsFeed(true);
  }, [loadShortsFeed]);

  const handleEndReached = useCallback(() => {
    if (isFetchingMoreRef.current || isLoading) return;
    loadShortsFeed(false);
  }, [isLoading, loadShortsFeed]);

  const isScreenFocusedRef = useRef(isScreenFocused);
  useEffect(() => {
    isScreenFocusedRef.current = isScreenFocused;
  }, [isScreenFocused]);

  // Watch screen focus so we pause Shorts when switching tabs.
  // react-doctor-disable-next-line effect-needs-cleanup -- every navigation subscription is disposed below.
  useEffect(() => {
    const unsubscribeFocus = navigation.addListener("focus", () => {
      setIsScreenFocused(true);
    });
    const unsubscribeBlur = navigation.addListener("blur", () => {
      setIsScreenFocused(false);
    });
    const unsubscribeTabPress = navigation.addListener("tabPress" as any, () => {
      if (isScreenFocusedRef.current) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        void loadShortsFeed(true);
      }
    });
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
      unsubscribeTabPress();
    };
  }, [navigation, loadShortsFeed]);

  // Pause main player if it's playing when Explore mounts or focuses
  useEffect(() => {
    if (isScreenFocused && playbackState.isPlaying && playerActions?.togglePlay) {
      playerActions.togglePlay();
    }
  }, [isScreenFocused, playbackState.isPlaying, playerActions]);

  const toggleMuteGlobal = useCallback(() => {
    setIsMuted(curr => !curr);
  }, []);

  const openCommentsDrawer = useCallback((id: string) => {
    setActiveCommentsId(id);
  }, []);

  const closeCommentsDrawer = useCallback(() => {
    setActiveCommentsId(null);
    setCommentInput("");
  }, []);

  const handleSendComment = useCallback(() => {
    if (!commentInput.trim() || !activeCommentsId) return;

    const baseId = activeCommentsId.split("_")[0];
    const newComment = {
      id: `${baseId}-${Date.now()}`,
      user: "@me",
      text: commentInput.trim(),
      time: "Just now",
      likes: 0
    };

    setCommentsData(curr => {
      const existing = curr[baseId] || [];
      return {
        ...curr,
        [baseId]: [newComment, ...existing]
      };
    });
    setCommentInput("");
  }, [commentInput, activeCommentsId]);

  const handlePlayFullSong = useCallback((song: Song) => {
    if (playerActions?.playSong) {
      playerActions.playSong(song);
    }
  }, [playerActions]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems && viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50
  }).current;

  const renderItem = useCallback(({ item, index }: { item: ShortItemType; index: number }) => {
    return (
      <ShortItem
        item={item}
        isActive={index === activeIndex}
        shouldLoad={index >= activeIndex - 1 && index <= activeIndex + 1}
        isScreenFocused={isScreenFocused}
        isMuted={isMuted}
        onToggleMute={toggleMuteGlobal}
        onOpenComments={openCommentsDrawer}
        onPlayFullSong={handlePlayFullSong}
        commentsCount={(commentsData[item.id.split("_")[0]] || []).length + 3}
      />
    );
  }, [activeIndex, isMuted, isScreenFocused, toggleMuteGlobal, openCommentsDrawer, handlePlayFullSong, commentsData]);

  const currentComments = useMemo(() => {
    if (!activeCommentsId) return [];
    const baseId = activeCommentsId.split("_")[0];
    const userComments = commentsData[baseId] || [];
    const defaultComments = [
      { id: `${baseId}-def1`, user: "@music_fan", text: "This song is an absolute masterpiece! 🔥❤️", time: "2h ago", likes: 245 },
      { id: `${baseId}-def2`, user: "@soundseeker", text: "On repeat since yesterday! Best discovery this month.", time: "5h ago", likes: 112 },
      { id: `${baseId}-def3`, user: "@rhythmrider", text: "The drop is insane! 🎵✨", time: "1d ago", likes: 78 }
    ];
    return [...userComments, ...defaultComments];
  }, [activeCommentsId, commentsData]);

  const renderFooter = useCallback(() => {
    if (!isFetchingMore) return null;
    return (
      <View style={{ paddingVertical: 20, alignItems: "center" }}>
        <ActivityIndicator size="small" color="#26e19a" />
      </View>
    );
  }, [isFetchingMore]);

  if (isLoading && shortsList.length === 0) {
    return (
      <View style={[styles.container, styles.loadingCenter]}>
        <ActivityIndicator size="large" color="#26e19a" />
        <Text style={styles.loadingText}>Fetching trending shorts...</Text>
      </View>
    );
  }

  if (!isLoading && shortsList.length === 0) {
    return (
      <View style={[styles.container, styles.loadingCenter]}>
        <Ionicons name="alert-circle-outline" size={48} color="#8e8e93" />
        <Text style={styles.loadingText}>Failed to load shorts feed.</Text>
        <Pressable
          style={{
            marginTop: 14,
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 20,
            backgroundColor: "#26e19a"
          }}
          onPress={() => loadShortsFeed(true)}
        >
          <Text style={{ color: "#000000", fontFamily: "Inter_700Bold", fontSize: 14 }}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={shortsList}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        decelerationRate="fast"
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshing={isRefreshing}
        onRefresh={() => loadShortsFeed(true)}
        ListFooterComponent={renderFooter}
        style={styles.feedList}
      />

      {/* Floating Custom Comments Sliding Sheet */}
      <Modal
        visible={activeCommentsId !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={closeCommentsDrawer}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalDismissArea} onPress={closeCommentsDrawer} />

          <View style={styles.commentsContentSheet}>
            {/* Header drag bar indicator */}
            <View style={styles.dragBar} />

            <View style={styles.commentsHeader}>
              <Text style={styles.commentsTitle}>
                Comments ({currentComments.length})
              </Text>
              <Pressable style={styles.closeBtn} onPress={closeCommentsDrawer}>
                <Ionicons name="close" size={24} color="#8e8e93" />
              </Pressable>
            </View>

            <FlatList
              data={currentComments}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={true}
              style={styles.commentsScrollList}
              contentContainerStyle={styles.commentsListContent}
              renderItem={renderCommentItem}
              ListEmptyComponent={
                <View style={styles.emptyComments}>
                  <Text style={styles.emptyText}>Be the first to comment!</Text>
                </View>
              }
            />

            {/* Comment TextInput bar */}
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Add a comment..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={commentInput}
                onChangeText={setCommentInput}
                onSubmitEditing={handleSendComment}
                returnKeyType="send"
              />
              <Pressable
                onPress={handleSendComment}
                style={[
                  styles.sendBtn,
                  !commentInput.trim() && styles.sendBtnDisabled
                ]}
                disabled={!commentInput.trim()}
              >
                <Ionicons
                  name="send-sharp"
                  size={20}
                  color={commentInput.trim() ? "#26e19a" : "rgba(255,255,255,0.3)"}
                />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000"
  },
  feedList: {
    flex: 1
  },
  card: {
    width: SCREEN_WIDTH,
    backgroundColor: "#000000",
    position: "relative",
    justifyContent: "center",
    alignItems: "center"
  },
  videoPressArea: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center"
  },
  playerContainer: {
    width: SCREEN_WIDTH,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0a0a",
    overflow: "hidden"
  },
  playerAbsoluteWrapper: {
    position: "absolute",
    backgroundColor: "#000000",
    overflow: "hidden"
  },
  spinner: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -20
  },
  centerIndicator: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -55,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10
  },
  playPausePill: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center"
  },
  rightSideContainer: {
    position: "absolute",
    right: 14,
    alignItems: "center",
    gap: 10,
    zIndex: 15
  },
  actionBtn: {
    alignItems: "center",
    justifyContent: "center"
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center"
  },
  activeHeartWrap: {
    backgroundColor: "rgba(255, 59, 48, 0.15)",
    borderColor: "rgba(255, 59, 48, 0.4)"
  },
  actionCountText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    marginTop: 3,
    marginBottom: 4,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  discWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#111111",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden"
  },
  discImage: {
    width: "100%",
    height: "100%"
  },
  discInnerHole: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#000000",
    borderWidth: 1.5,
    borderColor: "#FFFFFF"
  },
  detailsContainer: {
    position: "absolute",
    left: 14,
    right: 76,
    zIndex: 15,
    gap: 10
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  artistAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)"
  },
  artistName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    marginLeft: 4
  },
  followBtnText: {
    color: "#000000",
    fontSize: 11,
    fontFamily: "Inter_700Bold"
  },
  videoDescription: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },

  songTitleText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  songArtistText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.48)"
  },
  modalDismissArea: {
    flex: 1
  },
  commentsContentSheet: {
    height: SCREEN_HEIGHT * 0.58,
    backgroundColor: "#16171b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 18 : 6
  },
  dragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignSelf: "center",
    marginTop: 8
  },
  commentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.06)"
  },
  commentsTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold"
  },
  closeBtn: {
    padding: 2
  },
  commentsScrollList: {
    flex: 1
  },
  commentsListContent: {
    padding: 16,
    gap: 18
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  commentAvatarBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center"
  },
  commentAvatarText: {
    color: "#26e19a",
    fontSize: 11,
    fontFamily: "Inter_700Bold"
  },
  commentBody: {
    flex: 1,
    gap: 2
  },
  commentUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  commentUser: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold"
  },
  commentTime: {
    color: "rgba(255,255,255,0.36)",
    fontSize: 10,
    fontFamily: "Inter_500Medium"
  },
  commentText: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_500Medium"
  },
  commentLikeBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingTop: 4
  },
  commentLikeCount: {
    color: "#8e8e93",
    fontSize: 9,
    fontFamily: "Inter_500Medium"
  },
  emptyComments: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48
  },
  emptyText: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 13,
    fontFamily: "Inter_500Medium"
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#16171b"
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    paddingHorizontal: 16,
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_500Medium"
  },
  sendBtn: {
    marginLeft: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(38,225,154,0.08)",
    justifyContent: "center",
    alignItems: "center"
  },
  sendBtnDisabled: {
    backgroundColor: "transparent"
  },

  floatingNote: {
    position: "absolute",
    bottom: 25,
    right: 20,
    fontSize: 20,
    zIndex: 99,
    color: "#26e19a",
  },
  // react-doctor-disable-next-line rn-no-legacy-shadow-styles -- iOS shadows and Android elevation are intentionally supplied together.
  discWrapPlaying: {
    borderColor: "#26e19a",
    shadowColor: "#26e19a",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6
  },
  loadingCenter: {
    justifyContent: "center",
    alignItems: "center",
    gap: 16
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 10
  }
});
