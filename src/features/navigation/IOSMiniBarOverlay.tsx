import { PingPongScroll } from "@/components/PingPongScroll";
import Colors from "@/constants/colors";
import { useOptionalPlayerActions } from "@/contexts/PlayerContext";
import { mapFilter } from "@/lib/arrayUtils";
import {
preloadDominantColors,
useArtworkPalette,
} from "@/lib/colorExtractor";
import {
DEFAULT_MINI_PLAYER_BANNER_CONFIG,
subscribeToMiniPlayerBannerConfig,
type MiniPlayerBannerConfig,
} from "@/lib/miniPlayerBannerConfig";
import { expandPlayer } from "@/lib/playerUIState";
import { globalQueueSheetRef } from "@/lib/queueRef";
import { useMiniPlayerSecondaryControl } from "@/lib/storage";
import { usePlaybackNowPlaying,usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { Platform,Pressable,View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles } from "./layoutStyles";
import { noopPlayerAction } from "./layoutUtils";
import {
IOSMiniPlayerMixBadge,
IOSMiniPlayerProgressBar,
MiniPlayerBannerView,
MiniPlayerSecondaryControlButton,
} from "./miniPlayerComponents";

type NativeTabsModule = typeof import("expo-router/unstable-native-tabs");
let nativeTabsModule: NativeTabsModule | null = null;

function getNativeTabsModule(): NativeTabsModule {
  if (!nativeTabsModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeTabsModule = require("expo-router/unstable-native-tabs") as NativeTabsModule;
  }
  return nativeTabsModule;
}

export function NativeTabLayout() {
  const { NativeTabs } = getNativeTabsModule() as any;
  const Trigger = NativeTabs.Trigger;
  const Icon = Trigger.Icon;
  const Label = Trigger.Label;
  const VectorIcon = Trigger.VectorIcon;

  return (
    <NativeTabs
      disableTransparentOnScrollEdge
      minimizeBehavior="never"
      tintColor={Colors.primary}
      iconColor={{ default: "rgba(235,235,245,0.6)", selected: Colors.primary }}
      labelStyle={{
        default: {
          color: "rgba(235,235,245,0.6)",
          fontSize: 10,
          fontWeight: "500",
        },
        selected: {
          color: Colors.primary,
          fontSize: 10,
          fontWeight: "600",
        },
      }}
    >
      <Trigger name="index">
        <Icon
          sf={{ default: "house", selected: "house.fill" }}
          md={{ default: "home", selected: "home_filled" }}
          src={<VectorIcon family={Ionicons} name="home" />}
        />
        <Label>Home</Label>
      </Trigger>

      <Trigger name="search">
        <Icon
          sf={{ default: "magnifyingglass", selected: "magnifyingglass" }}
          md={{ default: "search", selected: "search" }}
          src={<VectorIcon family={Ionicons} name="search" />}
        />
        <Label>Search</Label>
      </Trigger>

      <Trigger name="library">
        <Icon
          sf={{ default: "music.note.list", selected: "music.note.list" }}
          md={{ default: "library_music", selected: "library_music" }}
          src={<VectorIcon family={Ionicons} name="library" />}
        />
        <Label>Library</Label>
      </Trigger>

      <Trigger name="liked-songs">
        <Icon
          sf={{ default: "heart", selected: "heart.fill" }}
          md={{ default: "favorite_border", selected: "favorite" }}
          src={<VectorIcon family={Ionicons} name="heart" />}
        />
        <Label>Liked</Label>
      </Trigger>

      <Trigger name="import-songs">
        <Icon
          sf={{ default: "square.and.arrow.down", selected: "square.and.arrow.down.fill" }}
          md={{ default: "file_upload", selected: "file_upload" }}
          src={<VectorIcon family={Ionicons} name="download-outline" />}
        />
        <Label>Import</Label>
      </Trigger>

      <Trigger name="create" hidden />
    </NativeTabs>
  );
}

export function IOSNativeTabLayout() {
  return <NativeTabLayout />;
}

export interface MiniPlayerOverlayProps {
  inTabScreen?: boolean;
}

export function NativeMiniPlayerOverlay({ inTabScreen = true }: MiniPlayerOverlayProps = {}) {
  const insets = useSafeAreaInsets();
  const { push: overlayRouterPush } = useRouter();
  const { currentSong, queue, queueIndex } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const playerActions = useOptionalPlayerActions();
  const togglePlay = playerActions?.togglePlay ?? noopPlayerAction;
  const nextSong = playerActions?.nextSong ?? noopPlayerAction;
  const prevSong = playerActions?.prevSong ?? noopPlayerAction;
  const textColor = playerActions?.textColor ?? "#FFFFFF";
  const setAlbumColor = playerActions?.setAlbumColor ?? noopPlayerAction;
  const setTextColor = playerActions?.setTextColor ?? noopPlayerAction;
  const miniPlayerSecondaryControl = useMiniPlayerSecondaryControl();
  const [bannerConfig, setBannerConfig] = useState<MiniPlayerBannerConfig>(DEFAULT_MINI_PLAYER_BANNER_CONFIG);
  useEffect(() => {
    return subscribeToMiniPlayerBannerConfig(setBannerConfig);
  }, []);
  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;
  const [coverFailed, setCoverFailed] = useState(false);
  const openPlayerLockRef = useRef(0);

  const openPlayer = useCallback(() => {
    const now = Date.now();
    if (now - openPlayerLockRef.current < 240) return;
    openPlayerLockRef.current = now;
    expandPlayer();
  }, []);

  const openMiniPlayerQueue = useCallback(() => {
    globalQueueSheetRef.current?.expand();
  }, []);

  const openMiniPlayerSongOptions = useCallback(() => {
    if (!activeSong) return;
    overlayRouterPush(
      {
        pathname: "/song-options",
        params: {
          song: JSON.stringify(activeSong),
          showDownload: "1",
          canRemove: "0",
          optionContext: "",
          playlistId: "",
          playlistSource: "",
          playlistName: "",
        },
      },
      { dangerouslySingular: () => "song-options" }
    );
  }, [activeSong, overlayRouterPush]);

  useEffect(() => {
    const urls = mapFilter([
      queue[queueIndex - 1]?.coverUrl,
      activeSong?.coverUrl,
      queue[queueIndex + 1]?.coverUrl,
    ], (url) => url?.trim(), (url): url is string => Boolean(url));

    if (urls.length === 0) return;
    void Image.prefetch(urls, "memory-disk").catch(() => { });
    preloadDominantColors(urls);
  }, [activeSong?.coverUrl, queue, queueIndex]);

  const iosArtworkPalette = useArtworkPalette(activeSong?.coverUrl);

  useEffect(() => {
    // Reset cover error for the next song and publish its artwork colors.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoverFailed(false);
    setAlbumColor(iosArtworkPalette.accent);
    setTextColor(iosArtworkPalette.text);
  }, [activeSong?.id, iosArtworkPalette.accent, iosArtworkPalette.text, setAlbumColor, setTextColor]);

  const shellBgColor = useMemo(
    () => iosArtworkPalette.background || "#16181D",
    [iosArtworkPalette.background]
  );

  if (!activeSong) {
    return null;
  }

  const progressFillColor = "rgba(255,255,255,0.90)";
  const isIOS = Platform.OS === "ios";
  const tabBarVisualHeight = inTabScreen ? (isIOS ? 49 : 56) : 0;
  const tabBarGap = inTabScreen ? 6 : 0;
  const bottomOffset = inTabScreen
    ? Math.max(insets.bottom + tabBarVisualHeight + tabBarGap, isIOS ? 80 : 70)
    : Math.max(insets.bottom + 12, 16);
  const shellBorderColor = "rgba(255,255,255,0.08)";

  return (
    <View pointerEvents="box-none" style={[styles.iosMiniPlayerRoot, { bottom: bottomOffset }]}>
      <View style={[styles.iosMiniPlayerShell, { backgroundColor: shellBgColor, borderColor: shellBorderColor }]}>
        {bannerConfig.enabled && bannerConfig.items.length > 0 ? (
          <MiniPlayerBannerView config={bannerConfig} />
        ) : null}
        <View style={styles.iosMiniPlayerRow}>
          <Pressable style={styles.iosMiniPlayerMain} onPress={openPlayer} android_disableSound>
            <View style={styles.iosMiniPlayerArtworkShell}>
              {activeSong.coverUrl && !coverFailed ? (
                <Image
                  source={{ uri: activeSong.coverUrl }}
                  style={styles.iosMiniPlayerCover}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  priority="high"
                  transition={100}
                  onError={() => setCoverFailed(true)}
                />
              ) : (
                <View
                  style={[
                    styles.iosMiniPlayerCover,
                    styles.iosMiniPlayerCoverFallback,
                  ]}
                >
                  <Ionicons name="musical-notes" size={20} color="rgba(255,255,255,0.72)" />
                </View>
              )}
            </View>

            <View style={styles.iosMiniPlayerText}>
              <PingPongScroll
                text={activeSong.title}
                style={[styles.iosMiniPlayerTitle, { color: "#FFFFFF" }]}
                velocity={14}
              />
              <PingPongScroll
                text={activeSong.artist}
                style={[styles.iosMiniPlayerArtist, { color: "rgba(255, 255, 255, 0.70)" }]}
                velocity={11}
              />
            </View>
          </Pressable>

          <IOSMiniPlayerMixBadge
            activeSongId={activeSong.id}
            queue={queue}
            isPlaying={isPlaying}
          />

          <View style={styles.iosMiniPlayerControls}>
            <Pressable
              android_disableSound
              onPress={() => {
                togglePlay();
              }}
              hitSlop={14}
              style={({ pressed }) => [
                styles.iosMiniPlayerButton,
                styles.iosMiniPlayerPrimaryButton,
                pressed && styles.miniButtonPressed,
              ]}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={22}
                color="#060A0F"
                style={!isPlaying ? { marginLeft: 2 } : undefined}
              />
            </Pressable>
            <MiniPlayerSecondaryControlButton
              control={miniPlayerSecondaryControl}
              size={40}
              radius={20}
              backgroundColor="transparent"
              borderColor="transparent"
              iconColor="rgba(255,255,255,0.90)"
              shellStyle={styles.iosMiniPlayerButton}
              onQueue={openMiniPlayerQueue}
              onNext={nextSong}
              onPrev={prevSong}
              onMore={openMiniPlayerSongOptions}
            />
          </View>
        </View>

        <IOSMiniPlayerProgressBar fillColor={progressFillColor} />
      </View>
    </View>
  );
}

export function IOSMiniPlayerOverlay(props: MiniPlayerOverlayProps = {}) {
  return <NativeMiniPlayerOverlay {...props} />;
}
