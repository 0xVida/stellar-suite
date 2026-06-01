import type { ScValType } from "@/lib/scvalTransformer";

export type SorobanPrimitiveType = Extract<
  ScValType,
  | "void"
  | "u64"
  | "i64"
  | "u32"
  | "i32"
  | "u128"
  | "i128"
  | "bool"
  | "symbol"
  | "string"
  | "bytes"
  | "address"
>;

export type SorobanFuzzType = SorobanPrimitiveType | "map" | "vec";

export interface GeneratedValue {
  type: SorobanFuzzType;
  value: unknown;
  encoded: string;
}

export interface FuzzIteration {
  iterationIndex: number;
  functionName: string;
  contractId: string;
  args: GeneratedValue[];
  result: FuzzResult;
  durationMs: number;
}

export type FuzzResult =
  | { status: "ok"; returnValue?: unknown }
  | { status: "error"; message: string }
  | { status: "panic"; message: string; args: GeneratedValue[] };

export interface FuzzReport {
  contractId: string;
  functionName: string;
  argTypes: SorobanFuzzType[];
  totalIterations: number;
  panics: FuzzIteration[];
  errors: FuzzIteration[];
  durationMs: number;
}

export type SimulateFn = (
  contractId: string,
  functionName: string,
  args: GeneratedValue[],
) => Promise<{ success: boolean; error?: string; isPanic?: boolean }>;

const SYMBOL_CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";
const ADDRESS_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBigInt(bits: number, signed: boolean): bigint {
  const maxPositive = (1n << BigInt(bits - (signed ? 1 : 0))) - 1n;
  const magnitude = BigInt(Math.floor(Math.random() * Number(maxPositive < BigInt(Number.MAX_SAFE_INTEGER) ? maxPositive : BigInt(Number.MAX_SAFE_INTEGER))));

  if (signed && Math.random() < 0.5) {
    return -magnitude;
  }
  return magnitude;
}

function randomString(minLen: number, maxLen: number, charset: string): string {
  const len = randomInt(minLen, maxLen);
  return Array.from({ length: len }, () => charset[randomInt(0, charset.length - 1)]).join("");
}

function randomBytes(minLen: number, maxLen: number): Uint8Array {
  const len = randomInt(minLen, maxLen);
  return Uint8Array.from({ length: len }, () => randomInt(0, 255));
}

function randomStellarAddress(): string {
  const prefix = Math.random() < 0.5 ? "G" : "C";
  const body = randomString(54, 54, ADDRESS_CHARS);
  return prefix + body;
}

export class SorobanValueGenerator {
  generate(type: SorobanFuzzType, depth = 0): GeneratedValue {
    switch (type) {
      case "void":
        return { type, value: null, encoded: "(void)" };

      case "bool":
        return { type, value: Math.random() < 0.5, encoded: String(Math.random() < 0.5) };

      case "u32": {
        const edgeCases = [0, 1, 0x7fff, 0xffff, 0xffff_fffe, 0xffff_ffff];
        const value = Math.random() < 0.15 ? edgeCases[randomInt(0, edgeCases.length - 1)] : randomInt(0, 0xffff_ffff);
        return { type, value, encoded: String(value) };
      }

      case "i32": {
        const edgeCases = [0, 1, -1, 0x7fff_ffff, -0x8000_0000];
        const value = Math.random() < 0.15 ? edgeCases[randomInt(0, edgeCases.length - 1)] : randomInt(-0x8000_0000, 0x7fff_ffff);
        return { type, value, encoded: String(value) };
      }

      case "u64": {
        const edgeCases = [0n, 1n, BigInt(Number.MAX_SAFE_INTEGER), 0xffff_ffff_ffff_ffffn];
        const value = Math.random() < 0.15 ? edgeCases[randomInt(0, edgeCases.length - 1)] : randomBigInt(64, false);
        return { type, value, encoded: String(value) };
      }

      case "i64": {
        const edgeCases = [0n, 1n, -1n, BigInt(Number.MAX_SAFE_INTEGER), BigInt(Number.MIN_SAFE_INTEGER)];
        const value = Math.random() < 0.15 ? edgeCases[randomInt(0, edgeCases.length - 1)] : randomBigInt(64, true);
        return { type, value, encoded: String(value) };
      }

      case "u128": {
        const edgeCases = [0n, 1n, (1n << 127n) - 1n, (1n << 128n) - 1n];
        const value = Math.random() < 0.1 ? edgeCases[randomInt(0, edgeCases.length - 1)] : randomBigInt(128, false);
        return { type, value, encoded: String(value) };
      }

      case "i128": {
        const edgeCases = [0n, 1n, -1n, (1n << 127n) - 1n, -(1n << 127n)];
        const value = Math.random() < 0.1 ? edgeCases[randomInt(0, edgeCases.length - 1)] : randomBigInt(128, true);
        return { type, value, encoded: String(value) };
      }

      case "symbol": {
        const edgeCases = ["", "_", "a".repeat(32)];
        const value = Math.random() < 0.1 ? edgeCases[randomInt(0, edgeCases.length - 1)] : randomString(1, 32, SYMBOL_CHARSET);
        return { type, value, encoded: value };
      }

      case "string": {
        const edgeCases = ["", " ", "\n", "\t", "a".repeat(256), "<script>", "'; DROP TABLE--"];
        const value = Math.random() < 0.1 ? edgeCases[randomInt(0, edgeCases.length - 1)] : randomString(0, 128, SYMBOL_CHARSET + " !@#$%^&*()");
        return { type, value, encoded: value };
      }

      case "bytes": {
        const edgeCases = [new Uint8Array(0), new Uint8Array(1), new Uint8Array(255).fill(0xff)];
        const value = Math.random() < 0.1 ? edgeCases[randomInt(0, edgeCases.length - 1)] : randomBytes(0, 256);
        return { type, value, encoded: Buffer.from(value).toString("hex") };
      }

      case "address": {
        const value = randomStellarAddress();
        return { type, value, encoded: value };
      }

      case "map": {
        if (depth >= 2) {
          return this.generate("string", depth);
        }
        const entryCount = randomInt(0, 8);
        const primitives: SorobanPrimitiveType[] = ["u32", "string", "symbol", "bool"];
        const entries = Array.from({ length: entryCount }, () => ({
          key: this.generate(primitives[randomInt(0, primitives.length - 1)], depth + 1),
          val: this.generate(primitives[randomInt(0, primitives.length - 1)], depth + 1),
        }));
        const value = Object.fromEntries(entries.map((e, i) => [e.key.encoded || `k${i}`, e.val.value]));
        return { type, value, encoded: JSON.stringify(value) };
      }

      case "vec": {
        if (depth >= 2) {
          return this.generate("u32", depth);
        }
        const elementCount = randomInt(0, 16);
        const elemType: SorobanPrimitiveType = ["u32", "i32", "string", "bool"][randomInt(0, 3)] as SorobanPrimitiveType;
        const elements = Array.from({ length: elementCount }, () => this.generate(elemType, depth + 1));
        return {
          type,
          value: elements.map((e) => e.value),
          encoded: JSON.stringify(elements.map((e) => e.encoded)),
        };
      }

      default:
        return { type: "void", value: null, encoded: "(void)" };
    }
  }

  generateArgList(types: SorobanFuzzType[]): GeneratedValue[] {
    return types.map((t) => this.generate(t));
  }
}

const PANIC_PATTERNS = [
  /panic/i,
  /attempt to.*overflow/i,
  /index out of bounds/i,
  /unwrap.*None/i,
  /called.*on.*Err/i,
  /divide by zero/i,
  /stack overflow/i,
];

function isPanicMessage(message: string): boolean {
  return PANIC_PATTERNS.some((re) => re.test(message));
}

export class FuzzingEngine {
  private generator = new SorobanValueGenerator();
  private simulate: SimulateFn;

  constructor(simulate: SimulateFn) {
    this.simulate = simulate;
  }

  async run(
    contractId: string,
    functionName: string,
    argTypes: SorobanFuzzType[],
    iterations = 100,
    onProgress?: (iteration: number, total: number) => void,
  ): Promise<FuzzReport> {
    const startMs = Date.now();
    const panics: FuzzIteration[] = [];
    const errors: FuzzIteration[] = [];

    for (let i = 0; i < iterations; i++) {
      const args = this.generator.generateArgList(argTypes);
      const iterStart = Date.now();

      let result: FuzzResult;
      try {
        const simResult = await this.simulate(contractId, functionName, args);
        if (!simResult.success && simResult.error) {
          if (simResult.isPanic || isPanicMessage(simResult.error)) {
            result = { status: "panic", message: simResult.error, args };
          } else {
            result = { status: "error", message: simResult.error };
          }
        } else {
          result = { status: "ok", returnValue: simResult };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = isPanicMessage(message)
          ? { status: "panic", message, args }
          : { status: "error", message };
      }

      const iteration: FuzzIteration = {
        iterationIndex: i,
        functionName,
        contractId,
        args,
        result,
        durationMs: Date.now() - iterStart,
      };

      if (result.status === "panic") panics.push(iteration);
      if (result.status === "error") errors.push(iteration);

      onProgress?.(i + 1, iterations);
    }

    return {
      contractId,
      functionName,
      argTypes,
      totalIterations: iterations,
      panics,
      errors,
      durationMs: Date.now() - startMs,
    };
  }

  formatReport(report: FuzzReport): string {
    const lines: string[] = [
      `Fuzz Report — ${report.contractId}::${report.functionName}`,
      `Arg types : [${report.argTypes.join(", ")}]`,
      `Iterations: ${report.totalIterations} in ${report.durationMs}ms`,
      `Panics    : ${report.panics.length}`,
      `Errors    : ${report.errors.length}`,
    ];

    if (report.panics.length > 0) {
      lines.push("", "--- PANICS ---");
      for (const iter of report.panics) {
        lines.push(
          `  [iter ${iter.iterationIndex}] ${(iter.result as Extract<FuzzResult, { status: "panic" }>).message}`,
          `    args: ${iter.args.map((a) => `${a.type}(${a.encoded})`).join(", ")}`,
        );
      }
    }

    if (report.errors.length > 0) {
      lines.push("", `--- ERRORS (first 5 of ${report.errors.length}) ---`);
      for (const iter of report.errors.slice(0, 5)) {
        lines.push(
          `  [iter ${iter.iterationIndex}] ${(iter.result as Extract<FuzzResult, { status: "error" }>).message}`,
        );
      }
    }

    return lines.join("\n");
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
