import { useCallback, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View, type ListRenderItemInfo } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppTopHeader, { APP_TOP_HEADER_HEIGHT, AppTopHeaderIconButton } from "@/components/AppTopHeader";
import SongRow from "@/components/SongRow";
import { safeGoBack } from "@/utils/navigation";
import { getRecentlyPlayed, type RecentlyPlayedItem } from "@/lib/storage";
import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import { useAuth } from "@/contexts/AuthContext";
import { filterListeningHistory, historySong } from "./listeningHistory";

const historyKeyExtractor = (item: RecentlyPlayedItem) => item.id;

export function ListeningHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const scope = getAccountScope();
  const [data, setData] = useState<{ owner: string | null; generation: number; items: RecentlyPlayedItem[] } | null>(null);
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(0);
  const [error, setError] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    const owner = getAccountScope();
    if (owner.accountId !== (user?.id ?? null)) return;
    setData(null); setError(false); setQuery("");
    void getRecentlyPlayed().then(items => {
      if (active && isCurrentAccount(owner)) setData({ owner: owner.accountId, generation: owner.generation, items });
    }).catch(() => { if (active && isCurrentAccount(owner)) setError(true); });
    return () => { active = false; };
  }, [user?.id]));
  const expectedOwner = user?.id ?? null;
  const items = useMemo(() => data?.owner === scope.accountId && data?.owner === expectedOwner && data.generation === scope.generation ? data.items : [], [data, scope.accountId, scope.generation, expectedOwner]);
  const filtered = useMemo(() => filterListeningHistory(items, query, days), [items, query, days]);
  const queue = useMemo(() => filtered.map(historySong), [filtered]);
  const top = Platform.OS === "web" ? 20 : insets.top;
  const bottomPadding = Math.max(150, insets.bottom + 126);
  const contentContainerStyle = useMemo(() => ({ paddingBottom: bottomPadding }), [bottomPadding]);
  const renderHistoryItem = useCallback(
    ({ item, index }: ListRenderItemInfo<RecentlyPlayedItem>) => (
      <SongRow
        song={queue[index]}
        queue={queue}
        queueKey="listening-history"
        subtitle={`${historySong(item).artist} · ${new Date(item.lastPlayed).toLocaleString()}`}
      />
    ),
    [queue]
  );
  return <View style={styles.screen}>
    <AppTopHeader topInset={top} title="Listening history" elevated left={<AppTopHeaderIconButton onPress={safeGoBack} accessibilityLabel="Back" />} />
    <View style={[styles.controls, { marginTop: top + APP_TOP_HEADER_HEIGHT }]}>
      <Text style={styles.note}>Recent saved songs · latest play per song</Text>
      <TextInput value={query} onChangeText={setQuery} placeholder="Song, artist, or date (YYYY-MM-DD)" placeholderTextColor="#81909F"
        accessibilityLabel="Search listening history" style={styles.search} autoCorrect={false} clearButtonMode="while-editing" />
      <View style={styles.filters}>{[[0, "All saved"], [7, "7 days"], [30, "30 days"]].map(([value, label]) =>
        <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: days === value }}
          onPress={() => setDays(Number(value))} style={[styles.filter, days === value && styles.selected]}><Text style={styles.text}>{label}</Text></Pressable>)}</View>
    </View>
    <FlatList data={filtered} keyExtractor={historyKeyExtractor} keyboardShouldPersistTaps="handled"
      contentContainerStyle={contentContainerStyle}
      renderItem={renderHistoryItem}
      ListEmptyComponent={<Text style={styles.empty}>{error ? "History could not be loaded. Reopen this screen to retry." : !data ? "Loading history…" : query || days ? "No songs match these filters." : "Your recently played songs will appear here."}</Text>} />
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0F14" }, controls: { padding: 16, gap: 12 },
  note: { color: "#9FAAB6", fontSize: 12 }, search: { backgroundColor: "#18212B", color: "#FFF", padding: 12, borderRadius: 12 },
  filters: { flexDirection: "row", gap: 10 }, filter: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: "#18212B" },
  selected: { backgroundColor: "#354C46" }, text: { color: "#FFF", fontSize: 13 }, empty: { padding: 24, color: "#9FAAB6", textAlign: "center" },
});
