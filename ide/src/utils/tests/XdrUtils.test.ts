import { describe, expect, it } from "vitest";

import {
  decodeFromXdr,
  decodeMap,
  decodeStruct,
  decodeVec,
  encodeMap,
  encodeStruct,
  encodeToXdr,
  encodeVec,
} from "@/utils/XdrUtils";

describe("XdrUtils", () => {
  describe("encodeToXdr / decodeFromXdr", () => {
    it("round-trips a string value", () => {
      const { xdrBase64, scvType } = encodeToXdr("hello");
      expect(scvType).toBe("scvString");
      const { value } = decodeFromXdr(xdrBase64);
      expect(value).toBe("hello");
    });

    it("round-trips an integer value", () => {
      const { xdrBase64, scvType } = encodeToXdr(42);
      expect(scvType).toBe("scvI32");
      const { value } = decodeFromXdr(xdrBase64);
      expect(value).toBe(42);
    });

    it("round-trips a boolean true", () => {
      const { xdrBase64, scvType } = encodeToXdr(true);
      expect(scvType).toBe("scvBool");
      const { value } = decodeFromXdr(xdrBase64);
      expect(value).toBe(true);
    });

    it("round-trips a boolean false", () => {
      const { xdrBase64, scvType } = encodeToXdr(false);
      expect(scvType).toBe("scvBool");
      const { value } = decodeFromXdr(xdrBase64);
      expect(value).toBe(false);
    });

    it("round-trips a bigint value", () => {
      const { xdrBase64 } = encodeToXdr(9007199254740993n);
      const { value } = decodeFromXdr(xdrBase64);
      expect(value).toBe(9007199254740993n);
    });

    it("returns the scvType from decodeFromXdr", () => {
      const { xdrBase64 } = encodeToXdr("type-check");
      const { scvType } = decodeFromXdr(xdrBase64);
      expect(scvType).toBe("scvString");
    });

    it("throws on invalid base64 input to decodeFromXdr", () => {
      expect(() => decodeFromXdr("not-valid-xdr!!!")).toThrow();
    });

    it("encodeToXdr output is valid base64", () => {
      const { xdrBase64 } = encodeToXdr("base64-check");
      expect(() => decodeFromXdr(xdrBase64)).not.toThrow();
    });
  });

  describe("encodeMap / decodeMap", () => {
    it("round-trips a simple string-keyed map", () => {
      const input = { foo: "bar", baz: "qux" };
      const xdrBase64 = encodeMap(input);
      const result = decodeMap(xdrBase64);
      expect(result.foo).toBe("bar");
      expect(result.baz).toBe("qux");
    });

    it("round-trips a map with numeric values", () => {
      const input = { count: 100, offset: 0 };
      const xdrBase64 = encodeMap(input);
      const result = decodeMap(xdrBase64);
      expect(result.count).toBe(100);
      expect(result.offset).toBe(0);
    });

    it("round-trips a map with boolean values", () => {
      const input = { active: true, deleted: false };
      const xdrBase64 = encodeMap(input);
      const result = decodeMap(xdrBase64);
      expect(result.active).toBe(true);
      expect(result.deleted).toBe(false);
    });

    it("round-trips a map with mixed value types", () => {
      const input = { name: "Alice", age: 30, verified: true };
      const xdrBase64 = encodeMap(input);
      const result = decodeMap(xdrBase64);
      expect(result.name).toBe("Alice");
      expect(result.age).toBe(30);
      expect(result.verified).toBe(true);
    });

    it("encodes an empty map without throwing", () => {
      const xdrBase64 = encodeMap({});
      const result = decodeMap(xdrBase64);
      expect(Object.keys(result)).toHaveLength(0);
    });

    it("throws when decoding non-map XDR as map", () => {
      const vecXdr = encodeVec(["a", "b"]);
      expect(() => decodeMap(vecXdr)).toThrow(/Expected scvMap/);
    });

    it("produces valid base64 XDR output", () => {
      const xdrBase64 = encodeMap({ key: "val" });
      expect(typeof xdrBase64).toBe("string");
      expect(xdrBase64.length).toBeGreaterThan(0);
    });
  });

  describe("encodeVec / decodeVec", () => {
    it("round-trips a string array", () => {
      const input = ["alpha", "beta", "gamma"];
      const xdrBase64 = encodeVec(input);
      const result = decodeVec(xdrBase64);
      expect(result).toEqual(["alpha", "beta", "gamma"]);
    });

    it("round-trips a numeric array", () => {
      const input = [1, 2, 3, 4, 5];
      const xdrBase64 = encodeVec(input);
      const result = decodeVec(xdrBase64);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it("round-trips a boolean array", () => {
      const input = [true, false, true];
      const xdrBase64 = encodeVec(input);
      const result = decodeVec(xdrBase64);
      expect(result).toEqual([true, false, true]);
    });

    it("round-trips a mixed-type array", () => {
      const input = ["hello", 42, true];
      const xdrBase64 = encodeVec(input);
      const result = decodeVec(xdrBase64);
      expect(result).toEqual(["hello", 42, true]);
    });

    it("round-trips an empty array", () => {
      const xdrBase64 = encodeVec([]);
      const result = decodeVec(xdrBase64);
      expect(result).toEqual([]);
    });

    it("round-trips a large array (100 elements)", () => {
      const input = Array.from({ length: 100 }, (_, i) => i);
      const xdrBase64 = encodeVec(input);
      const result = decodeVec(xdrBase64);
      expect(result).toHaveLength(100);
      expect(result[0]).toBe(0);
      expect(result[99]).toBe(99);
    });

    it("throws when decoding non-vec XDR as vec", () => {
      const mapXdr = encodeMap({ a: "b" });
      expect(() => decodeVec(mapXdr)).toThrow(/Expected scvVec/);
    });
  });

  describe("encodeStruct / decodeStruct", () => {
    it("round-trips a struct with symbol keys and string values", () => {
      const fields = [
        { name: "owner", value: "GABC" },
        { name: "balance", value: "1000" },
      ];
      const xdrBase64 = encodeStruct(fields);
      const result = decodeStruct(xdrBase64);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: "owner", value: "GABC" });
      expect(result[1]).toEqual({ name: "balance", value: "1000" });
    });

    it("round-trips a struct with numeric field values", () => {
      const fields = [
        { name: "x", value: 10 },
        { name: "y", value: 20 },
        { name: "z", value: 30 },
      ];
      const xdrBase64 = encodeStruct(fields);
      const result = decodeStruct(xdrBase64);
      expect(result[0]).toEqual({ name: "x", value: 10 });
      expect(result[1]).toEqual({ name: "y", value: 20 });
      expect(result[2]).toEqual({ name: "z", value: 30 });
    });

    it("round-trips a struct with boolean field values", () => {
      const fields = [
        { name: "is_active", value: true },
        { name: "is_admin", value: false },
      ];
      const xdrBase64 = encodeStruct(fields);
      const result = decodeStruct(xdrBase64);
      expect(result[0]).toEqual({ name: "is_active", value: true });
      expect(result[1]).toEqual({ name: "is_admin", value: false });
    });

    it("round-trips an empty struct", () => {
      const xdrBase64 = encodeStruct([]);
      const result = decodeStruct(xdrBase64);
      expect(result).toHaveLength(0);
    });

    it("preserves field order in struct", () => {
      const fields = [
        { name: "first", value: 1 },
        { name: "second", value: 2 },
        { name: "third", value: 3 },
      ];
      const xdrBase64 = encodeStruct(fields);
      const result = decodeStruct(xdrBase64);
      expect(result.map((f) => f.name)).toEqual(["first", "second", "third"]);
    });

    it("throws when decoding non-map XDR as struct", () => {
      const vecXdr = encodeVec(["a"]);
      expect(() => decodeStruct(vecXdr)).toThrow(/Expected scvMap/);
    });

    it("round-trips a Soroban-like Token struct", () => {
      const fields = [
        { name: "name", value: "MyToken" },
        { name: "symbol", value: "MTK" },
        { name: "decimals", value: 7 },
      ];
      const xdrBase64 = encodeStruct(fields);
      const result = decodeStruct(xdrBase64);
      expect(result).toEqual(fields);
    });
  });
});
