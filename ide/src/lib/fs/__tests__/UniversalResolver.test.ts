import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractRemoteImportUrls,
  isRemoteImport,
  remoteUrlToVirtualPath,
  resolveRemoteImport,
  resolveWorkspaceCompileFiles,
  sanitizeRemoteCacheKey,
} from "@/lib/fs/UniversalResolver";

describe("UniversalResolver", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("detects remote import specifiers", () => {
    expect(isRemoteImport("https://example.com/lib.rs")).toBe(true);
    expect(isRemoteImport("./local/mod.rs")).toBe(false);
  });

  it("extracts https URLs from Rust source", () => {
    const source = `
      use remote_crate::Thing = "https://example.com/crates/thing.rs";
      mod helper;
    `;
    expect(extractRemoteImportUrls(source)).toEqual([
      "https://example.com/crates/thing.rs",
    ]);
  });

  it("sanitizes cache keys and virtual paths", () => {
    const url = "https://example.com/path/to/file.rs?ref=main";
    expect(sanitizeRemoteCacheKey(url)).toBe(
      "https://example.com/path/to/file.rs?ref=main",
    );
    expect(remoteUrlToVirtualPath(url)).toBe("remote/example_com/path_to/file.rs");
  });

  it("fetches remote imports and caches them", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "pub fn remote_fn() {}",
    });
    vi.stubGlobal("fetch", fetchSpy);

    const first = await resolveRemoteImport("https://example.com/remote.rs");
    expect(first.fromCache).toBe(false);
    expect(first.content).toContain("remote_fn");

    const second = await resolveRemoteImport("https://example.com/remote.rs");
    expect(second.fromCache).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("expands workspace compile files with remote dependencies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "pub mod imported {}",
      }),
    );

    const expanded = await resolveWorkspaceCompileFiles([
      {
        path: "src/lib.rs",
        content: 'use dep = "https://example.com/dep.rs";',
        language: "rust",
      },
    ]);

    expect(expanded.length).toBe(2);
    expect(expanded.some((f) => f.path.includes("remote/example_com"))).toBe(true);
  });
});
