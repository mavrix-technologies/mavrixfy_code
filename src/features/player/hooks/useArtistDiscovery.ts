import { getArtistDetails,searchArtists,type ArtistDetails } from "@/data/providers/ArtistProvider";
import { getBestImageUrl,type Song } from "@/lib/musicData";
import { safeGoBack } from "@/utils/navigation";
import { router } from "expo-router";
import { useCallback,useEffect,useMemo,useState } from "react";

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
  const channelId = screenSong?.artistRefs?.[0]?.id;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    if (!screenSong?.artist) {
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
        const currentArtist = screenSong?.artist;
        if (!currentArtist) return;
        const query = currentArtist.split(",")[0].trim();
        if (channelId) {
          const details = await getArtistDetails(channelId);
          if (active) setArtistDetails(details);
          return;
        }
        const artists = await searchArtists(query);
        if (!active) return;
        if (artists.length > 0) {
          const match = artists.find(artist => artist.name.toLowerCase() === query.toLowerCase());
          const details = match ? await getArtistDetails(match.id) : null;
          if (!active) return;
          setArtistDetails(details);
        } else {
          setArtistDetails(null);
        }
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
  }, [enabled, screenSong?.artist, channelId]);

  const relatedSongs = useMemo<Song[]>(() => {
    if (!artistDetails?.topSongs) return [];
    const filtered = artistDetails.topSongs.filter(song => song.id !== screenSong?.id);
    return filtered.slice(0, 5);
  }, [artistDetails, screenSong?.id]);

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
      playSong(song, [song, ...playingQueue.slice(activeQueueIndex + 1)]);
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
