/**
 * High-Speed In-Memory Client Cache for Instant UI Rendering (SWR Pattern)
 * Keeps visited data in memory so tab navigation renders in 0ms without network lag.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

export function getCached<T>(key: string, ttlMs: number = 60000): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  // Return cached data immediately (even if stale) to render in 0ms while revalidating
  return entry.data as T;
}

export function isCacheFresh(key: string, ttlMs: number = 30000): boolean {
  const entry = memoryCache.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp < ttlMs;
}

export function setCached<T>(key: string, data: T): void {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  memoryCache.forEach((_, key) => {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  });
}
