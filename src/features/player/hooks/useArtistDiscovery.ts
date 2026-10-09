import { getArtistDetails,type ArtistDetails } from "@/data/providers/ArtistProvider";
import { getBestImageUrl,type Song } from "@/lib/musicData";
import { isYouTubeSong,relatedYouTubeSongs,searchYouTubeMusic } from "@/services/youtube/YouTubeMusic";
import { validArtistChannelId } from "@/services/youtube/YouTubeArtists";
import { safeGoBack } from "@/utils/navigation";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback,useEffect,useState } from "react";

export interface UseArtistDiscoveryParams {
  enabled?: boolean;
  screenSong: Song | null;
  playingQueue: Song[];
  activeQueueIndex: number;
  playSong: (song: Song, queue: Song[]) => void;
}

export function useArtistDiscovery({
  enabled = true,
  screenSong,
  playingQueue,
  activeQueueIndex,
  playSong,
}: UseArtistDiscoveryParams) {
  const [artistDetails, setArtistDetails] = useState<ArtistDetails | null>(null);
  const [artistLoading, setArtistLoading] = useState(false);
  const channelId = screenSong?.artistRefs?.find((artist) => validArtistChannelId(artist.id))?.id;
  const artistQuery = screenSong?.artist?.split(",")[0].trim() || "";
  const { data: relatedSongs = [] } = useQuery({
    queryKey: ["playerRelatedSongs", screenSong?.id, screenSong?.title, screenSong?.artist],
    enabled: enabled && Boolean(screenSong?.title),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const song = screenSong!;
      const candidates = isYouTubeSong(song)
        ? await relatedYouTubeSongs(song, signal)
        : (await searchYouTubeMusic(
            `${song.title} ${song.artist.split(",")[0]}`.trim(), "songs", signal
          )).songs;
      const seen = new Set<string>();
      return candidates.filter(candidate => {
        if (!isYouTubeSong(candidate) || candidate.id === song.id || seen.has(candidate.id)) return false;
        seen.add(candidate.id);
        return true;
      }).slice(0, 5);
    },
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    if (!artistQuery) {
      // A song without an artist must clear the previous artist's details.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setArtistDetails(null);
      return;
    }

    async function loadArtist() {
      if (!active) return;
      setArtistLoading(true);
      setArtistDetails(null);
      try {
        const details = await getArtistDetails(channelId || "", artistQuery);
        if (active) setArtistDetails(details);
      } catch {
        if (active) setArtistDetails(null);
      } finally {
        if (active) setArtistLoading(false);
      }
    }

    void loadArtist();
    return () => {
      active = false;
    };
  }, [enabled, artistQuery, channelId]);

  const handleViewArtistProfile = useCallback(() => {
    if (!artistDetails) return;
    safeGoBack();
    setTimeout(() => {
      router.push({
        pathname: "/artist/[id]",
        params: {
          id: artistDetails.id,
          name: artistDetails.name,
          image: artistDetails.image?.length ? getBestImageUrl(artistDetails.image) : "",
        },
      });
    }, 120);
  }, [artistDetails]);

  const handlePlayRelatedSong = useCallback(
    (song: Song) => {
      const upcomingYouTubeSongs = playingQueue
        .slice(activeQueueIndex + 1)
        .filter((upcoming) => isYouTubeSong(upcoming) && upcoming.id !== song.id);
      playSong(song, [song, ...upcomingYouTubeSongs]);
    },
    [playingQueue, activeQueueIndex, playSong]
  );

  return {
    artistDetails,
    artistLoading,
    relatedSongs,
    handleViewArtistProfile,
    handlePlayRelatedSong,
  };
}
