import { useState, useEffect, useMemo, useCallback } from "react";
import { router } from "expo-router";
import { safeGoBack } from "@/utils/navigation";
import { searchArtists, getArtistDetails } from "@/data/providers/ArtistProvider";
import { convertJioSaavnSong, getBestImageUrl, type Song } from "@/lib/musicData";

export interface UseArtistDiscoveryParams {
  screenSong: Song | null;
  playingQueue: Song[];
  activeQueueIndex: number;
  playSong: (song: Song, queue: Song[]) => void;
}

export function useArtistDiscovery({
  screenSong,
  playingQueue,
  activeQueueIndex,
  playSong,
}: UseArtistDiscoveryParams) {
  const [artistDetails, setArtistDetails] = useState<any>(null);
  const [artistLoading, setArtistLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!screenSong?.artist) {
      setArtistDetails(null);
      return;
    }

    async function loadArtist() {
      if (!active) return;
      setArtistLoading(true);
      try {
        const currentArtist = screenSong?.artist;
        if (!currentArtist) return;
        const query = currentArtist.split(",")[0].trim();
        const artists = await searchArtists(query);
        if (!active) return;
        if (artists.length > 0) {
          const details = await getArtistDetails(artists[0].id);
          if (!active) return;
          setArtistDetails(details);
        } else {
          setArtistDetails(null);
        }
      } catch {
        // Ignore fetch errors
      } finally {
        if (active) setArtistLoading(false);
      }
    }

    void loadArtist();
    return () => {
      active = false;
    };
  }, [screenSong?.artist]);

  const relatedSongs = useMemo<Song[]>(() => {
    if (!artistDetails?.topSongs) return [];
    const filtered = artistDetails.topSongs.flatMap((item: any) => {
      const s = convertJioSaavnSong(item);
      return s.id !== screenSong?.id ? [s] : [];
    });
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
