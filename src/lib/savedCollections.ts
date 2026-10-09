import AsyncStorage from "@react-native-async-storage/async-storage";
import { accountStorageKey } from "./accountScope";

const STORAGE_KEY = "@mavrixfy_saved_collections_v1";

export interface SavedCollection {
  id: string;
  kind: "playlist" | "artist-mix";
  title: string;
  image: string;
  description: string;
  subtitle: string;
  route: "playlist" | "artist-mix";
  params: Record<string, string>;
  savedAt: number;
}

const cache = new Map<string, SavedCollection[]>();
const mutations = new Map<string, Promise<unknown>>();

export async function getSavedCollections(): Promise<SavedCollection[]> {
  const key = accountStorageKey(STORAGE_KEY);
  const cached = cache.get(key);
  if (cached) return cached;
  const raw = await AsyncStorage.getItem(key);
  let value: SavedCollection[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) value = parsed.filter((item): item is SavedCollection => Boolean(item && typeof item.id === "string" && item.params && typeof item.params === "object"));
  } catch {
    value = [];
  }
  cache.set(key, value);
  return value;
}

export async function isCollectionSaved(id: string): Promise<boolean> {
  return (await getSavedCollections()).some((item) => item.id === id);
}

export async function toggleSavedCollection(collection: Omit<SavedCollection, "savedAt">): Promise<boolean> {
  const key = accountStorageKey(STORAGE_KEY);
  const previous = mutations.get(key);
  const operation = (async () => {
    if (previous) await previous;
    const items = await getSavedCollections();
    const exists = items.some((item) => item.id === collection.id);
    const next = exists
      ? items.filter((item) => item.id !== collection.id)
      : [{ ...collection, savedAt: Date.now() }, ...items];
    await AsyncStorage.setItem(key, JSON.stringify(next));
    cache.set(key, next);
    return !exists;
  })();
  mutations.set(key, operation);
  try {
    return await operation;
  } finally {
    if (mutations.get(key) === operation) mutations.delete(key);
  }
}
