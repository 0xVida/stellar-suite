/**
 * Leaky-bucket rate limiter for internal /api proxies.
 *
 * Two storage backends are supported behind a common interface:
 *  - InMemoryStore: per-process Map. Used in local development and as a
 *    fallback when no Redis is configured.
 *  - RedisStore: Upstash REST-compatible HTTP client. Used in production
 *    so multiple Next.js instances share a single bucket per key.
 *
 * The leaky-bucket algorithm:
 *  - A bucket holds up to `capacity` tokens of work.
 *  - Tokens leak out at `leakRatePerSecond`.
 *  - Each request adds `cost` (default 1). If the resulting level would
 *    exceed capacity, the request is rejected.
 *
 * This shape gives a stable sustained throughput (the leak rate) while
 * still tolerating short bursts up to `capacity`.
 */

export interface BucketState {
  level: number;
  updatedAt: number;
}

export interface RateLimitStore {
  get(key: string): Promise<BucketState | null>;
  set(key: string, state: BucketState, ttlMs: number): Promise<void>;
}

export interface RateLimiterOptions {
  capacity: number;
  leakRatePerSecond: number;
  store?: RateLimitStore;
  keyPrefix?: string;
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  level: number;
  capacity: number;
}

const MIN_TTL_MS = 1000;

export class InMemoryStore implements RateLimitStore {
  private readonly buckets = new Map<string, { state: BucketState; expiresAt: number }>();

  async get(key: string): Promise<BucketState | null> {
    const entry = this.buckets.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.buckets.delete(key);
      return null;
    }
    return entry.state;
  }

  async set(key: string, state: BucketState, ttlMs: number): Promise<void> {
    this.buckets.set(key, {
      state,
      expiresAt: Date.now() + Math.max(MIN_TTL_MS, ttlMs),
    });
  }

  clear(): void {
    this.buckets.clear();
  }

  size(): number {
    return this.buckets.size;
  }
}

export interface RedisStoreConfig {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
}

/**
 * Upstash REST-compatible store. Works from Edge runtime (uses fetch only).
 * Stores BucketState as a JSON string with PX (millisecond) TTL.
 */
export class RedisStore implements RateLimitStore {
  private readonly url: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ url, token, fetchImpl }: RedisStoreConfig) {
    this.url = url.replace(/\/+$/, "");
    this.token = token;
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async get(key: string): Promise<BucketState | null> {
    const res = await this.fetchImpl(`${this.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`RedisStore.get failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { result: string | null };
    if (!body.result) return null;
    try {
      const parsed = JSON.parse(body.result) as BucketState;
      if (typeof parsed.level !== "number" || typeof parsed.updatedAt !== "number") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async set(key: string, state: BucketState, ttlMs: number): Promise<void> {
    const ttl = Math.max(MIN_TTL_MS, Math.ceil(ttlMs));
    const payload = JSON.stringify(state);
    const res = await this.fetchImpl(`${this.url}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([payload, "PX", String(ttl)]),
    });
    if (!res.ok) {
      throw new Error(`RedisStore.set failed: HTTP ${res.status}`);
    }
  }
}

export class RateLimiter {
  private readonly capacity: number;
  private readonly leakRatePerMs: number;
  private readonly store: RateLimitStore;
  private readonly keyPrefix: string;
  private readonly now: () => number;
  private readonly fullDrainMs: number;

  constructor(options: RateLimiterOptions) {
    if (options.capacity <= 0) {
      throw new Error("RateLimiter capacity must be > 0");
    }
    if (options.leakRatePerSecond <= 0) {
      throw new Error("RateLimiter leakRatePerSecond must be > 0");
    }
    this.capacity = options.capacity;
    this.leakRatePerMs = options.leakRatePerSecond / 1000;
    this.store = options.store ?? new InMemoryStore();
    this.keyPrefix = options.keyPrefix ?? "rl";
    this.now = options.now ?? Date.now;
    this.fullDrainMs = Math.ceil(this.capacity / this.leakRatePerMs);
  }

  async consume(rawKey: string, cost = 1): Promise<RateLimitDecision> {
    const key = `${this.keyPrefix}:${rawKey}`;
    const now = this.now();
    const previous = await this.safeGet(key);

    const drained = previous
      ? Math.max(0, previous.level - (now - previous.updatedAt) * this.leakRatePerMs)
      : 0;
    const projected = drained + cost;

    if (projected > this.capacity) {
      const overflow = projected - this.capacity;
      const retryAfterSeconds = Math.max(1, Math.ceil(overflow / this.leakRatePerMs / 1000));
      return {
        allowed: false,
        remaining: Math.max(0, Math.floor(this.capacity - drained)),
        retryAfterSeconds,
        level: drained,
        capacity: this.capacity,
      };
    }

    const nextState: BucketState = { level: projected, updatedAt: now };
    await this.safeSet(key, nextState, this.fullDrainMs);

    return {
      allowed: true,
      remaining: Math.max(0, Math.floor(this.capacity - projected)),
      retryAfterSeconds: 0,
      level: projected,
      capacity: this.capacity,
    };
  }

  private async safeGet(key: string): Promise<BucketState | null> {
    try {
      return await this.store.get(key);
    } catch (err) {
      console.warn("[RateLimiter] store.get failed, treating bucket as empty", err);
      return null;
    }
  }

  private async safeSet(key: string, state: BucketState, ttlMs: number): Promise<void> {
    try {
      await this.store.set(key, state, ttlMs);
    } catch (err) {
      console.warn("[RateLimiter] store.set failed, decision not persisted", err);
    }
  }
}

/**
 * Build the appropriate store based on environment.
 * Production: Upstash-style Redis when both URL + TOKEN env vars are set.
 * Otherwise: in-memory (safe local-dev fallback).
 */
export function createDefaultStore(): RateLimitStore {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.RATE_LIMIT_REDIS_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.RATE_LIMIT_REDIS_TOKEN;

  if (url && token) {
    return new RedisStore({ url, token });
  }
  return new InMemoryStore();
}

let sharedLimiter: RateLimiter | null = null;

/**
 * Process-wide singleton so the in-memory bucket survives across requests.
 * (Per-instance only; multi-instance deployments need Redis.)
 */
export function getSharedRateLimiter(): RateLimiter {
  if (!sharedLimiter) {
    sharedLimiter = new RateLimiter({
      capacity: parseIntEnv("RATE_LIMIT_CAPACITY", 30),
      leakRatePerSecond: parseFloatEnv("RATE_LIMIT_LEAK_PER_SECOND", 5),
      store: createDefaultStore(),
      keyPrefix: "ide-api",
    });
  }
  return sharedLimiter;
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Derive a stable rate-limit key from the request. Path is included so each
 * sensitive route gets its own bucket per IP — preventing one noisy endpoint
 * from starving another.
 */
export function deriveRateLimitKey(
  request: Request,
  pathname: string,
): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0]!.trim()
    : request.headers.get("x-real-ip") ??
      // @ts-expect-error - NextRequest exposes .ip in Edge runtime; not on standard Request
      (request as { ip?: string }).ip ??
      "unknown";
  return `${pathname}:${ip}`;
}
