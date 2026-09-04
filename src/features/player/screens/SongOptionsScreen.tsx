import React, { useCallback, useMemo, useState } from "react";
import {
  DeviceEventEmitter,
  Modal,
  Platform,
  Pressable,
  Share,
  Text,
  View,
} from "react-native";
import { Gesture, GestureHandlerRootView } from "react-native-gesture-handler";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IS_ANDROID } from "@/constants/platform";
import { showGlobalToast } from "@/utils/globalToast";
import { unescapeHtml } from "@/utils/stringUtils";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Song } from "@/lib/musicData";
import { removeSongFromPlaylist } from "@/lib/storage";
import { removeSongFromFirestorePlaylist } from "@/lib/firestore";
import { styles } from "../styles/songOptionsStyles";
import type { SongOptionMenuItem } from "../components/SongOptionsSubComponents";
import { dismissOptions } from "../utils/songOptionsUtils";
import {
  SheetWrap,
  AddToPlaylistView,
  GoToArtistsView,
  SongCreditsView,
  MavrixfyCodeView,
} from "../components/SongOptionsSubViews";
import { SongOptionsMainSheet } from "../components/SongOptionsMainSheet";

type SubView = "main" | "add-to-playlist" | "go-to-artists" | "song-credits" | "mavrixfy-code";

function parseSongParam(value: string | string[] | undefined): Song | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Song>;
    if (!parsed.id || !parsed.title) return null;
    return {
      id: parsed.id,
      title: unescapeHtml(parsed.title),
      artist: unescapeHtml(parsed.artist || "Unknown Artist"),
      album: unescapeHtml(parsed.album || ""),
      duration: parsed.duration || 0,
      coverUrl: parsed.coverUrl || "",
      genre: parsed.genre || "",
      audioUrl: parsed.audioUrl || "",
      downloadUrl: parsed.downloadUrl,
      year: parsed.year,
      language: parsed.language,
      source: parsed.source,
      playCount: parsed.playCount,
    };
  } catch {
    return null;
  }
}

export function SongOptionsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    song?: string;
    showDownload?: string;
    canRemove?: string;
    optionContext?: string;
    playlistId?: string;
    playlistSource?: string;
    playlistName?: string;
  }>();
  const { toggleLike, isLiked, addToQueue, playNext } = usePlayerActions();
  const { user } = useAuth();
  const [subView, setSubView] = useState<SubView>("main");

  const song = useMemo(() => parseSongParam(params.song), [params.song]);
  const showDownload = params.showDownload !== "0";
  const canShowDownload = showDownload && Boolean(song);
  const canRemove = params.canRemove === "1";
  const optionContext = Array.isArray(params.optionContext) ? params.optionContext[0] : params.optionContext;
  const playlistIdParam = Array.isArray(params.playlistId) ? params.playlistId[0] : params.playlistId;
  const playlistSourceParam = Array.isArray(params.playlistSource) ? params.playlistSource[0] : params.playlistSource;
  const playlistNameParam = Array.isArray(params.playlistName) ? params.playlistName[0] : params.playlistName;
  const isPlaylistContext = optionContext === "playlist" && Boolean(playlistIdParam);
  const userId = user?.id ?? null;

  const liked = song ? isLiked(song.id) : false;
  const bottomPad = Math.max(insets.bottom + 8, 20);

  const androidSheetSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(Platform.OS === "android")
        .runOnJS(true)
        .activeOffsetY(8)
        .failOffsetY(-8)
        .onEnd((event) => {
          const isDownwardSwipe =
            event.translationY > 50 ||
            (event.translationY > 20 && event.velocityY > 350);
          const isMostlyVertical = Math.abs(event.translationY) > Math.abs(event.translationX) * 1.1;
          if (isDownwardSwipe && isMostlyVertical) {
            dismissOptions();
          }
        }),
    []
  );

  const closeThen = useCallback((action: () => void | Promise<void>) => {
    dismissOptions();
    setTimeout(() => void action(), 180);
  }, []);

  const handleShare = useCallback(async () => {
    if (!song) return;
    await Share.share({
      title: song.title,
      message: `${song.title} - ${song.artist || "Unknown Artist"}`,
      url: song.audioUrl || undefined,
    });
  }, [song]);

  const handleGoToAlbum = useCallback(() => {
    if (!song) return;
    const query = [song.album, song.artist].filter(Boolean).join(" ");
    if (!query) {
      showGlobalToast("Album info not available");
      return;
    }
    dismissOptions();
    setTimeout(() => {
      router.push({ pathname: "/(tabs)/search", params: { q: query } });
    }, 180);
  }, [song]);

  const handleRemoveFromPlaylist = useCallback(async () => {
    if (!song || !playlistIdParam) {
      dismissOptions();
      return;
    }

    try {
      let removed = true;
      if (playlistSourceParam === "firestore") {
        removed = await removeSongFromFirestorePlaylist(playlistIdParam, song.id);
      } else {
        await removeSongFromPlaylist(playlistIdParam, song.id);
      }

      if (!removed) {
        showGlobalToast("Could not remove from playlist");
        return;
      }

      DeviceEventEmitter.emit("PlaylistSongRemoved", {
        playlistId: playlistIdParam,
        songId: song.id,
      });
      showGlobalToast(
        playlistNameParam ? `Removed from ${playlistNameParam}` : "Removed from playlist"
      );
      dismissOptions();
    } catch {
      showGlobalToast("Could not remove from playlist");
    }
  }, [playlistIdParam, playlistNameParam, playlistSourceParam, song]);

  if (!song) {
    return (
      <SheetWrap>
        <View style={styles.centered}>
          <Text style={styles.emptyMsg}>Song unavailable</Text>
          <Pressable style={styles.closeButton} onPress={dismissOptions}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>
      </SheetWrap>
    );
  }

  if (subView === "add-to-playlist") {
    return (
      <SheetWrap>
        <AddToPlaylistView song={song} onBack={() => setSubView("main")} bottomPad={bottomPad} userId={userId} />
      </SheetWrap>
    );
  }
  if (subView === "go-to-artists") {
    return (
      <SheetWrap>
        <GoToArtistsView song={song} onBack={() => setSubView("main")} bottomPad={bottomPad} />
      </SheetWrap>
    );
  }
  if (subView === "song-credits") {
    return (
      <SheetWrap>
        <SongCreditsView song={song} onBack={() => setSubView("main")} bottomPad={bottomPad} />
      </SheetWrap>
    );
  }
  if (subView === "mavrixfy-code") {
    return (
      <SheetWrap>
        <MavrixfyCodeView song={song} onBack={() => setSubView("main")} />
      </SheetWrap>
    );
  }

  const menuItems: SongOptionMenuItem[] = [
    {
      label: "Share",
      icon: "share-outline",
      onPress: () => closeThen(handleShare),
    },
    {
      label: "Add to playlist",
      icon: "add-circle-outline",
      chevron: true,
      onPress: () => setSubView("add-to-playlist"),
    },
    {
      label: liked ? "Remove from Liked Songs" : "Add to Liked Songs",
      icon: liked ? "heart-dislike-outline" : "heart-outline",
      onPress: () => closeThen(() => toggleLike(song)),
    },
    {
      label: "Play next",
      icon: "play-skip-forward-outline",
      onPress: () => closeThen(() => {
        playNext(song);
        showGlobalToast("Will play next");
      }),
    },
    {
      label: "Add to Queue",
      icon: "list-outline",
      onPress: () => closeThen(() => {
        addToQueue(song);
      }),
    },
    {
      label: "Go to album",
      icon: "disc-outline",
      onPress: handleGoToAlbum,
    },
    {
      label: "Go to artists",
      icon: "person-outline",
      chevron: true,
      onPress: () => setSubView("go-to-artists"),
    },
    {
      label: "Go to artists concerts",
      icon: "ticket-outline",
      chevron: true,
      onPress: () => showGlobalToast("Concerts are not available yet"),
    },
    {
      label: "View song credits",
      icon: "musical-notes-outline",
      chevron: true,
      onPress: () => setSubView("song-credits"),
    },
    {
      label: "Show Mavrixfy Code",
      icon: "barcode-outline",
      chevron: true,
      onPress: () => setSubView("mavrixfy-code"),
    },
  ];

  if (canRemove) {
    menuItems.splice(2, 0, {
      label: isPlaylistContext ? "Remove from this playlist" : "Remove from playlist",
      icon: "remove-circle-outline",
      onPress: isPlaylistContext ? () => void handleRemoveFromPlaylist() : dismissOptions,
    });
  }

  const mainContent = (
    <SongOptionsMainSheet
      song={song}
      menuItems={menuItems}
      canShowDownload={canShowDownload}
      bottomPad={bottomPad}
      androidSheetSwipeGesture={androidSheetSwipeGesture}
      onDismiss={dismissOptions}
    />
  );

  if (IS_ANDROID) {
    return (
      <Modal
        visible={true}
        transparent={true}
        animationType="slide"
        onRequestClose={dismissOptions}
        statusBarTranslucent={true}
      >
        <GestureHandlerRootView style={styles.modalRoot}>
          {mainContent}
        </GestureHandlerRootView>
      </Modal>
    );
  }

  return mainContent;
}

export default SongOptionsScreen;
