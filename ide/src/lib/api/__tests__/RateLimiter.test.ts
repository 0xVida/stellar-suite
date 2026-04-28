import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, RateLimiter } from "../RateLimiter";

describe("RateLimiter (leaky bucket)", () => {
  let now = 0;
  const tick = (ms: number) => {
    now += ms;
  };

  beforeEach(() => {
    now = 1_000_000;
  });

  it("allows requests up to capacity in a single burst", async () => {
    const limiter = new RateLimiter({
      capacity: 5,
      leakRatePerSecond: 1,
      store: new InMemoryStore(),
      now: () => now,
    });

    for (let i = 0; i < 5; i++) {
      const decision = await limiter.consume("ip-1");
      expect(decision.allowed).toBe(true);
      expect(decision.remaining).toBe(5 - (i + 1));
    }
  });

  it("rejects the request that overflows capacity", async () => {
    const limiter = new RateLimiter({
      capacity: 3,
      leakRatePerSecond: 1,
      store: new InMemoryStore(),
      now: () => now,
    });

    for (let i = 0; i < 3; i++) {
      const ok = await limiter.consume("ip-2");
      expect(ok.allowed).toBe(true);
    }
    const denied = await limiter.consume("ip-2");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("leaks at the configured rate over time", async () => {
    const limiter = new RateLimiter({
      capacity: 2,
      leakRatePerSecond: 1,
      store: new InMemoryStore(),
      now: () => now,
    });

    expect((await limiter.consume("ip-3")).allowed).toBe(true);
    expect((await limiter.consume("ip-3")).allowed).toBe(true);
    expect((await limiter.consume("ip-3")).allowed).toBe(false);

    // Advance enough wall-clock time to drain one token (leakRate=1/sec).
    tick(1100);
    const decision = await limiter.consume("ip-3");
    expect(decision.allowed).toBe(true);
  });

  it("isolates buckets per key", async () => {
    const limiter = new RateLimiter({
      capacity: 1,
      leakRatePerSecond: 1,
      store: new InMemoryStore(),
      now: () => now,
    });

    expect((await limiter.consume("a")).allowed).toBe(true);
    expect((await limiter.consume("a")).allowed).toBe(false);
    expect((await limiter.consume("b")).allowed).toBe(true);
  });

  it("treats failures from the store as an empty bucket (fail-open)", async () => {
    const failingStore = {
      get: async () => {
        throw new Error("redis down");
      },
      set: async () => {
        throw new Error("redis down");
      },
    };
    const limiter = new RateLimiter({
      capacity: 1,
      leakRatePerSecond: 1,
      store: failingStore,
      now: () => now,
    });
    const decision = await limiter.consume("any");
    expect(decision.allowed).toBe(true);
  });

  it("rejects invalid configuration", () => {
    expect(
      () => new RateLimiter({ capacity: 0, leakRatePerSecond: 1 }),
    ).toThrow();
    expect(
      () => new RateLimiter({ capacity: 1, leakRatePerSecond: 0 }),
    ).toThrow();
  });
});
