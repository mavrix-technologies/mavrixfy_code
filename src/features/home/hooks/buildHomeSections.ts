import type { HomeSectionItem } from "./useHomeSectionData";
import type { YouTubeHomeSection } from "@/services/youtube/YouTubeMusic";
import type { MavrixfyCategory } from "../constants/homeNavConstants";

export type HomeListItem = HomeSectionItem
  | { id: "youtube-quick-picks"; type: "youtube-quick-picks" }
  | { id: "youtube-status"; type: "youtube-status" }
  | { id: "releases-status"; type: "releases-status" }
  | { id: string; type: "youtube-section"; section: YouTubeHomeSection };

export function buildHomeSections(
  category: MavrixfyCategory,
  youtubeEnabled: boolean,
  sections: YouTubeHomeSection[],
  jioSections: HomeSectionItem[],
  explore: YouTubeHomeSection[] = [],
  sourceSettings?: { enableJioSaavn?: boolean; enableSpotify?: boolean; enableYouTubeMusic?: boolean }
): HomeListItem[] {
  const enableSpotify = sourceSettings?.enableSpotify ?? true;
  const enableYouTubeMusic = (sourceSettings?.enableYouTubeMusic ?? true) && youtubeEnabled;

  if (category === "Recently Played" || !youtubeEnabled) return jioSections;

  const spotifySections = enableSpotify
    ? jioSections.filter((item) => item.type === "category" && item.category?.id?.startsWith("spotify"))
    : [];
  const spotifySection = spotifySections[0] || (enableSpotify ? jioSections.find((item) => item.type === "category" && item.category?.id === "spotify") : undefined);
  const spotifyMixes = spotifySections.find((item) => item.type === "category" && item.category?.id === "spotify-mixes");
  const spotifyMoods = spotifySections.find((item) => item.type === "category" && item.category?.id === "spotify-moods");

  const enableJioSaavn = sourceSettings?.enableJioSaavn !== undefined
    ? sourceSettings.enableJioSaavn
    : (spotifySections.length > 0 ? false : true);
  const otherJio = enableJioSaavn
    ? jioSections.filter((item) => item.type === "category" && !item.category?.id?.startsWith("spotify")).slice(0, 2)
    : [];
  const jio = otherJio;

  const rows = (items: YouTubeHomeSection[]): HomeListItem[] =>
    items.map((section) => ({ id: section.id, type: "youtube-section", section }));

  const releaseShelves = enableYouTubeMusic ? explore.filter((section) => section.category === "new-releases") : [];
  const hasRegionalShelves = enableYouTubeMusic && explore.some((section) => section.id.startsWith("youtube-regional-"));
  const latest: YouTubeHomeSection = {
    id: "youtube-new-releases",
    title: "New Releases",
    category: "new-releases",
    songs: [...new Map(releaseShelves.flatMap((section) => section.songs).map((song) => [song.id, song])).values()],
    playlists: [...new Map(releaseShelves.flatMap((section) => section.playlists).map((item) => [item.id, item])).values()],
  };

  const isExcludedLanguage = (text: string) =>
    /\b(tamil|telugu|marathi|bengali|kannada|malayalam|bhojpuri|gujarati)\b/i.test(text);

  const seenDiscoveryIds = new Set<string>();
  const discovery = enableYouTubeMusic
    ? [
        ...explore.filter(
          (section) =>
            section.category !== "new-releases" &&
            !isExcludedLanguage(section.title) &&
            !isExcludedLanguage(section.id)
        ),
        ...sections.filter(
          (section) =>
            (section.id === "youtube-for-you" ||
              (!hasRegionalShelves &&
                /\b(hindi|punjabi|bollywood|indian)\b/i.test(section.title))) &&
            !isExcludedLanguage(section.title) &&
            !isExcludedLanguage(section.id)
        ),
      ].filter((section) => {
        if (!section?.id || seenDiscoveryIds.has(section.id)) return false;
        seenDiscoveryIds.add(section.id);
        return true;
      })
    : [];

  if (category === "Spotify") {
    return spotifySections.length ? spotifySections : spotifySection ? [spotifySection] : [];
  }

  const releasesAvailable = latest.songs.length || latest.playlists.length;
  if (category === "New Releases") {
    return releasesAvailable ? rows([latest]) : [{ id: "releases-status", type: "releases-status" }];
  }

  if (category === "Songs" || category === "Playlists" || category === "Albums") {
    const filtered = discovery
      .map((section) => ({
        ...section,
        songs: category === "Songs" ? section.songs : [],
        playlists:
          category === "Songs"
            ? []
            : section.playlists.filter((item) => (category === "Albums" ? item.kind === "album" : item.kind !== "album")),
      }))
      .filter((section) => section.songs.length || section.playlists.length);

    return [
      ...(category === "Playlists" ? (spotifySections.length ? spotifySections : spotifySection ? [spotifySection] : []) : []),
      ...(category === "Songs" && enableYouTubeMusic ? ([{ id: "youtube-quick-picks", type: "youtube-quick-picks" }] as HomeListItem[]) : []),
      ...rows(filtered),
      ...(enableYouTubeMusic ? [{ id: "youtube-status", type: "youtube-status" } as HomeListItem] : []),
    ];
  }

  // Interleave Spotify sections into YouTube discovery stream
  const remainingDiscovery = [...discovery];
  const firstDiscovery = spotifyMixes ? remainingDiscovery.shift() : null;
  const secondDiscovery = spotifyMoods ? remainingDiscovery.shift() : null;

  const youtube: HomeListItem[] = [
    ...(enableYouTubeMusic ? [{ id: "youtube-quick-picks", type: "youtube-quick-picks" } as HomeListItem] : []),
    ...(spotifySection ? [spotifySection] : []),
    ...(releasesAvailable ? rows([latest]) : ([{ id: "releases-status", type: "releases-status" }] as HomeListItem[])),
    ...(firstDiscovery ? rows([firstDiscovery]) : []),
    ...(spotifyMixes ? [spotifyMixes] : []),
    ...(secondDiscovery ? rows([secondDiscovery]) : []),
    ...(spotifyMoods ? [spotifyMoods] : []),
    ...rows(remainingDiscovery),
    ...(enableYouTubeMusic ? [{ id: "youtube-status", type: "youtube-status" } as HomeListItem] : []),
  ];

  const result = [...youtube];
  if (enableJioSaavn) {
    jio.forEach((item, index) => result.splice(Math.min(4 + index * 4, result.length - 1), 0, item));
    const artists = jioSections.find((item) => item.type === "artists");
    if (artists) result.splice(Math.min(3, result.length), 0, artists);
  }
  const recent = jioSections.find((item) => item.type === "recently-played");
  if (recent) result.splice(1, 0, recent);
  return result;
}
