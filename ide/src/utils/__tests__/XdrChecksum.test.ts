import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import {
  checksumXdrPayload,
  normalizeSha256Checksum,
  verifyXdrChecksum,
} from "@/utils/XdrChecksum";

describe("XdrChecksum", () => {
  beforeAll(() => {
    if (!globalThis.crypto) {
      Object.defineProperty(globalThis, "crypto", {
        value: webcrypto,
        configurable: true,
      });
    }
  });

  it("generates a deterministic checksum for normalized base64 XDR", async () => {
    const compact = await checksumXdrPayload("AAAA");
    const spaced = await checksumXdrPayload("AA AA\n");

    expect(compact.normalizedXdr).toBe("AAAA");
    expect(compact.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(compact.checksum).toBe(spaced.checksum);
  });

  it("verifies matching and mismatched checksums", async () => {
    const { checksum } = await checksumXdrPayload("AAAA");

    await expect(verifyXdrChecksum("AA AA", checksum.toUpperCase())).resolves.toMatchObject({
      matches: true,
      checksum,
    });

    await expect(verifyXdrChecksum("AAAB", checksum)).resolves.toMatchObject({
      matches: false,
      checksum: expect.any(String),
      expectedChecksum: checksum,
    });
  });

  it("rejects invalid checksum input", () => {
    expect(() => normalizeSha256Checksum("not-a-checksum")).toThrow(
      "Checksum must be a 64-character SHA-256 hex string.",
    );
  });

  it("rejects malformed base64 input", async () => {
    await expect(checksumXdrPayload("not valid")).rejects.toThrow(
      "XDR payload must be valid standard Base64.",
    );
  });
});
