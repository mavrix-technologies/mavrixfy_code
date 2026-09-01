import { collection, getDocs, limit, orderBy, query, where, type Firestore } from "firebase/firestore";
import { type Song } from "@/lib/musicData";

const SONG_LIMIT = 30;

let _db: Firestore | null = null;
function getDb(): Firestore | null {
  if (_db) return _db;
  try {
    const { db } = require("@/lib/firebase");
    _db = db;
    return _db;
  } catch {
    return null;
  }
}

function mapSong(id: string, data: Record<string, any>): Song | null {
  const audioUrl = data.audioUrl || data.streamUrl || data.url;
  if (!data.title || !audioUrl) {
    return null;
  }

  let imageUrl = data.imageUrl || data.coverUrl || "";
  if (!imageUrl && Array.isArray(data.image)) {
    imageUrl = data.image[data.image.length - 1]?.url || data.image[data.image.length - 1]?.link || "";
  }

  return {
    id,
    title: String(data.title || data.name || ""),
    artist: String(data.artist || data.primaryArtists || "Unknown Artist"),
    album: typeof data.album === "object" ? String(data.album?.name || "") : String(data.album || ""),
    duration: Number(data.duration) || 0,
    coverUrl: imageUrl,
    genre: String(data.genre || data.language || ""),
    mood: data.mood || data.moods || undefined,
    audioUrl: String(audioUrl),
    year: data.year ? String(data.year) : "",
    language: String(data.language || ""),
    popularity: Number(data.popularity || 0) || undefined,
    source: "local",
  };
}

export async function getCatalogSongs(): Promise<Song[]> {
  const db = getDb();
  if (!db) return [];

  try {
    let snapshot;
    try {
      const songsQuery = query(
        collection(db, "songs"),
        orderBy("popularity", "desc"),
        limit(SONG_LIMIT)
      );
      snapshot = await getDocs(songsQuery);
    } catch {
      const fallbackQuery = query(collection(db, "songs"), limit(SONG_LIMIT));
      snapshot = await getDocs(fallbackQuery);
    }

    return snapshot.docs
      .map((doc) => mapSong(doc.id, doc.data()))
      .filter((song): song is Song => song !== null);
  } catch {
    return [];
  }
}

export async function searchCatalog(searchText: string): Promise<Song[]> {
  const db = getDb();
  if (!db) return [];

  const text = searchText.trim();
  if (text.length < 2) {
    return [];
  }

  try {
    const normalized = text.toLowerCase();
    const songsQuery = query(
      collection(db, "songs"),
      where("titleLower", ">=", normalized),
      where("titleLower", "<=", `${normalized}\uf8ff`),
      limit(20)
    );
    const snapshot = await getDocs(songsQuery);

    return snapshot.docs
      .map((doc) => mapSong(doc.id, doc.data()))
      .filter((song): song is Song => song !== null);
  } catch {
    return [];
  }
}
