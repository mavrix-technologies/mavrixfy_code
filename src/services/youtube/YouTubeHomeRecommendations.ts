import type { YouTubeHomePlaylist, YouTubeHomeSection } from "./YouTubeMusic";
import type { Song } from "@/lib/musicData";
import { isYouTubeSong, loadYouTubeHome, previewYouTubePlaylist, relatedYouTubeSongs } from "./YouTubeMusic";
import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import { interleaveYouTubeRadio, rankYouTubeCandidates, selectYouTubeRadioSeeds } from "./YouTubeRecommendationPolicy";

export function rankYouTubeRecommendations(candidates: Song[], seeds: Song[], limit = 24): Song[] {
  return rankYouTubeCandidates(candidates.filter(isYouTubeSong), seeds, limit);
}

export interface YouTubeRecommendationFeed { songs: Song[]; playlists: YouTubeHomePlaylist[]; sections: YouTubeHomeSection[]; personalized: boolean }
export async function getYouTubeHomeRecommendations(seeds: Song[], signal: AbortSignal,
  onPartial?: (feed: YouTubeRecommendationFeed) => void): Promise<YouTubeRecommendationFeed> {
  const scope = getAccountScope();
  const isCurrent = () => !signal.aborted && isCurrentAccount(scope);
  const assertCurrent = () => { if (!isCurrent()) throw new Error("YouTube request cancelled"); };
  assertCurrent();
  const youtubeSeeds = selectYouTubeRadioSeeds(seeds.filter(isYouTubeSong));
  // Start both independently, but publish usable catalog rows without waiting
  // for radio generation or playlist previews.
  const radioTask = Promise.allSettled(youtubeSeeds.map(seed => relatedYouTubeSongs(seed, signal)));
  const home = await loadYouTubeHome(signal, page => {
    if (isCurrent() && page.sections?.length) onPartial?.({ songs: rankYouTubeRecommendations(page.songs, seeds),
      playlists: page.playlists.slice(0, 60), sections: page.sections, personalized: false });
  }).catch(() => ({ songs: [], playlists: [], sections: [] }));
  assertCurrent();
  const baseSections: YouTubeHomeSection[] = [...(home.sections || [])];
  if (!baseSections.length) {
    if (home.songs.length) baseSections.push({ id: "youtube-discover", title: "Discover", songs: rankYouTubeRecommendations(home.songs, [], 20), playlists: [] });
    if (home.playlists.length) baseSections.push({ id: "youtube-playlists", title: "Mixes & playlists", songs: [], playlists: home.playlists.slice(0, 60) });
  }
  if (baseSections.length) onPartial?.({ songs: rankYouTubeRecommendations(home.songs, seeds), playlists: home.playlists.slice(0, 60), sections: baseSections, personalized: false });
  const radioResults = await radioTask;
  assertCurrent();
  const radio = interleaveYouTubeRadio(radioResults.flatMap(result => result.status === "fulfilled" ? [result.value as Song[]] : []));
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
  assertCurrent();
  if (!songs.length && !home.playlists.length) throw new Error("Mavrixfy Music recommendations are unavailable. Please retry.");
  const sections: YouTubeHomeSection[] = [...sampledSections, ...baseSections];
  const radioSongs = rankYouTubeRecommendations(radio, seeds, 20);
  if (radioSongs.length) sections.unshift({ id: "youtube-for-you", title: "Recommended for you", songs: radioSongs, playlists: [] });
  return { songs, playlists: home.playlists.slice(0, 60), sections: sections.filter(section => section.songs.length || section.playlists.length).slice(0, 12), personalized: radioSongs.length > 0 };
}
