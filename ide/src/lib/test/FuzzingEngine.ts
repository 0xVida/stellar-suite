/**
 * src/lib/test/FuzzingEngine.ts
 * Soroban type fuzzer — Issue #668
 *
 * Generates randomised Soroban SC val inputs for property-based testing.
 * Supports all primitive Soroban types and nested composite types.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SorobanType =
  | "bool"
  | "u32"
  | "i32"
  | "u64"
  | "i64"
  | "u128"
  | "i128"
  | "bytes"
  | "string"
  | "address"
  | "symbol"
  | { vec: SorobanType }
  | { map: { key: SorobanType; value: SorobanType } }
  | { tuple: SorobanType[] }
  | { option: SorobanType };

export interface FuzzResult<T = unknown> {
  value: T;
  type: SorobanType;
  seed: number;
}

export interface FuzzConfig {
  /** Maximum length for bytes, string, vec, and map values (default: 16) */
  maxLength?: number;
  /** Fixed seed for deterministic output (default: random) */
  seed?: number;
  /** Maximum nesting depth for composite types (default: 3) */
  maxDepth?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeded PRNG (xorshift32 — simple, fast, deterministic)
// ─────────────────────────────────────────────────────────────────────────────

class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  /** [0, 1) */
  nextFloat(): number {
    return this.next() / 0x1_0000_0000;
  }

  /** [min, max] inclusive */
  nextInt(min: number, max: number): number {
    return min + (this.next() % (max - min + 1));
  }

  nextBool(): boolean {
    return (this.next() & 1) === 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STROOP_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

const STELLAR_ADDRESS_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function randomString(prng: Prng, maxLen: number): string {
  const len = prng.nextInt(0, maxLen);
  let s = "";
  for (let i = 0; i < len; i++) {
    s += STROOP_CHARS[prng.next() % STROOP_CHARS.length];
  }
  return s;
}

function randomBytes(prng: Prng, maxLen: number): Uint8Array {
  const len = prng.nextInt(0, maxLen);
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    buf[i] = prng.next() % 256;
  }
  return buf;
}

/** Generate a mock Stellar G… address (56 chars base32). */
function randomAddress(prng: Prng): string {
  let addr = "G";
  for (let i = 1; i < 56; i++) {
    addr += STELLAR_ADDRESS_CHARS[prng.next() % STELLAR_ADDRESS_CHARS.length];
  }
  return addr;
}

function bigintFromPrng(prng: Prng, signed: boolean, bits: 64 | 128): bigint {
  const lo = BigInt(prng.next());
  const hi = BigInt(prng.next());
  let value: bigint;
  if (bits === 64) {
    value = (hi << 32n) | lo;
    if (signed) {
      const max = 1n << 63n;
      if (value >= max) value -= 1n << 64n;
    } else {
      value = value & 0xffff_ffff_ffff_ffffn;
    }
  } else {
    const lo2 = BigInt(prng.next());
    const hi2 = BigInt(prng.next());
    const full = (hi2 << 96n) | (lo2 << 64n) | (hi << 32n) | lo;
    if (signed) {
      const max = 1n << 127n;
      if (full >= max) value = full - (1n << 128n);
      else value = full;
    } else {
      value = full & ((1n << 128n) - 1n);
    }
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core generator
// ─────────────────────────────────────────────────────────────────────────────

function generateValue(
  type: SorobanType,
  prng: Prng,
  maxLength: number,
  depth: number,
  maxDepth: number
): unknown {
  if (depth > maxDepth) {
    // Collapse complex types to a safe scalar when max depth reached
    return null;
  }

  if (type === "bool") return prng.nextBool();
  if (type === "u32") return prng.next() >>> 0;
  if (type === "i32") return prng.nextInt(-2147483648, 2147483647);
  if (type === "u64") return bigintFromPrng(prng, false, 64);
  if (type === "i64") return bigintFromPrng(prng, true, 64);
  if (type === "u128") return bigintFromPrng(prng, false, 128);
  if (type === "i128") return bigintFromPrng(prng, true, 128);
  if (type === "bytes") return randomBytes(prng, maxLength);
  if (type === "string") return randomString(prng, maxLength);
  if (type === "address") return randomAddress(prng);
  if (type === "symbol") {
    // Soroban symbols ≤ 32 chars, alphanumeric + _
    const len = prng.nextInt(1, Math.min(maxLength, 32));
    let sym = "";
    const symChars = "abcdefghijklmnopqrstuvwxyz_";
    for (let i = 0; i < len; i++) {
      sym += symChars[prng.next() % symChars.length];
    }
    return sym;
  }

  if (typeof type === "object") {
    if ("vec" in type) {
      const len = prng.nextInt(0, maxLength);
      return Array.from({ length: len }, () =>
        generateValue(type.vec, prng, maxLength, depth + 1, maxDepth)
      );
    }
    if ("map" in type) {
      const len = prng.nextInt(0, maxLength);
      const entries: Array<[unknown, unknown]> = [];
      for (let i = 0; i < len; i++) {
        const k = generateValue(type.map.key, prng, maxLength, depth + 1, maxDepth);
        const v = generateValue(type.map.value, prng, maxLength, depth + 1, maxDepth);
        entries.push([k, v]);
      }
      return entries;
    }
    if ("tuple" in type) {
      return type.tuple.map((t) =>
        generateValue(t, prng, maxLength, depth + 1, maxDepth)
      );
    }
    if ("option" in type) {
      if (prng.nextBool()) return null;
      return generateValue(type.option, prng, maxLength, depth + 1, maxDepth);
    }
  }

  throw new Error(`Unknown Soroban type: ${JSON.stringify(type)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export class FuzzingEngine {
  private readonly maxLength: number;
  private readonly maxDepth: number;

  constructor(config: FuzzConfig = {}) {
    this.maxLength = config.maxLength ?? 16;
    this.maxDepth = config.maxDepth ?? 3;
  }

  /**
   * Generate a single fuzzed value of the given Soroban type.
   */
  generate<T = unknown>(type: SorobanType, config: Pick<FuzzConfig, "seed"> = {}): FuzzResult<T> {
    const seed = config.seed ?? Math.floor(Math.random() * 0x7fff_ffff);
    const prng = new Prng(seed);
    const value = generateValue(type, prng, this.maxLength, 0, this.maxDepth) as T;
    return { value, type, seed };
  }

  /**
   * Generate `count` fuzzed values for the given type.
   * Each call uses an independent seed derived from the base seed.
   */
  generateMany<T = unknown>(
    type: SorobanType,
    count: number,
    config: Pick<FuzzConfig, "seed"> = {}
  ): FuzzResult<T>[] {
    const baseSeed = config.seed ?? Math.floor(Math.random() * 0x7fff_ffff);
    const prng = new Prng(baseSeed);
    return Array.from({ length: count }, () => {
      const seed = prng.next();
      return this.generate<T>(type, { seed });
    });
  }

  /**
   * Run a property-based test: generate `runs` values and call `predicate`
   * for each. Returns the first failing result, or null if all pass.
   */
  check<T = unknown>(
    type: SorobanType,
    predicate: (value: T) => boolean,
    runs = 100,
    config: Pick<FuzzConfig, "seed"> = {}
  ): FuzzResult<T> | null {
    const samples = this.generateMany<T>(type, runs, config);
    for (const result of samples) {
      if (!predicate(result.value)) {
        return result;
      }
    }
    return null;
  }
}
