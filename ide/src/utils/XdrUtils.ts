import { nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";

export interface XdrEncodeResult {
  xdrBase64: string;
  scvType: string;
}

export interface XdrDecodeResult {
  value: unknown;
  scvType: string;
}

export interface StructField {
  name: string;
  value: unknown;
}

function normalizeDecodedValue(val: unknown): unknown {
  if (typeof val === "bigint") {
    if (val <= BigInt(Number.MAX_SAFE_INTEGER) && val >= BigInt(Number.MIN_SAFE_INTEGER)) {
      return Number(val);
    }
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(normalizeDecodedValue);
  }
  if (val && typeof val === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = normalizeDecodedValue(v);
    }
    return res;
  }
  return val;
}

export function encodeToXdr(value: unknown): XdrEncodeResult {
  const options = typeof value === "number" && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
    ? { type: "i32" }
    : undefined;
  const scVal = nativeToScVal(value, options);
  return {
    xdrBase64: scVal.toXDR("base64"),
    scvType: scVal.switch().name,
  };
}

export function decodeFromXdr(xdrBase64: string): XdrDecodeResult {
  const scVal = xdr.ScVal.fromXDR(xdrBase64, "base64");
  return {
    value: normalizeDecodedValue(scValToNative(scVal)),
    scvType: scVal.switch().name,
  };
}

export function encodeMap(entries: Record<string, unknown>): string {
  const mapEntries = Object.entries(entries).map(
    ([k, v]) =>
      new xdr.ScMapEntry({
        key: nativeToScVal(k),
        val: nativeToScVal(v),
      }),
  );
  return xdr.ScVal.scvMap(mapEntries).toXDR("base64");
}

export function decodeMap(xdrBase64: string): Record<string, unknown> {
  const scVal = xdr.ScVal.fromXDR(xdrBase64, "base64");
  if (scVal.switch().name !== "scvMap") {
    throw new Error(`Expected scvMap, got ${scVal.switch().name}`);
  }
  const result: Record<string, unknown> = {};
  for (const entry of scVal.map()!) {
    const key = String(scValToNative(entry.key()));
    result[key] = normalizeDecodedValue(scValToNative(entry.val()));
  }
  return result;
}

export function encodeVec(items: unknown[]): string {
  const scVal = nativeToScVal(items);
  return scVal.toXDR("base64");
}

export function decodeVec(xdrBase64: string): unknown[] {
  const scVal = xdr.ScVal.fromXDR(xdrBase64, "base64");
  if (scVal.switch().name !== "scvVec") {
    throw new Error(`Expected scvVec, got ${scVal.switch().name}`);
  }
  return scVal.vec()!.map((v) => normalizeDecodedValue(scValToNative(v)));
}

export function encodeStruct(fields: StructField[]): string {
  const mapEntries = fields.map(
    ({ name, value }) =>
      new xdr.ScMapEntry({
        key: nativeToScVal(name, { type: "symbol" }),
        val: nativeToScVal(value),
      }),
  );
  return xdr.ScVal.scvMap(mapEntries).toXDR("base64");
}

export function decodeStruct(xdrBase64: string): StructField[] {
  const scVal = xdr.ScVal.fromXDR(xdrBase64, "base64");
  if (scVal.switch().name !== "scvMap") {
    throw new Error(`Expected scvMap (struct), got ${scVal.switch().name}`);
  }
  return scVal.map()!.map((entry) => ({
    name: String(scValToNative(entry.key())),
    value: normalizeDecodedValue(scValToNative(entry.val())),
  }));
}
