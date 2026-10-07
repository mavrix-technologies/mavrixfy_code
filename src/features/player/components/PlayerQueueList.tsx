import React from "react";
import { View, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import type { Song } from "@/lib/musicData";
import { styles } from "../styles/playerScreenStyles";

export function getQueueWindow(count: number, rowHeight: number, viewport: number, offset: number) {
  const visible = Math.max(1, Math.ceil(viewport / rowHeight));
  const first = Math.max(0, Math.min(count - 1, Math.floor(offset / rowHeight)));
  const start = Math.max(0, first - visible);
  const end = Math.min(count, first + visible * 2);
  return { start, end, top: start * rowHeight, bottom: (count - end) * rowHeight };
}

export const PlayerQueueList = React.memo(function PlayerQueueList({ songs, rowHeight, keyExtractor, renderItem }: {
  songs: Song[];
  rowHeight: number;
  keyExtractor: (song: Song, index: number) => string;
  renderItem: (item: { item: Song; index: number }) => React.ReactElement;
}) {
  const [viewport, setViewport] = React.useState(400);
  const [offset, setOffset] = React.useState(0);
  const range = getQueueWindow(songs.length, rowHeight, viewport, offset);
  const onScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.max(0, event.nativeEvent.contentOffset.y);
    setOffset(previous => Math.floor(previous / rowHeight) === Math.floor(next / rowHeight) ? previous : next);
  }, [rowHeight]);
  return (
    <ScrollView contentContainerStyle={styles.queueListContent} nestedScrollEnabled bounces={false}
      showsVerticalScrollIndicator={false} overScrollMode="never" scrollEventThrottle={16} onScroll={onScroll}
      onLayout={event => setViewport(Math.max(1, event.nativeEvent.layout.height))}>
      <View style={{ height: range.top }} />
      {songs.slice(range.start, range.end).map((item, localIndex) => {
        const index = range.start + localIndex;
        return <View key={keyExtractor(item, index)} style={{ height: rowHeight }}>{renderItem({ item, index })}</View>;
      })}
      <View style={{ height: range.bottom }} />
    </ScrollView>
  );
});
