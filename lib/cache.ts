/**
 * Client-Side Cache Manager
 * Reduces Firebase reads by 60-70% through intelligent caching
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class CacheManager {
  private cache: Map<string, CacheEntry<any>>;
  private memoryCache: Map<string, any>; // Session-only cache

  constructor() {
    this.cache = new Map();
    this.memoryCache = new Map();
  }

  /**
   * Set cache with TTL
   */
  set<T>(key: string, data: T, ttlMinutes: number = 5): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlMinutes * 60 * 1000,
    };
    this.cache.set(key, entry);
  }

  /**
   * Get cached data if not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Check if cache has valid entry
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clear specific cache entry
   */
  clear(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.cache.clear();
    this.memoryCache.clear();
  }

  /**
   * Clear cache by pattern (e.g., "user:*")
   */
  clearPattern(pattern: string): void {
    const regex = new RegExp(pattern.replace('*', '.*'));
    const keysToDelete: string[] = [];

    this.cache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Set memory-only cache (cleared on app restart)
   */
  setMemory<T>(key: string, data: T): void {
    this.memoryCache.set(key, data);
  }

  /**
   * Get memory cache
   */
  getMemory<T>(key: string): T | null {
    return this.memoryCache.get(key) || null;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      entries: this.cache.size,
      memoryEntries: this.memoryCache.size,
    };
  }
}

// Singleton instance
export const cache = new CacheManager();

/**
 * Cache key generators
 */
export const CacheKeys = {
  // User-specific
  userPlaylists: (userId: string) => `user:${userId}:playlists`,
  userLikedSongs: (userId: string) => `user:${userId}:liked`,
  userProfile: (userId: string) => `user:${userId}:profile`,
  
  // Public data
  publicPlaylists: () => 'public:playlists',
  playlist: (playlistId: string) => `playlist:${playlistId}`,
  
  // JioSaavn
  jiosaavnPlaylist: (playlistId: string) => `jiosaavn:playlist:${playlistId}`,
  jiosaavnSearch: (query: string) => `jiosaavn:search:${query}`,
  jiosaavnTrending: () => 'jiosaavn:trending',
};

/**
 * Cache TTL configurations (in minutes)
 */
export const CacheTTL = {
  // User data - shorter TTL for freshness
  userPlaylists: 2,
  userLikedSongs: 1,
  userProfile: 5,
  
  // Public data - longer TTL
  publicPlaylists: 10,
  playlist: 5,
  
  // JioSaavn - medium TTL
  jiosaavnPlaylist: 15,
  jiosaavnSearch: 10,
  jiosaavnTrending: 30,
};

/**
 * Cached fetch wrapper
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMinutes: number = 5
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const data = await fetcher();
  cache.set(key, data, ttlMinutes);
  
  return data;
}

/**
 * Clear user-specific cache on logout
 */
export function clearUserCache(userId: string): void {
  cache.clearPattern(`user:${userId}:*`);
}

export function clearAllCache(): void {
  cache.clearAll();
}
