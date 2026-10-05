import { useEffect, useRef } from "react";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import { searchRepository } from "@/lib/searchRepository";
import { playerPersistenceService } from "@/services/player/playerPersistenceService";

const mediaLibrary =
  Platform.OS === "android" ? NativeModules.MavrixfyMediaLibrary : null;
const emitter = mediaLibrary ? new NativeEventEmitter(mediaLibrary) : null;

export function useAndroidAuto({
  queue,
  currentSong,
  likedSongs,
  playSong,
  isShuffled,
  repeatMode,
  toggleShuffle,
  toggleRepeat,
  toggleLike,
}: {
  queue: Song[];
  currentSong: Song | null;
  likedSongs: Song[];
  playSong: (song: Song, queue?: Song[]) => Promise<void> | void;
  isShuffled: boolean;
  repeatMode: "off" | "all" | "one";
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (song: Song) => Promise<void>;
}) {
  const library = useRef({
    queue,
    favorites: likedSongs,
    recent: [] as Song[],
  });
  const actions = useRef({
    playSong,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    currentSong,
  });
  useEffect(() => {
    actions.current = {
      playSong,
      toggleShuffle,
      toggleRepeat,
      toggleLike,
      currentSong,
    };
  }, [playSong, toggleShuffle, toggleRepeat, toggleLike, currentSong]);
  const searchAbort = useRef<AbortController | null>(null);
  const scopeRef = useRef<ReturnType<typeof getAccountScope> | null>(null);
  const publishedCatalog = useRef({ json: "", id: "" });
  const activeId = currentSong?.id || "";
  const liked = likedSongs.some((song) => song.id === activeId);

  useEffect(() => {
    mediaLibrary?.updateControls?.(activeId, isShuffled, repeatMode, liked);
  }, [activeId, isShuffled, repeatMode, liked]);

  useEffect(() => {
    if (!mediaLibrary) return;
    let active = true;
    const scope = getAccountScope();
    searchAbort.current?.abort();
    library.current = {
      queue,
      favorites: likedSongs,
      recent:
        scopeRef.current && isCurrentAccount(scopeRef.current)
          ? library.current.recent
          : [],
    };
    scopeRef.current = scope;
    const publish = () => {
      const metadata = (songs: Song[]) =>
        songs.slice(0, 200).map(({ id, title, artist, coverUrl }) => ({
          id,
          title,
          artist,
          coverUrl,
        }));
      const json = JSON.stringify({
        queue: metadata(library.current.queue),
        favorites: metadata(library.current.favorites),
        recent: metadata(library.current.recent),
      });
      if (
        publishedCatalog.current.json === json &&
        publishedCatalog.current.id === activeId
      )
        return;
      publishedCatalog.current = { json, id: activeId };
      mediaLibrary.updateCatalog(json, activeId);
    };
    publish();
    void playerPersistenceService
      .getRecentlyPlayed()
      .then((recent) => {
        if (!active || !isCurrentAccount(scope)) return;
        library.current.recent = recent.flatMap((entry) => {
          const song = entry.type === "song" ? (entry.data as Song) : null;
          return song?.id ? [song] : [];
        });
        publish();
      })
      .catch((error) =>
        logger.warn("[AndroidAuto] Recent songs sync failed", error),
      );
    return () => {
      active = false;
    };
  }, [queue, activeId, likedSongs]);

  useEffect(() => {
    if (!emitter) return;
    const controls = emitter.addListener(
      "MavrixfyPlaybackAction",
      ({ action, id }: { action: string; id: string }) => {
        const current = actions.current;
        if (!current.currentSong || current.currentSong.id !== id) return;
        if (action === "shuffle") current.toggleShuffle();
        else if (action === "repeat") current.toggleRepeat();
        else if (action === "like") {
          void current.toggleLike(current.currentSong).catch((error) => {
            logger.warn("[AndroidAuto] Like failed", error);
            mediaLibrary.reportError(
              "Could not update Liked Songs. Try again.",
            );
          });
        }
      },
    );
    const playSelection = (id: string) => {
      searchAbort.current?.abort();
      const groups = Object.values(library.current);
      const selectedQueue = groups.find((songs) =>
        songs.some((song) => song.id === id),
      );
      const selected = selectedQueue?.find((song) => song.id === id);
      if (selected) void actions.current.playSong(selected, selectedQueue);
      else
        mediaLibrary.reportError(
          "This song is no longer available. Select another song.",
        );
    };
    const play = emitter.addListener(
      "MavrixfyPlayMediaId",
      ({ id }: { id: string }) => playSelection(id),
    );
    const search = emitter.addListener(
      "MavrixfyPlaySearch",
      ({ query }: { query: string }) => {
        searchAbort.current?.abort();
        const first =
          library.current.queue[0] ||
          library.current.recent[0] ||
          library.current.favorites[0];
        if (!query.trim()) {
          if (first) playSelection(first.id);
          return;
        }
        const controller = new AbortController();
        searchAbort.current = controller;
        const scope = getAccountScope();
        void searchRepository(query, "songs", controller.signal)
          .then((results) => {
            if (controller.signal.aborted || !isCurrentAccount(scope)) return;
            if (results.songs[0])
              void actions.current.playSong(results.songs[0], results.songs);
            else
              mediaLibrary.reportError("No songs found. Try another search.");
          })
          .catch((error) => {
            if (controller.signal.aborted) return;
            logger.warn("[AndroidAuto] Voice search failed", error);
            mediaLibrary.reportError(
              "Search is unavailable. Check your connection and try again.",
            );
          });
      },
    );
    return () => {
      play.remove();
      controls.remove();
      mediaLibrary.updateControls?.("", false, "off", false);
      search.remove();
      searchAbort.current?.abort();
      publishedCatalog.current = { json: "", id: "" };
      mediaLibrary.updateCatalog(
        JSON.stringify({ queue: [], favorites: [], recent: [] }),
        "",
      );
    };
  }, []);
}
