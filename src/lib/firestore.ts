import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { sortedCopy } from "@/lib/arrayUtils";
import {
  setCachedPlaylist,
  removeCachedPlaylist,
} from "@/lib/playlistMemoryCache";

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
      querySnapshot = await getDocs(q);
    } catch {
      const q = query(playlistsRef, where("isPublic", "==", true), limit(maxCount));
      querySnapshot = await getDocs(q);
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

    let snapshot;
    try {
      const q = query(likedSongsRef, orderBy('likedAt', 'desc'));
      snapshot = await getDocs(q);
    } catch {
      snapshot = await getDocs(likedSongsRef);
    }

    const likedSongs: any[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const songId = docSnap.id;

      if (!songId) {
        return;
      }

      likedSongs.push({
        id: songId,
        title: data.title || data.name || "",
        artist: data.artist || data.artists || "",
        coverUrl: data.imageUrl || data.coverUrl || data.image || "",
        audioUrl: data.audioUrl || data.streamUrl || data.url || data.previewUrl || "",
        duration: data.duration || 0,
        album: data.album || data.albumName || "",
        addedAt: data.likedAt || data.addedAt || data.syncedAt,
        source: data.source,
        spotifyId: data.spotifyId,
        spotifyUrl: data.spotifyUrl,
        trackId: data.trackId,
        albumId: data.albumId,
      });
    });

    return likedSongs;
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
    const documentId = String(song.id || song._id || song.songId || getSongDedupeKey({ title, artist })).replace(/\//g, "_");
    if (!documentId || !title || !artist) {
      return false;
    }

    const songDocRef = doc(db, "users", userId, "likedSongs", documentId);

    const docSnap = await getDoc(songDocRef);
    if (docSnap.exists()) {
      return false; // Return false for duplicates
    }

    const normalizedTitle = normalizeForDedupe(title);
    const normalizedArtist = normalizeForDedupe(artist);

    await setDoc(songDocRef, {
      id: song.id || song._id || documentId,
      title,
      titleLower: normalizedTitle,
      normalizedTitle,
      artist,
      artistLower: normalizedArtist,
      normalizedArtist,
      albumName: song.album || song.albumName || "",
      imageUrl: song.coverUrl || song.imageUrl || "",
      audioUrl: song.audioUrl || song.streamUrl || "",
      duration: song.duration || 0,
      year: "",
      dedupeKey: `${normalizedTitle}|${normalizedArtist}`,
      createdAt: serverTimestamp(),
      likedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      source: "mavrixfy",
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
        return false;
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
    const playlistSnap = await getDoc(playlistRef);

    if (!playlistSnap.exists()) return false;

    const playlist = playlistSnap.data() as FirestorePlaylist;
    const songs = playlist.songs || [];

    // Check for duplicates - return false if already exists
    if (songs.some((s: any) => s.id === song.id)) return false;

    songs.push({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album || "",
      imageUrl: song.coverUrl,
      audioUrl: song.audioUrl || song.streamUrl || "",
      duration: song.duration || 0,
      addedAt: new Date().toISOString(),
    });

    await updateDoc(playlistRef, {
      songs,
      songCount: songs.length,
      updatedAt: serverTimestamp(),
    });

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
    const playlistSnap = await getDoc(playlistRef);

    if (!playlistSnap.exists()) {
      return false;
    }

    const playlist = playlistSnap.data() as FirestorePlaylist;
    const songs = playlist.songs || [];

    // Remove song from array
    const updatedSongs = songs.filter((s: any) => s.id !== songId);

    await updateDoc(playlistRef, {
      songs: updatedSongs,
      songCount: updatedSongs.length,
      updatedAt: serverTimestamp(),
    });

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

  const likedSongsRef = collection(db, "users", userId, "likedSongs");
  const pushTokensRef = collection(db, "users", userId, "pushTokens");
  const spotifyTokensRef = collection(db, "users", userId, "spotifyTokens");
  const spotifySyncRef = collection(db, "users", userId, "spotifySync");
  const spotifyLikedSongsRef = collection(db, "users", userId, "spotifyLikedSongs");
  const playlistsRef = collection(db, "playlists");
  const userRef = doc(db, "users", userId);
  const legacyLikedSongsRef = doc(db, "likedSongs", userId);

  const [
    likedSongsSnapshot,
    pushTokensSnapshot,
    spotifyTokensSnapshot,
    spotifySyncSnapshot,
    spotifyLikedSongsSnapshot,
    playlistsByIdSnapshot,
    playlistsByUidSnapshot,
  ] = await Promise.all([
    getDocs(likedSongsRef),
    getDocs(pushTokensRef),
    getDocs(spotifyTokensRef),
    getDocs(spotifySyncRef),
    getDocs(spotifyLikedSongsRef),
    getDocs(query(playlistsRef, where("createdBy.id", "==", userId))),
    getDocs(query(playlistsRef, where("createdBy.uid", "==", userId))),
  ]);

  const deletions: Promise<void>[] = [];

  likedSongsSnapshot.forEach((songDoc) => {
    deletions.push(deleteDoc(songDoc.ref));
  });

  pushTokensSnapshot.forEach((tokenDoc) => {
    deletions.push(deleteDoc(tokenDoc.ref));
  });

  spotifyTokensSnapshot.forEach((tokenDoc) => {
    deletions.push(deleteDoc(tokenDoc.ref));
  });

  spotifySyncSnapshot.forEach((syncDoc) => {
    deletions.push(deleteDoc(syncDoc.ref));
  });

  spotifyLikedSongsSnapshot.forEach((songDoc) => {
    deletions.push(deleteDoc(songDoc.ref));
  });

  const playlistRefs = new Map<string, (typeof playlistsByIdSnapshot.docs)[number]["ref"]>();
  playlistsByIdSnapshot.forEach((playlistDoc) => {
    playlistRefs.set(playlistDoc.id, playlistDoc.ref);
  });
  playlistsByUidSnapshot.forEach((playlistDoc) => {
    playlistRefs.set(playlistDoc.id, playlistDoc.ref);
  });
  playlistRefs.forEach((playlistRef) => {
    deletions.push(deleteDoc(playlistRef));
  });

  deletions.push(deleteDoc(legacyLikedSongsRef));
  deletions.push(deleteDoc(userRef));

  await Promise.all(deletions);
}
