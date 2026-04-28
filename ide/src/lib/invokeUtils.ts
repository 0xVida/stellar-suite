import { FunctionInputSpec } from "./contractAbiParser";

/**
 * Serialize per-argument values into a JSON args string compatible with normalizeInvocationArgs
 */
export function buildArgsJson(inputs: FunctionInputSpec[], argValues: Record<string, string>): string {
  const values = inputs.map((input) => {
    const raw = argValues[input.name] ?? "";
    const coreType = input.type.endsWith(" | undefined")
      ? input.type.slice(0, -" | undefined".length)
      : input.type;

    if (coreType.endsWith("[]") || coreType.startsWith("Map<") || coreType.startsWith("[")) {
      if (!raw.trim()) return coreType.endsWith("[]") ? [] : {};
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }

    if (coreType === "bool") return raw === "true";

    if (["u32", "i32", "u64", "i64", "u128", "i128", "u256", "i256"].includes(coreType)) {
      if (["u32", "i32"].includes(coreType)) {
        const n = parseInt(raw, 10);
        return Number.isNaN(n) ? 0 : n;
      }
      // Larger ints might be handled as strings or bigints depending on the consumer
      // but buildArgsJson in ContractPanel treated them mostly as-is or JSON parsed
      return raw;
    }

    // i128/u128/i256/u256 and UDTs that are JSON objects
    if (raw.trim().startsWith("{")) {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }

    return raw;
  });

  return JSON.stringify(values);
}
