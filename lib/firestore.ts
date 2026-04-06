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

export interface FirestorePlaylist {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  songs: any[];
  createdBy: {
    id: string;
    name: string;
  };
  isPublic: boolean;
  createdAt?: any;
  updatedAt?: any;
}

// Get user playlists from Firestore
export async function getUserFirestorePlaylists(userId: string): Promise<FirestorePlaylist[]> {
  try {
    if (!db) {
      return [];
    }

    const playlistsRef = collection(db, "playlists");
    const q = query(playlistsRef, where("createdBy.id", "==", userId));
    const querySnapshot = await getDocs(q);

    const playlists: FirestorePlaylist[] = [];
    querySnapshot.forEach((doc) => {
      playlists.push({ id: doc.id, ...doc.data() } as FirestorePlaylist);
    });

    return playlists;
  } catch (error) {
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
        name: userName,
      },
      isPublic: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      id: docRef.id,
      name,
      description,
      songs: [],
      createdBy: {
        id: userId,
        name: userName,
      },
      isPublic: false,
    };
  } catch (error) {
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
    return true;
  } catch (error) {
    return false;
  }
}

// Get public playlists from Firestore
export async function getPublicPlaylists(maxCount: number = 50): Promise<FirestorePlaylist[]> {
  try {
    if (!db) {
      return [];
    }

    const playlistsRef = collection(db, "playlists");
    const q = query(playlistsRef, where("isPublic", "==", true), limit(maxCount));
    const querySnapshot = await getDocs(q);

    const playlists: FirestorePlaylist[] = [];
    querySnapshot.forEach((doc) => {
      playlists.push({ id: doc.id, ...doc.data() } as FirestorePlaylist);
    });

    return playlists;
  } catch (error) {
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
    } catch (orderError) {
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
        audioUrl: data.audioUrl || data.url || data.previewUrl || "",
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
  } catch (error) {
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

    return { id: docSnap.id, ...docSnap.data() } as FirestorePlaylist;
  } catch (error) {
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
    audioUrl: song.audioUrl || song.url || "",
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

    const documentId = song.id;
    const songDocRef = doc(db, "users", userId, "likedSongs", documentId);

    const docSnap = await getDoc(songDocRef);
    if (docSnap.exists()) {
      return true;
    }

    await setDoc(songDocRef, {
      id: song.id,
      title: song.title,
      artist: song.artist,
      albumName: song.album || "",
      imageUrl: song.coverUrl,
      audioUrl: song.audioUrl,
      duration: song.duration || 0,
      year: "",
      likedAt: serverTimestamp(),
      source: "mavrixfy",
    });

    return true;
  } catch (error) {
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
  } catch (error) {
    return false;
  }
}

// Add song to Firestore playlist
export async function addSongToFirestorePlaylist(playlistId: string, song: any): Promise<boolean> {
  try {
    if (!db) {
      console.error('[Firestore] Database not initialized');
      return false;
    }

    const playlistRef = doc(db, "playlists", playlistId);
    const playlistSnap = await getDoc(playlistRef);

    if (!playlistSnap.exists()) {
      console.error('[Firestore] Playlist not found:', playlistId);
      return false;
    }

    const playlist = playlistSnap.data() as FirestorePlaylist;
    const songs = playlist.songs || [];

    // Check if song already exists
    const songExists = songs.some((s: any) => s.id === song.id);
    if (songExists) {
      console.log('[Firestore] Song already exists in playlist:', song.id);
      return true;
    }

    // Add song to playlist
    // Note: serverTimestamp() is not supported inside arrays, so we use ISO string
    const newSong = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album || "",
      imageUrl: song.coverUrl,
      audioUrl: song.audioUrl,
      duration: song.duration || 0,
      addedAt: new Date().toISOString(),
    };

    songs.push(newSong);

    // Use updateDoc to only update specific fields
    await updateDoc(playlistRef, {
      songs: songs,
      updatedAt: serverTimestamp(),
    });

    console.log('[Firestore] Song added successfully:', song.title, 'to playlist:', playlistId);
    return true;
  } catch (error) {
    console.error('[Firestore] Error adding song to playlist:', error);
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

    await setDoc(playlistRef, {
      ...playlistSnap.data(),
      ...updates,
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
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

    await setDoc(playlistRef, {
      ...playlist,
      songs: updatedSongs,
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
    return false;
  }
}
