// src/services/simulationCacheCore.ts
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  errors: number;
}

export interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  lastAccessedAt: number;
}

export interface SimulationCacheOptions {
  enabled: boolean;
  ttlMs: number;
  maxEntries: number;
}

export class SimulationCacheCore<T> {
  private readonly map = new Map<string, CacheEntry<T>>();
  private readonly stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
    errors: 0,
  };

  private options: SimulationCacheOptions;

  constructor(options: SimulationCacheOptions) {
    this.options = options;
  }

  public updateOptions(options: Partial<SimulationCacheOptions>) {
    this.options = { ...this.options, ...options };
    // Enforce max size after any update
    this.evictIfNeeded();
  }

  public getOptions(): SimulationCacheOptions {
    return { ...this.options };
  }

  public getStats(): CacheStats {
    return { ...this.stats };
  }

  public size(): number {
    return this.map.size;
  }

  public clear(): void {
    this.map.clear();
  }

  public invalidateWhere(predicate: (key: string) => boolean): number {
    let removed = 0;
    for (const k of this.map.keys()) {
      if (predicate(k)) {
        this.map.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  public get(key: string, now = Date.now()): T | undefined {
    if (!this.options.enabled) {
      this.stats.misses += 1;
      return undefined;
    }

    try {
      const entry = this.map.get(key);
      if (!entry) {
        this.stats.misses += 1;
        return undefined;
      }

      if (entry.expiresAt <= now) {
        this.map.delete(key);
        this.stats.misses += 1;
        return undefined;
      }

      entry.lastAccessedAt = now;
      // Refresh insertion order (LRU-ish)
      this.map.delete(key);
      this.map.set(key, entry);

      this.stats.hits += 1;
      return entry.value;
    } catch {
      this.stats.errors += 1;
      this.stats.misses += 1;
      return undefined;
    }
  }

  public set(key: string, value: T, now = Date.now()): void {
    if (!this.options.enabled) {
      return;
    }

    try {
      const ttl = Math.max(0, this.options.ttlMs);
      const entry: CacheEntry<T> = {
        key,
        value,
        createdAt: now,
        expiresAt: now + ttl,
        lastAccessedAt: now,
      };

      this.map.set(key, entry);
      this.stats.sets += 1;
      this.evictIfNeeded();
    } catch {
      this.stats.errors += 1;
    }
  }

  private evictIfNeeded(): void {
    const max = Math.max(0, this.options.maxEntries);
    if (max === 0) {
      // treat as "no caching"
      this.map.clear();
      return;
    }

    while (this.map.size > max) {
      // Oldest is first in insertion order
      const oldestKey = this.map.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.map.delete(oldestKey);
      this.stats.evictions += 1;
    }
  }
}