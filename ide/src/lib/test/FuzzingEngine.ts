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
  }
}
