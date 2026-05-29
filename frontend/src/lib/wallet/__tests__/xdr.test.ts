import { describe, expect, it } from "vitest";
import {
  isStellarChain,
  isStellarPublicKey,
  isValidBase64Xdr,
  normalizeXdr,
  parseAccount,
} from "@/lib/wallet/xdr";

describe("xdr validators", () => {
  describe("normalizeXdr", () => {
    it("strips all whitespace", () => {
      expect(normalizeXdr("AAAA BBBB\nCCCC\tDDDD")).toBe("AAAABBBBCCCCDDDD");
    });
  });

  describe("isValidBase64Xdr", () => {
    it("accepts a valid base64 payload", () => {
      expect(isValidBase64Xdr("AAAAAgAAAAAAAAAA")).toBe(true);
    });

    it("rejects empty input", () => {
      expect(isValidBase64Xdr("")).toBe(false);
    });

    it("rejects whitespace-only input", () => {
      expect(isValidBase64Xdr("   \n\t")).toBe(false);
    });

    it("rejects payload with invalid characters", () => {
      expect(isValidBase64Xdr("AAAA!AAA")).toBe(false);
    });

    it("rejects payload whose length is not a multiple of 4", () => {
      expect(isValidBase64Xdr("AAA")).toBe(false);
    });

    it("rejects payload below the minimum length", () => {
      expect(isValidBase64Xdr("AAAA")).toBe(false);
    });

    it("rejects non-string input", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(isValidBase64Xdr(123 as any)).toBe(false);
    });
  });

  describe("isStellarPublicKey", () => {
    it("accepts a valid G-prefixed key", () => {
      expect(
        isStellarPublicKey("GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ"),
      ).toBe(true);
    });

    it("rejects an invalid format", () => {
      expect(isStellarPublicKey("CAAA")).toBe(false);
      expect(isStellarPublicKey("")).toBe(false);
    });
  });

  describe("isStellarChain", () => {
    it("accepts pubnet/testnet only", () => {
      expect(isStellarChain("stellar:pubnet")).toBe(true);
      expect(isStellarChain("stellar:testnet")).toBe(true);
      expect(isStellarChain("stellar:futurenet")).toBe(false);
      expect(isStellarChain("ethereum:1")).toBe(false);
    });
  });

  describe("parseAccount", () => {
    it("parses a valid CAIP-10 account", () => {
      const out = parseAccount(
        "stellar:testnet:GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
      );
      expect(out).toEqual({
        chain: "stellar:testnet",
        publicKey: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
      });
    });

    it("returns null for an unknown chain", () => {
      expect(
        parseAccount(
          "ethereum:1:GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
        ),
      ).toBeNull();
    });

    it("returns null for an invalid public key", () => {
      expect(parseAccount("stellar:testnet:notakey")).toBeNull();
    });

    it("returns null for malformed input", () => {
      expect(parseAccount("stellar:testnet")).toBeNull();
      expect(parseAccount("")).toBeNull();
    });
  });
});
