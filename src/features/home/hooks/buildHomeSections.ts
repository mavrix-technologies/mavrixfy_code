import type { HomeSectionItem } from "./useHomeSectionData";
import type { YouTubeHomeSection } from "@/services/youtube/YouTubeMusic";

export type HomeListItem = HomeSectionItem
  | { id: "youtube-quick-picks"; type: "youtube-quick-picks" }
  | { id: "youtube-status"; type: "youtube-status" }
  | { id: "releases-status"; type: "releases-status" }
  | { id: string; type: "youtube-section"; section: YouTubeHomeSection };

export function buildHomeSections(category: string, youtubeEnabled: boolean, sections: YouTubeHomeSection[],
  jioSections: HomeSectionItem[], explore: YouTubeHomeSection[] = []): HomeListItem[] {
  if (!youtubeEnabled || category === "Recently Played") return jioSections;
  // Provider rows retain their own data and tap queues. JioSaavn is never a
  // replacement for a missing or failed YouTube feed.
  const jio = jioSections.filter(item => item.type === "category").slice(0, 2);
  const rows = (items: YouTubeHomeSection[]): HomeListItem[] => items.map(section => ({ id: section.id, type: "youtube-section", section }));
  const releaseShelves = explore.filter(section => section.category === "new-releases");
  const latest: YouTubeHomeSection = { id: "youtube-new-releases", title: "New Releases", category: "new-releases",
    songs: [...new Map(releaseShelves.flatMap(section => section.songs).map(song => [song.id, song])).values()],
    playlists: [...new Map(releaseShelves.flatMap(section => section.playlists).map(item => [item.id, item])).values()],
  };
  const discovery = [
    ...explore.filter(section => section.category !== "new-releases"),
    ...sections.filter(section => section.id === "youtube-for-you" ||
      (!explore.some(row => row.id.startsWith("youtube-regional-")) &&
        /\b(hindi|punjabi|tamil|telugu|marathi|bengali|bollywood|indian)\b/i.test(section.title))),
  ];
  const releasesAvailable = latest.songs.length || latest.playlists.length;
  if (category === "New Releases") return releasesAvailable ? rows([latest]) : [{ id: "releases-status", type: "releases-status" }];
  if (category === "Songs" || category === "Playlists" || category === "Albums") {
    const filtered = discovery.map(section => ({ ...section,
      songs: category === "Songs" ? section.songs : [],
      playlists: category === "Songs" ? [] : section.playlists.filter(item => category === "Albums" ? item.kind === "album" : item.kind !== "album"),
    })).filter(section => section.songs.length || section.playlists.length);
    return [...(category === "Songs" ? [{ id: "youtube-quick-picks", type: "youtube-quick-picks" } as HomeListItem] : []),
      ...rows(filtered), { id: "youtube-status", type: "youtube-status" }];
  }
  const youtube: HomeListItem[] = [
    { id: "youtube-quick-picks", type: "youtube-quick-picks" },
    ...(latest.songs.length || latest.playlists.length ? rows([latest]) : [{ id: "releases-status", type: "releases-status" } as HomeListItem]),
    ...rows(discovery),
    ...(latest.songs.length || latest.playlists.length ? [{ id: "releases-status", type: "releases-status" } as HomeListItem] : []),
    { id: "youtube-status", type: "youtube-status" },
  ];
  // Keep two independent catalog breaks after the primary discovery rows.
  const result = [...youtube];
  jio.forEach((item, index) => result.splice(Math.min(4 + index * 4, result.length - 1), 0, item));
  const artists = jioSections.find(item => item.type === "artists");
  if (artists) result.splice(Math.min(3, result.length), 0, artists);
  return result;
}
