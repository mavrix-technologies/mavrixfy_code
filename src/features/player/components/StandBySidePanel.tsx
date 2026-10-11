import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions, type ListRenderItemInfo } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { Song } from "@/lib/musicData";
import { getSongLyrics, type LyricLine, type LyricsResult } from "@/services/lyricsService";
import { getPlaybackProgressSnapshot, subscribePlaybackProgress } from "@/services/audio/playbackProgressStore";
import { unescapeHtml } from "@/utils/stringUtils";
import { getStandByLyricIndex } from "./standByLyrics";
import type { StandByPanel } from "./StandByActions";

interface StandBySidePanelProps {
  panel: StandByPanel;
  song: Song;
  queue: Song[];
  queueIndex: number;
  primaryColor: string;
  secondaryColor: string;
  reduceMotion: boolean;
  onPlayQueueSong: (song: Song) => void;
  onSeek: (ratio: number) => void;
  onTouchActivity: () => void;
}

export const StandBySidePanel = memo(function StandBySidePanel(props: StandBySidePanelProps) {
  return props.panel === "queue" ? <StandByQueue {...props} /> : <StandByLyrics key={props.song.id} {...props} />;
});

const StandByQueue = memo(function StandByQueue({ song, queue, queueIndex, primaryColor, secondaryColor, onPlayQueueSong, onTouchActivity }: StandBySidePanelProps) {
  const { fontScale } = useWindowDimensions();
  const rowHeight = Math.ceil(64 * Math.max(1, fontScale));
  const upcoming = useMemo(() => queue.slice(Math.max(0, queueIndex + 1)), [queue, queueIndex]);
  const renderItem = useCallback(({ item }: ListRenderItemInfo<Song>) => (
    <Pressable onPress={() => { onTouchActivity(); onPlayQueueSong(item); }} style={[styles.queueRow, { height: rowHeight }]} accessibilityRole="button" accessibilityLabel={`Play ${unescapeHtml(item.title)}, ${unescapeHtml(item.artist)}`}>
      {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.queueArtwork} contentFit="cover" accessible={false} /> : <Ionicons name="musical-notes" size={26} color={secondaryColor} style={styles.queueArtwork} />}
      <View style={styles.queueSong}>
        <Text numberOfLines={1} style={[styles.queueTitle, { color: primaryColor }]}>{unescapeHtml(item.title)}</Text>
        <Text numberOfLines={1} style={[styles.queueArtist, { color: secondaryColor }]}>{unescapeHtml(item.artist)}</Text>
      </View>
    </Pressable>
  ), [onPlayQueueSong, onTouchActivity, primaryColor, rowHeight, secondaryColor]);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeading}>
        <Text accessibilityRole="header" style={[styles.heading, { color: primaryColor }]}>Up next</Text>
        <Text style={[styles.caption, { color: secondaryColor }]}>{upcoming.length} tracks</Text>
      </View>
      <View style={styles.nowPlaying}>
        <Text style={[styles.caption, { color: secondaryColor }]}>NOW PLAYING</Text>
        <Text numberOfLines={1} style={[styles.queueTitle, { color: primaryColor }]}>{unescapeHtml(song.title)}</Text>
      </View>
      <FlatList
        key={`${song.id}:${queueIndex}`}
        style={styles.list}
        data={upcoming}
        renderItem={renderItem}
        keyExtractor={queueKey}
        getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={onTouchActivity}
        ListEmptyComponent={<View style={styles.empty}><Ionicons name="list-outline" size={30} color={secondaryColor} /><Text style={[styles.emptyText, { color: secondaryColor }]}>You’re at the end of the queue.</Text></View>}
      />
    </View>
  );
});

const EMPTY_LYRICS: LyricsResult = { synced: false, lines: [], provider: "none" };
const subscribeInactive = () => () => {};

const StandByLyrics = memo(function StandByLyrics({ song, primaryColor, secondaryColor, reduceMotion, onSeek, onTouchActivity }: StandBySidePanelProps) {
  const { fontScale } = useWindowDimensions();
  const rowHeight = Math.ceil(136 * Math.max(1, fontScale));
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const userScrolling = useRef(false);
  const listRef = useRef<FlatList<LyricLine>>(null);
  useEffect(() => {
    let mounted = true;
    setLyrics(null);
    userScrolling.current = false;
    void getSongLyrics({ id: song.id, title: song.title, artist: song.artist, album: song.album, duration: song.duration })
      .then(result => { if (mounted) setLyrics(result); })
      .catch(() => { if (mounted) setLyrics(EMPTY_LYRICS); });
    return () => { mounted = false; };
  }, [song.id, song.title, song.artist, song.album, song.duration]);

  // Only an active-line change rerenders the list, rather than every playback tick.
  const getActiveIndex = useCallback(() => lyrics?.synced ? getStandByLyricIndex(lyrics.lines, getPlaybackProgressSnapshot().positionMillis / 1000) : -1, [lyrics]);
  const activeIndex = useSyncExternalStore(lyrics?.synced ? subscribePlaybackProgress : subscribeInactive, getActiveIndex, getActiveIndex);
  const scrollToActive = useCallback(() => {
    if (activeIndex < 0 || !lyrics?.synced || userScrolling.current) return;
    listRef.current?.scrollToIndex({ index: activeIndex, animated: !reduceMotion, viewPosition: 0.3 });
  }, [activeIndex, lyrics?.synced, reduceMotion]);
  useEffect(() => {
    scrollToActive();
  }, [rowHeight, scrollToActive]);

  const seekLine = useCallback((seconds: number) => {
    onTouchActivity();
    const nativeDuration = getPlaybackProgressSnapshot().duration / 1000;
    const total = Number.isFinite(nativeDuration) && nativeDuration > 0 ? nativeDuration : Number.isFinite(song.duration) && song.duration > 0 ? song.duration : 0;
    if (total > 0 && Number.isFinite(seconds)) {
      onSeek(Math.max(0, Math.min(1, seconds / total)));
      userScrolling.current = false;
    }
  }, [onSeek, onTouchActivity, song.duration]);
  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<LyricLine>) => (
    <Pressable onPress={() => seekLine(item.time)} disabled={!lyrics?.synced} style={[styles.lyricRow, { height: rowHeight }]} accessibilityRole={lyrics?.synced ? "button" : "text"} accessibilityLabel={item.isBreak ? "Instrumental break" : item.text} accessibilityHint={lyrics?.synced ? "Seek to this lyric" : undefined} accessibilityState={{ selected: index === activeIndex }}>
      <Text numberOfLines={3} style={[styles.lyricText, { color: index === activeIndex || !lyrics?.synced ? primaryColor : secondaryColor }]}>{item.isBreak ? "•••" : item.text}</Text>
    </Pressable>
  ), [activeIndex, lyrics?.synced, primaryColor, rowHeight, secondaryColor, seekLine]);

  return (
    <View style={styles.panel}>
      {lyrics === null ? (
        <View style={styles.empty}><ActivityIndicator color={primaryColor} /><Text style={[styles.emptyText, { color: secondaryColor }]}>Finding lyrics…</Text></View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.list}
          data={lyrics.lines}
          extraData={activeIndex}
          renderItem={renderItem}
          keyExtractor={lyricKey}
          getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => { onTouchActivity(); userScrolling.current = true; }}
          onScrollEndDrag={() => { userScrolling.current = false; }}
          onMomentumScrollBegin={() => { userScrolling.current = true; }}
          onMomentumScrollEnd={() => { userScrolling.current = false; }}
          onContentSizeChange={scrollToActive}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="mic-outline" size={30} color={secondaryColor} /><Text style={[styles.emptyText, { color: secondaryColor }]}>Lyrics aren’t available for this track.</Text></View>}
        />
      )}
    </View>
  );
});

const queueKey = (song: Song, index: number) => `${song.id}:${index}`;
const lyricKey = (line: LyricLine, index: number) => line.id ?? `${line.time}:${index}`;
const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 0 },
  panelHeading: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  heading: { fontSize: 16, fontFamily: "Inter_700Bold" },
  caption: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  nowPlaying: { paddingVertical: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)" },
  list: { flex: 1, minHeight: 0 },
  queueRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  queueArtwork: { width: 40, height: 40, borderRadius: 8 },
  queueSong: { flex: 1, minWidth: 0 },
  queueTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  queueArtist: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  lyricRow: { justifyContent: "center", paddingVertical: 8 },
  lyricText: { fontSize: 28, lineHeight: 38, fontFamily: "Inter_700Bold" },
  empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 20 },
  emptyText: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center", lineHeight: 18 },
});
