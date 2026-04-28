import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fetchWithSRI,
  loadSRIManifest,
  clearSRICache,
  SRIIntegrityError,
} from "../SecureFetcher";

const MOCK_MANIFEST = {
  generated: "2026-04-23T12:00:00Z",
  algorithm: "sha384",
  assets: {
    "/test.wasm": "sha384-mockhash",
  },
};

describe("SecureFetcher", () => {
  beforeEach(() => {
    clearSRICache();
    vi.restoreAllMocks();
  });

  it("loads the manifest and caches it", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_MANIFEST,
    });
    vi.stubGlobal("fetch", fetchSpy);

    const m1 = await loadSRIManifest();
    expect(m1).toEqual(MOCK_MANIFEST);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const m2 = await loadSRIManifest();
    expect(m2).toEqual(MOCK_MANIFEST);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // Cached
  });

  it("bypasses verification when requested", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const buf = await fetchWithSRI("/bypass.wasm", {
      bypassVerification: true,
    });
    expect(buf.byteLength).toBe(4);
  });

  it("returns unverified if manifest fails to load", async () => {
    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url === "/sri-manifest.json") {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const buf = await fetchWithSRI("/test.wasm");
    expect(buf.byteLength).toBe(8);
  });

  it("throws SRIIntegrityError on mismatch", async () => {
    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url === "/sri-manifest.json") {
        return Promise.resolve({ ok: true, json: async () => MOCK_MANIFEST });
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    vi.stubGlobal("crypto", {
      subtle: {
        digest: async () => new Uint8Array([1, 2, 3]).buffer,
      },
    });

    await expect(fetchWithSRI("/test.wasm")).rejects.toThrow(
      SRIIntegrityError
    );
  });

  it("returns verified buffer on match", async () => {
    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url === "/sri-manifest.json") {
        return Promise.resolve({ ok: true, json: async () => MOCK_MANIFEST });
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const mockHashBase64 = "AQID"; // [1,2,3] base64 encoded
    MOCK_MANIFEST.assets["/test.wasm"] = `sha384-${mockHashBase64}`;

    vi.stubGlobal("crypto", {
      subtle: {
        digest: async () => new Uint8Array([1, 2, 3]).buffer,
      },
    });

    const buf = await fetchWithSRI("/test.wasm");
    expect(buf.byteLength).toBe(8);
  });
});
