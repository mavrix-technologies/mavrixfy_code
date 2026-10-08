import { sortedCopy } from "@/lib/arrayUtils";
import { readLikedSong, mergeLikedSongIdentities, youtubeIdentity, likedAtMillis } from "@/services/liked-songs/likedSongFormat";
import {
removeCachedPlaylist,
setCachedPlaylist,
} from "@/lib/playlistMemoryCache";
import {
addDoc,
collection,
deleteDoc,
doc,
getDoc,
getDocs,
getDocsFromServer,
limit,
orderBy,
query,
runTransaction,
serverTimestamp,
setDoc,
updateDoc,
where,
} from "firebase/firestore";
import { db } from "./firebase";

export interface FirestorePlaylist {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  songs: any[];
  createdBy: {
    id: string;
    _id?: string;
    uid?: string;
    name: string;
    fullName?: string;
    imageUrl?: string;
  };
  isPublic: boolean;
  songCount?: number;
  createdAt?: any;
  updatedAt?: any;
}

function normalizeForDedupe(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getSongDedupeKey(song: any): string {
  return `${normalizeForDedupe(song?.title || song?.name)}|${normalizeForDedupe(song?.artist || song?.artists)}`;
}

function getTimestampMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.getTime() : 0;
  }
  const seconds = typeof value.seconds === "number" ? value.seconds : value._seconds;
  return typeof seconds === "number" ? seconds * 1000 : 0;
}

function sortPlaylistsByNewest(playlists: FirestorePlaylist[]): FirestorePlaylist[] {
  return sortedCopy(playlists, (a, b) => {
    const aTime = getTimestampMillis(a.updatedAt) || getTimestampMillis(a.createdAt);
    const bTime = getTimestampMillis(b.updatedAt) || getTimestampMillis(b.createdAt);
    return bTime - aTime;
  });
}

// Get user playlists from Firestore
export async function getUserFirestorePlaylists(userId: string, maxCount: number = 50): Promise<FirestorePlaylist[]> {
  try {
    if (!db) {
      return [];
    }

    const safeLimit = Math.min(Math.max(Number(maxCount) || 50, 1), 100);
    const playlistsRef = collection(db, "playlists");
    const queries = [
      query(playlistsRef, where("createdBy.uid", "==", userId), orderBy("createdAt", "desc"), limit(safeLimit)),
      query(playlistsRef, where("createdBy.id", "==", userId), orderBy("createdAt", "desc"), limit(safeLimit)),
    ];
    const snapshots = await Promise.allSettled(queries.map((q) => getDocs(q)));
    const byId = new Map<string, FirestorePlaylist>();

    const addSnapshot = (result: PromiseSettledResult<Awaited<ReturnType<typeof getDocs>>>) => {
      if (result.status !== "fulfilled") return;
      result.value.forEach((doc) => {
        const data = doc.data() as Record<string, unknown>;
        byId.set(doc.id, { id: doc.id, ...data } as FirestorePlaylist);
      });
    };

    snapshots.forEach(addSnapshot);

    if (snapshots.some((result) => result.status === "rejected")) {
      const fallbackQueries = [
        query(playlistsRef, where("createdBy.uid", "==", userId), limit(safeLimit)),
        query(playlistsRef, where("createdBy.id", "==", userId), limit(safeLimit)),
      ];
      const fallbackSnapshots = await Promise.allSettled(fallbackQueries.map((q) => getDocs(q)));
      fallbackSnapshots.forEach(addSnapshot);
    }

    return sortPlaylistsByNewest(Array.from(byId.values())).slice(0, safeLimit);
  } catch {
    return [];
  }
}

// Create playlist in Firestore
export async function createFirestorePlaylist(
  userId: string,
  userName: string,
  name: string,
  description?: string
): Promise<FirestorePlaylist | null> {
  try {
    if (!db) {
      return null;
    }

    const playlistsRef = collection(db, "playlists");
    const docRef = await addDoc(playlistsRef, {
      name,
      description: description || "",
      songs: [],
      createdBy: {
        id: userId,
        _id: userId,
        uid: userId,
        name: userName,
        fullName: userName,
      },
      isPublic: false,
      songCount: 0,
      schemaVersion: 2,
      source: "mavrixfy_app",
      searchableName: normalizeForDedupe(name),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const createdPlaylist: FirestorePlaylist = {
      id: docRef.id,
      name,
      description,
      songs: [],
      createdBy: {
        id: userId,
        _id: userId,
        uid: userId,
        name: userName,
        fullName: userName,
      },
      isPublic: false,
      songCount: 0,
    };

    setCachedPlaylist(docRef.id, {
      id: docRef.id,
      name,
      description,
      songs: [],
      isFirestore: true,
      isPublic: false,
    });

    return createdPlaylist;
  } catch {
    return null;
  }
}

// Delete playlist from Firestore
export async function deleteFirestorePlaylist(playlistId: string): Promise<boolean> {
  try {
    if (!db) {
      return false;
    }

    const playlistRef = doc(db, "playlists", playlistId);
    await deleteDoc(playlistRef);
    removeCachedPlaylist(playlistId);
    return true;
  } catch {
    return false;
  }
}

// Get public playlists from Firestore
export async function getPublicPlaylists(maxCount: number = 100): Promise<FirestorePlaylist[]> {
  try {
    if (!db) {
      return [];
    }

    const playlistsRef = collection(db, "playlists");
    let querySnapshot;

    try {
      const q = query(
        playlistsRef,
        where("isPublic", "==", true),
        orderBy("updatedAt", "desc"),
        limit(maxCount)
      );
      querySnapshot = await getDocsFromServer(q);
    } catch (error) {
      if ((error as { code?: string })?.code !== "failed-precondition") throw error;
      const q = query(playlistsRef, where("isPublic", "==", true), limit(maxCount));
      querySnapshot = await getDocsFromServer(q);
    }

    const playlists: FirestorePlaylist[] = [];
    querySnapshot.forEach((doc) => {
      playlists.push({ id: doc.id, ...doc.data() } as FirestorePlaylist);
    });

    return sortPlaylistsByNewest(playlists).slice(0, maxCount);
  } catch {
    return [];
  }
}

// Get liked songs from Firestore (matches web implementation)
export async function getLikedSongsFromFirestore(userId: string): Promise<any[]> {
  try {
    if (!db) {
      return [];
    }

    const likedSongsRef = collection(db, "users", userId, "likedSongs");

    const snapshot = await getDocs(likedSongsRef);

    const likedSongs: any[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const songId = docSnap.id;

      if (!songId) {
        return;
      }

      likedSongs.push({ ...readLikedSong(songId, data),
        addedAt: data.likedAt || data.addedAt || data.syncedAt || data.createdAt,
        spotifyId: data.spotifyId, spotifyUrl: data.spotifyUrl, trackId: data.trackId, albumId: data.albumId,
      });
    });

    return mergeLikedSongIdentities(likedSongs.sort((a, b) => likedAtMillis({ likedAt: b.addedAt }) - likedAtMillis({ likedAt: a.addedAt })));
  } catch {
    return [];
  }
}

// Get playlist by ID
export async function getPlaylistById(playlistId: string): Promise<FirestorePlaylist | null> {
  try {
    if (!db) {
      return null;
    }

    const playlistRef = doc(db, "playlists", playlistId);
    const docSnap = await getDoc(playlistRef);

    if (!docSnap.exists()) {
      return null;
    }

    const playlist = { id: docSnap.id, ...docSnap.data() } as FirestorePlaylist;
    setCachedPlaylist(docSnap.id, {
      id: docSnap.id,
      name: playlist.name,
      description: playlist.description,
      imageUrl: playlist.imageUrl,
      coverUrl: playlist.imageUrl,
      songs: Array.isArray(playlist.songs) ? playlist.songs : [],
      isFirestore: true,
      isPublic: playlist.isPublic,
    });
    return playlist;
  } catch {
    return null;
  }
}

// Convert Firestore playlist to local songs format
export function firestorePlaylistToLocalSongs(playlist: FirestorePlaylist): any[] {
  if (!playlist || !playlist.songs) return [];

  return playlist.songs.map((song: any) => ({
    id: song.id || song.songId || "",
    title: song.title || song.name || "",
    artist: song.artist || song.artists || "",
    coverUrl: song.coverUrl || song.image || song.imageUrl || "",
    audioUrl: song.audioUrl || song.streamUrl || song.url || "",
    duration: song.duration || 0,
    album: song.album || "",
  }));
}

// Add liked song to Firestore (matches web app exactly)
export async function addLikedSongToFirestore(userId: string, song: any): Promise<boolean> {
  try {
    if (!db) {
      return false;
    }

    const title = String(song.title || song.name || "").trim();
    const artist = String(song.artist || song.artists || "").trim();
    const youtubeId = youtubeIdentity(song);
    const documentId = youtubeId ? `youtube_${youtubeId}` : String(song.id || song._id || song.songId || getSongDedupeKey({ title, artist })).replace(/\//g, "_");
    if (!documentId || !title || !artist) {
      return false;
    }

    const songDocRef = doc(db, "users", userId, "likedSongs", documentId);
    if (song.source === "youtube" && !youtubeId) return false;

    const docSnap = await getDoc(songDocRef);
    if (docSnap.exists()) {
      if (youtubeId) await updateDoc(songDocRef, { source: "youtube", videoId: youtubeId, youtubeVideoId: youtubeId, audioUrl: "", youtubeUrl: `https://music.youtube.com/watch?v=${youtubeId}` });
      return true; // The requested liked state already exists.
    }

    const normalizedTitle = normalizeForDedupe(title);
    const normalizedArtist = normalizeForDedupe(artist);

    await setDoc(songDocRef, {
      id: youtubeId ? documentId : song.id || song._id || documentId,
      title,
      titleLower: normalizedTitle,
      normalizedTitle,
      artist,
      artistLower: normalizedArtist,
      normalizedArtist,
      albumName: song.album || song.albumName || "",
      imageUrl: song.coverUrl || song.imageUrl || "",
      audioUrl: youtubeId ? "" : song.audioUrl || song.streamUrl || "",
      ...(youtubeId ? { youtubeUrl: `https://music.youtube.com/watch?v=${youtubeId}` } : {}),
      ...(!youtubeId && song.downloadUrl ? { downloadUrl: song.downloadUrl } : {}),
      duration: song.duration || 0,
      year: "",
      dedupeKey: `${normalizedTitle}|${normalizedArtist}`,
      createdAt: serverTimestamp(),
      likedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      source: youtubeId ? "youtube" : ["jiosaavn", "gaana", "local"].includes(song.source) ? song.source : "jiosaavn",
      ...(youtubeId ? { videoId: youtubeId, youtubeVideoId: youtubeId } : {}),
      client: "mavrixfy_app",
    });

    return true;
  } catch {
    return false;
  }
}

// Remove liked song from Firestore (matches web implementation)
export async function removeLikedSongFromFirestore(userId: string, songId: string): Promise<boolean> {
  try {
    if (!db) {
      return false;
    }

    const songDocRef = doc(db, "users", userId, "likedSongs", songId);

    const docSnap = await getDoc(songDocRef);
    if (!docSnap.exists()) {
      const likedSongsRef = collection(db, "users", userId, "likedSongs");
      const snapshot = await getDocs(likedSongsRef);

      let foundDocId = null;
      snapshot.forEach(doc => {
        const data = doc.data();
        if (doc.id === songId || data.id === songId) {
          foundDocId = doc.id;
        }
      });

      if (foundDocId && foundDocId !== songId) {
        const correctRef = doc(db, "users", userId, "likedSongs", foundDocId);
        await deleteDoc(correctRef);
        return true;
      } else {
        return true; // The requested unliked state already exists.
      }
    } else {
      await deleteDoc(songDocRef);
      return true;
    }
  } catch {
    return false;
  }
}

// Add song to Firestore playlist
export async function addSongToFirestorePlaylist(playlistId: string, song: any): Promise<boolean> {
  try {
    if (!db) return false;

    const playlistRef = doc(db, "playlists", playlistId);
    const songs = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(playlistRef);
      if (!snapshot.exists()) return null;
      const existing = (snapshot.data() as FirestorePlaylist).songs || [];
      if (existing.some((track) => track.id === song.id)) return null;
      const next = [...existing, {
        id: song.id, title: song.title, artist: song.artist,
        album: song.album || "", imageUrl: song.coverUrl || "",
        audioUrl: song.audioUrl || song.streamUrl || "",
        duration: song.duration || 0, addedAt: new Date().toISOString(),
      }];
      transaction.update(playlistRef, { songs: next, songCount: next.length, updatedAt: serverTimestamp() });
      return next;
    });
    if (!songs) return false;

    setCachedPlaylist(playlistId, {
      id: playlistId,
      songs,
    });

    return true;
  } catch {
    return false;
  }
}

// Update Firestore playlist
export async function updateFirestorePlaylist(
  playlistId: string,
  updates: Partial<{ name: string; description: string; isPublic: boolean; imageUrl: string }>
): Promise<boolean> {
  try {
    if (!db) {
      return false;
    }

    const playlistRef = doc(db, "playlists", playlistId);
    const playlistSnap = await getDoc(playlistRef);

    if (!playlistSnap.exists()) {
      return false;
    }

    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    await updateDoc(playlistRef, {
      ...cleanUpdates,
      ...(typeof updates.name === "string" ? { searchableName: normalizeForDedupe(updates.name) } : {}),
      updatedAt: serverTimestamp(),
    });

    setCachedPlaylist(playlistId, {
      id: playlistId,
      ...cleanUpdates,
      coverUrl: updates.imageUrl,
    });

    return true;
  } catch {
    return false;
  }
}

// Remove song from Firestore playlist
export async function removeSongFromFirestorePlaylist(playlistId: string, songId: string): Promise<boolean> {
  try {
    if (!db) {
      return false;
    }

    const playlistRef = doc(db, "playlists", playlistId);
    const updatedSongs = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(playlistRef);
      if (!snapshot.exists()) return null;
      const songs = (snapshot.data() as FirestorePlaylist).songs || [];
      const next = songs.filter((song) => song.id !== songId);
      transaction.update(playlistRef, { songs: next, songCount: next.length, updatedAt: serverTimestamp() });
      return next;
    });
    if (!updatedSongs) return false;

    setCachedPlaylist(playlistId, {
      id: playlistId,
      songs: updatedSongs,
    });

    return true;
  } catch {
    return false;
  }
}

export async function deleteUserFirestoreData(userId: string): Promise<void> {
  if (!db) {
    return;
  }

  const userSubcollections = [
    "likedSongs",
    "pushTokens",
    "spotifyTokens",
    "spotifySync",
    "spotifyLikedSongs",
    "offlineLicenses",
    "downloadDevices",
    "activityFeed",
  ];
  const playlistsRef = collection(db, "playlists");
  const playlistSharesRef = collection(db, "playlist_shares");
  const userRef = doc(db, "users", userId);
  const legacyLikedSongsRef = doc(db, "likedSongs", userId);

  const [
    subcollectionSnapshots,
    playlistsByIdSnapshot,
    playlistsByUidSnapshot,
    playlistsByLegacyIdSnapshot,
    playlistSharesSnapshot,
  ] = await Promise.all([
    Promise.all(userSubcollections.map((name) => getDocs(collection(db, "users", userId, name)))),
    getDocs(query(playlistsRef, where("createdBy.id", "==", userId))),
    getDocs(query(playlistsRef, where("createdBy.uid", "==", userId))),
    getDocs(query(playlistsRef, where("createdBy._id", "==", userId))),
    getDocs(query(playlistSharesRef, where("createdBy", "==", userId))),
  ]);

  const deletions: Promise<void>[] = [];

  subcollectionSnapshots.forEach((snapshot) => {
    snapshot.forEach((childDoc) => {
      deletions.push(deleteDoc(childDoc.ref));
    });
  });

  const playlistRefs = new Map<string, (typeof playlistsByIdSnapshot.docs)[number]["ref"]>();
  playlistsByIdSnapshot.forEach((playlistDoc) => {
    playlistRefs.set(playlistDoc.id, playlistDoc.ref);
  });
  playlistsByUidSnapshot.forEach((playlistDoc) => {
    playlistRefs.set(playlistDoc.id, playlistDoc.ref);
  });
  playlistsByLegacyIdSnapshot.forEach((playlistDoc) => {
    playlistRefs.set(playlistDoc.id, playlistDoc.ref);
  });
  playlistRefs.forEach((playlistRef) => {
    deletions.push(deleteDoc(playlistRef));
  });
  playlistSharesSnapshot.forEach((shareDoc) => {
    deletions.push(deleteDoc(shareDoc.ref));
  });

  deletions.push(deleteDoc(legacyLikedSongsRef));
  deletions.push(deleteDoc(userRef));

  await Promise.all(deletions);
}
