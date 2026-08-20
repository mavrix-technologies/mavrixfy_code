import { useLocalSearchParams } from "expo-router";

function pickFirstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function usePlaylistDetailParams() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    jiosaavn?: string | string[];
    album?: string | string[];
    song?: string | string[];
    type?: string | string[];
    link?: string | string[];
    firestore?: string | string[];
    title?: string | string[];
    description?: string | string[];
    cover?: string | string[];
    songCount?: string | string[];
  }>();

  const playlistId = pickFirstParam(params.id).trim();
  const sourceLink = pickFirstParam(params.link).trim();
  const firestoreParam = pickFirstParam(params.firestore);
  const jiosaavnParam = pickFirstParam(params.jiosaavn);

  const isSongSource =
    pickFirstParam(params.song) === "true" ||
    pickFirstParam(params.type) === "song" ||
    sourceLink.includes("/song/");
  const isAlbumSource =
    !isSongSource &&
    (pickFirstParam(params.album) === "true" ||
      pickFirstParam(params.type) === "album" ||
      sourceLink.includes("/album/"));
  const isFirestoreSource = firestoreParam === "true";
  const isExplicitLocal = firestoreParam === "false" && jiosaavnParam === "false";
  const isLocalCustomPlaylist = isExplicitLocal || playlistId.startsWith("user_");
  const isJioSaavnSource =
    !isFirestoreSource &&
    !isLocalCustomPlaylist &&
    (jiosaavnParam === "true" || isSongSource || isAlbumSource || sourceLink.length > 0);
  const initialTitle = pickFirstParam(params.title).trim();
  const initialCover = pickFirstParam(params.cover).trim();
  const initialDescription = pickFirstParam(params.description).trim();
  const initialSongCount = Math.max(0, Number(pickFirstParam(params.songCount)) || 0);
  const hasPrefilledHeader = initialTitle.length > 0 || initialCover.length > 0 || initialSongCount > 0;

  return {
    playlistId,
    sourceLink,
    isSongSource,
    isAlbumSource,
    isFirestoreSource,
    isLocalCustomPlaylist,
    isJioSaavnSource,
    initialTitle,
    initialCover,
    initialDescription,
    initialSongCount,
    hasPrefilledHeader,
  };
}
