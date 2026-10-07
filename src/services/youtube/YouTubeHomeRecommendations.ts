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

export async function getYouTubeHomeRecommendations(seeds: Song[], signal: AbortSignal) {
  const youtubeSeeds = seeds.filter(isYouTubeSong).slice(0, 2);
  const [homeResult, ...radioResults] = await Promise.allSettled([
    loadYouTubeHome(signal), ...youtubeSeeds.map(seed => relatedYouTubeSongs(seed, signal)),
  ]);
  if (signal.aborted) throw new Error("YouTube request cancelled");
  const home = homeResult.status === "fulfilled" ? homeResult.value : { songs: [], playlists: [] };
  const radio = radioResults.flatMap(result => result.status === "fulfilled" ? result.value as Song[] : []);
  let songs = rankYouTubeRecommendations([...radio, ...home.songs], seeds);
  // Anonymous home can expose only mixes. Sample two, as LastWave does, without
  // substituting a JioSaavn search or resolving streams during feed loading.
  if (songs.length < 6 && home.playlists.length) {
    const mixes = await Promise.allSettled(home.playlists.slice(0, 2).map(item => previewYouTubePlaylist(item.id, signal)));
    songs = rankYouTubeRecommendations([...songs, ...mixes.flatMap(result => result.status === "fulfilled" ? result.value : [])], seeds);
  }
  if (signal.aborted) throw new Error("YouTube request cancelled");
  if (!songs.length && !home.playlists.length) throw new Error("YouTube Music recommendations are unavailable. Please retry.");
  return { songs, playlists: home.playlists.slice(0, 20), personalized: radio.length > 0 };
}
