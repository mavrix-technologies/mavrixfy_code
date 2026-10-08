import type { YouTubeHomePlaylist, YouTubeHomeSection } from "./YouTubeMusic";
import type { Song } from "@/lib/musicData";
import { isYouTubeSong, loadYouTubeHome, previewYouTubePlaylist, relatedYouTubeSongs } from "./YouTubeMusic";

// LastWave prioritizes radio candidates and limits repeated artists in discovery.
export function rankYouTubeRecommendations(candidates: Song[], seeds: Song[], limit = 24): Song[] {
  const seen = new Set(seeds.map(song => song.id));
  const artists = new Map<string, number>();
  const selected: Song[] = [], deferred: Song[] = [];
  for (const song of candidates) {
    if (!isYouTubeSong(song) || seen.has(song.id)) continue;
    seen.add(song.id);
    const artist = song.artist.trim().toLowerCase();
    const count = artists.get(artist) || 0;
    if (count >= 2) { deferred.push(song); continue; }
    artists.set(artist, count + 1);
    selected.push(song);
  }
  return [...selected, ...deferred].slice(0, limit);
}

export interface YouTubeRecommendationFeed { songs: Song[]; playlists: YouTubeHomePlaylist[]; sections: YouTubeHomeSection[]; personalized: boolean }
export async function getYouTubeHomeRecommendations(seeds: Song[], signal: AbortSignal,
  onPartial?: (feed: YouTubeRecommendationFeed) => void): Promise<YouTubeRecommendationFeed> {
  const youtubeSeeds = seeds.filter(isYouTubeSong).slice(0, 2);
  // Start both independently, but publish usable catalog rows without waiting
  // for radio generation or playlist previews.
  const radioTask = Promise.allSettled(youtubeSeeds.map(seed => relatedYouTubeSongs(seed, signal)));
  const home = await loadYouTubeHome(signal, page => {
    if (!signal.aborted && page.sections?.length) onPartial?.({ songs: rankYouTubeRecommendations(page.songs, seeds),
      playlists: page.playlists.slice(0, 60), sections: page.sections, personalized: false });
  }).catch(() => ({ songs: [], playlists: [], sections: [] }));
  if (signal.aborted) throw new Error("YouTube request cancelled");
  const baseSections: YouTubeHomeSection[] = [...(home.sections || [])];
  if (!baseSections.length) {
    if (home.songs.length) baseSections.push({ id: "youtube-discover", title: "Discover", songs: rankYouTubeRecommendations(home.songs, [], 20), playlists: [] });
    if (home.playlists.length) baseSections.push({ id: "youtube-playlists", title: "Mixes & playlists", songs: [], playlists: home.playlists.slice(0, 60) });
  }
  if (baseSections.length) onPartial?.({ songs: rankYouTubeRecommendations(home.songs, seeds), playlists: home.playlists.slice(0, 60), sections: baseSections, personalized: false });
  const radioResults = await radioTask;
  if (signal.aborted) throw new Error("YouTube request cancelled");
  const radio = radioResults.flatMap(result => result.status === "fulfilled" ? result.value as Song[] : []);
  const sampledSections: YouTubeHomeSection[] = [];
  let songs = rankYouTubeRecommendations([...radio, ...home.songs], seeds);
  // Anonymous home can expose only mixes. Sample two, as LastWave does, without
  // substituting a JioSaavn search or resolving streams during feed loading.
  if (songs.length < 6 && home.playlists.length) {
    const sampledPlaylists = home.playlists.slice(0, 2);
    const mixes = await Promise.allSettled(sampledPlaylists.map(item => previewYouTubePlaylist(item.id, signal)));
    mixes.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const songs = rankYouTubeRecommendations(result.value, [], 20);
      if (songs.length) sampledSections.push({ id: `youtube-preview-${sampledPlaylists[index].id}`,
        title: sampledPlaylists[index].name ? `From ${sampledPlaylists[index].name}` : "Playlist discoveries", songs, playlists: [] });
    });
    songs = rankYouTubeRecommendations([...songs, ...mixes.flatMap(result => result.status === "fulfilled" ? result.value : [])], seeds);
  }
  if (signal.aborted) throw new Error("YouTube request cancelled");
  if (!songs.length && !home.playlists.length) throw new Error("YouTube Music recommendations are unavailable. Please retry.");
  const sections: YouTubeHomeSection[] = [...sampledSections, ...baseSections];
  if (radio.length) sections.unshift({ id: "youtube-for-you", title: "Recommended for you",
    songs: rankYouTubeRecommendations(radio, seeds, 20), playlists: [] });
  return { songs, playlists: home.playlists.slice(0, 60), sections: sections.filter(section => section.songs.length || section.playlists.length).slice(0, 12), personalized: radio.length > 0 };
}
