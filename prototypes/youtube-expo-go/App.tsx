import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { invalidateStream, loadPlaylist, resolveStream, safeError, searchYouTube, type YouTubePlaylist, type YouTubeSong } from './src/youtube';

export default function App() {
  const [query, setQuery] = useState('Majboor unplugged');
  const [songs, setSongs] = useState<YouTubeSong[]>([]);
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [tab, setTab] = useState<'songs' | 'playlists'>('songs');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Search YouTube Music to begin.');
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<YouTubeSong>();
  const [quality, setQuality] = useState('');
  const [playIntent, setPlayIntent] = useState(false);
  const request = useRef(0);
  const playbackRequest = useRef(0);
  const mounted = useRef(true);
  const wantsPlay = useRef(false);
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    mounted.current = true;
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix' })
      .catch(reason => setError(safeError(reason)));
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (status.didJustFinish) wantsPlay.current = false;
  }, [status.didJustFinish]);

  useEffect(() => {
    if (status.currentTime > 0 && status.playing) {
      console.info('[YT prototype] playback advancing', current?.videoId, Math.round(status.currentTime));
    }
  }, [status.currentTime, status.playing, current?.videoId]);

  const search = async () => {
    Keyboard.dismiss();
    if (!query.trim()) return;
    const version = ++request.current;
    setBusy(true); setError(''); setMessage('Searching YouTube Music…');
    try {
      const result = await searchYouTube(query);
      if (!mounted.current || version !== request.current) return;
      setSongs(result.songs); setPlaylists(result.playlists); setTab('songs');
      setMessage(`${result.songs.length} songs · ${result.playlists.length} playlists`);
      console.info('[YT prototype] search', result.songs.length, result.playlists.length);
    } catch (reason) { if (mounted.current && version === request.current) setError(safeError(reason)); }
    finally { if (mounted.current && version === request.current) setBusy(false); }
  };

  const openPlaylist = async (playlist: YouTubePlaylist) => {
    const version = ++request.current;
    setBusy(true); setError(''); setMessage(`Loading ${playlist.title}…`);
    try {
      const page = await loadPlaylist(playlist.id);
      if (!mounted.current || version !== request.current) return;
      setSongs(page.songs); setTab('songs');
      setMessage(`${playlist.title}: ${page.songs.length} tracks${page.hasMore ? ' (first page only in this prototype)' : ''}`);
    } catch (reason) { if (mounted.current && version === request.current) setError(safeError(reason)); }
    finally { if (mounted.current && version === request.current) setBusy(false); }
  };

  const play = async (song: YouTubeSong, fresh = false) => {
    const version = ++playbackRequest.current;
    wantsPlay.current = true;
    setPlayIntent(true);
    player.pause();
    setCurrent(song); setQuality(''); setError('');
    if (fresh) invalidateStream(song.videoId);
    try {
      const stream = await resolveStream(song.videoId, stage => {
        if (mounted.current && version === playbackRequest.current) setMessage(stage);
      });
      if (!mounted.current || version !== playbackRequest.current) return;
      player.replace({ uri: stream.url, headers: stream.headers });
      setQuality(`AAC · ${Math.round(stream.bitrate / 1000)} kbps · ${stream.client}`);
      setMessage('Stream ready. Waiting for audio playback…');
      console.info('[YT prototype] stream ready', song.videoId, stream.client, stream.bitrate);
      if (wantsPlay.current) player.play();
    } catch (reason) {
      if (mounted.current && version === playbackRequest.current) {
        wantsPlay.current = false; setPlayIntent(false); setMessage('This stream could not be played.'); setError(safeError(reason));
        console.info('[YT prototype] resolution failed', song.videoId, safeError(reason));
      }
    }
  };

  const toggle = () => {
    wantsPlay.current = !wantsPlay.current;
    setPlayIntent(wantsPlay.current);
    if (wantsPlay.current) player.play();
    else { player.pause(); setMessage('Paused.'); }
  };

  const items = tab === 'songs' ? songs : playlists;
  return (
    <SafeAreaProvider><SafeAreaView style={styles.page}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>MAVRIXFY · EXPO GO TEST</Text>
        <Text style={styles.heading}>YouTube Music</Text>
        <Text style={styles.subtitle}>Shared TypeScript on Android + iOS</Text>
        <View style={styles.search}>
          <TextInput value={query} onChangeText={setQuery} style={styles.input} placeholder="Song or artist"
            placeholderTextColor="#8b91a8" returnKeyType="search" onSubmitEditing={search} />
          <Pressable style={styles.button} disabled={busy} onPress={search}><Text style={styles.buttonText}>Search</Text></Pressable>
        </View>
        <View style={styles.tabs}>
          {(['songs', 'playlists'] as const).map(value => <Pressable key={value} onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.selected]}><Text style={styles.text}>{value === 'songs' ? `Songs ${songs.length}` : `Playlists ${playlists.length}`}</Text></Pressable>)}
        </View>
        {busy && <ActivityIndicator color="#c5ff78" />}
        <Text style={styles.message}>{status.didJustFinish ? 'Finished.' : status.playing && status.currentTime > 0 ? 'Audio is playing.' : message}</Text>
        {!!error && <Text selectable style={styles.error}>{error}</Text>}
      </View>
      <FlatList<YouTubeSong | YouTubePlaylist> data={items} keyExtractor={item => item.id}
        contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>Search results will appear here.</Text>}
        renderItem={({ item }) => <Pressable style={styles.row} disabled={busy}
          onPress={() => 'videoId' in item ? void play(item) : void openPlaylist(item)}>
          {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.cover} /> : <View style={styles.cover} />}
          <View style={styles.rowText}><Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{item.artist}</Text></View>
          <Text style={styles.action}>{'videoId' in item ? '▶' : '›'}</Text>
        </Pressable>} />
      {current && <View style={styles.player}>
        <Text numberOfLines={1} style={styles.title}>{current.title}</Text>
        <Text selectable style={styles.subtitle}>{current.videoId} · {quality}</Text>
        <Text style={styles.message}>{Math.floor(status.currentTime)}s / {Math.floor(status.duration)}s</Text>
        <View style={styles.tabs}>
          <Pressable style={styles.tab} onPress={toggle}><Text style={styles.text}>{playIntent && !status.didJustFinish ? 'Pause' : 'Play'}</Text></Pressable>
          <Pressable style={styles.tab} onPress={() => player.seekTo(Math.min(status.duration || Infinity, status.currentTime + 10))}><Text style={styles.text}>Seek +10s</Text></Pressable>
          <Pressable style={styles.tab} onPress={() => play(current, true)}><Text style={styles.text}>Fresh stream</Text></Pressable>
        </View>
      </View>}
    </SafeAreaView></SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#10131d' }, header: { padding: 20, paddingBottom: 8 },
  eyebrow: { color: '#c5ff78', fontSize: 11, letterSpacing: 2, marginBottom: 10 },
  heading: { color: '#fff', fontWeight: '700', fontSize: 30 }, subtitle: { color: '#a4abc2', fontSize: 12, marginTop: 4 },
  text: { color: '#fff', fontSize: 13 }, search: { flexDirection: 'row', gap: 8, marginTop: 20 },
  input: { flex: 1, backgroundColor: '#222737', color: '#fff', borderRadius: 12, padding: 12 },
  button: { backgroundColor: '#c5ff78', borderRadius: 12, justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { color: '#151b0e', fontWeight: '700' }, tabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tab: { padding: 12, borderRadius: 10, backgroundColor: '#282e40' }, selected: { backgroundColor: '#465137' },
  message: { color: '#bac4dd', fontSize: 12, marginTop: 10 }, error: { color: '#ffabab', fontSize: 12, marginTop: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 16 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  cover: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#282e40' }, rowText: { flex: 1 },
  title: { color: '#fff', fontSize: 14, fontWeight: '600' }, action: { color: '#c5ff78', fontSize: 20 },
  empty: { color: '#8b91a8', paddingTop: 24 }, player: { padding: 16, backgroundColor: '#202637' },
});
