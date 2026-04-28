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

export function encodeToXdr(value: unknown): XdrEncodeResult {
  const scVal = nativeToScVal(value);
  return {
    xdrBase64: scVal.toXDR("base64"),
    scvType: scVal.switch().name,
  };
}

export function decodeFromXdr(xdrBase64: string): XdrDecodeResult {
  const scVal = xdr.ScVal.fromXDR(xdrBase64, "base64");
  return {
    value: scValToNative(scVal),
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
    result[key] = scValToNative(entry.val());
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
  return scVal.vec()!.map((v) => scValToNative(v));
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
    value: scValToNative(entry.val()),
  }));
}
