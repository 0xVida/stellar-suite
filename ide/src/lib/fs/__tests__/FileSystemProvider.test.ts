import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FileNotFoundError,
  basename,
  dirname,
  normalizePath,
} from "@/lib/fs/FileSystemProvider";
import { BrowserFileSystemProvider } from "@/lib/fs/adapters/BrowserFileSystemProvider";
import { LocalFileSystemProvider } from "@/lib/fs/adapters/LocalFileSystemProvider";
import { GitHubFileSystemProvider } from "@/lib/fs/adapters/GitHubFileSystemProvider";

// ── Path helpers ─────────────────────────────────────────────────────────────

describe("path helpers", () => {
  it("normalizes slashes, dot segments, and leading/trailing slashes", () => {
    expect(normalizePath("/a/b/c.rs")).toBe("a/b/c.rs");
    expect(normalizePath("a\\b\\c.rs")).toBe("a/b/c.rs");
    expect(normalizePath("a//b/./c.rs")).toBe("a/b/c.rs");
    expect(normalizePath("a/b/../c.rs")).toBe("a/c.rs");
    expect(normalizePath("")).toBe("");
  });

  it("throws when a path escapes the root", () => {
    expect(() => normalizePath("../escape")).toThrow(/escapes root/);
    expect(() => normalizePath("a/../../escape")).toThrow(/escapes root/);
  });

  it("derives dirname and basename", () => {
    expect(dirname("a/b/c.rs")).toBe("a/b");
    expect(dirname("top.rs")).toBe("");
    expect(basename("a/b/c.rs")).toBe("c.rs");
    expect(basename("top.rs")).toBe("top.rs");
  });
});

// ── Browser (IndexedDB) adapter — uses fake-indexeddb from test setup ────────

describe("BrowserFileSystemProvider", () => {
  let fs: BrowserFileSystemProvider;

  beforeEach(() => {
    // Unique DB per test for isolation.
    fs = new BrowserFileSystemProvider(`test-fs-${Math.random().toString(36).slice(2)}`);
  });

  it("exposes a stable id", () => {
    expect(fs.id).toBe("browser");
  });

  it("writes and reads a file", async () => {
    await fs.writeFile("src/lib.rs", "pub fn x() {}");
    expect(await fs.readFile("src/lib.rs")).toBe("pub fn x() {}");
  });

  it("normalizes paths so equivalent forms hit the same entry", async () => {
    await fs.writeFile("/src/lib.rs", "v1");
    expect(await fs.readFile("src/lib.rs")).toBe("v1");
  });

  it("throws FileNotFoundError for a missing file", async () => {
    await expect(fs.readFile("nope.rs")).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it("reports existence for files and implicit directories", async () => {
    await fs.writeFile("a/b/c.rs", "x");
    expect(await fs.exists("a/b/c.rs")).toBe(true);
    expect(await fs.exists("a/b")).toBe(true); // implicit dir
    expect(await fs.exists("a")).toBe(true);
    expect(await fs.exists("z")).toBe(false);
  });

  it("lists immediate children (files + subdirectories)", async () => {
    await fs.writeFile("root.rs", "x");
    await fs.writeFile("sub/a.rs", "x");
    await fs.writeFile("sub/deep/b.rs", "x");

    const top = await fs.list("");
    expect(top.find((e) => e.path === "root.rs")?.isDirectory).toBe(false);
    expect(top.find((e) => e.path === "sub")?.isDirectory).toBe(true);

    const sub = await fs.list("sub");
    expect(sub.map((e) => e.path).sort()).toEqual(["sub/a.rs", "sub/deep"]);
  });

  it("stats files and directories, and deletes files", async () => {
    await fs.writeFile("dir/file.rs", "hello");
    const fileStat = await fs.stat("dir/file.rs");
    expect(fileStat.isDirectory).toBe(false);
    expect(fileStat.size).toBe(5);

    const dirStat = await fs.stat("dir");
    expect(dirStat.isDirectory).toBe(true);

    await fs.delete("dir/file.rs");
    expect(await fs.exists("dir/file.rs")).toBe(false);
  });
});

// ── Local (Node fs) adapter — injected in-memory fs mock ─────────────────────

/**
 * Minimal in-memory stand-in for node:fs/promises used by the local adapter.
 * Keys are normalised to forward slashes so the mock behaves identically on
 * Windows (where path.join emits backslashes) and POSIX.
 */
function makeMemoryFs() {
  const files = new Map<string, string>();
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const ENOENT = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  return {
    store: files,
    async readFile(p: string) {
      const key = norm(p);
      if (!files.has(key)) throw ENOENT();
      return files.get(key)!;
    },
    async writeFile(p: string, content: string) {
      files.set(norm(p), content);
    },
    async mkdir() {
      /* no-op: flat map needs no directories */
    },
    async rm(p: string) {
      const key = norm(p);
      // Remove the file and anything beneath it (recursive).
      for (const existing of [...files.keys()]) {
        if (existing === key || existing.startsWith(key + "/")) {
          files.delete(existing);
        }
      }
    },
    async stat(p: string) {
      const key = norm(p);
      const isDir = [...files.keys()].some((k) => k.startsWith(key + "/"));
      if (!files.has(key) && !isDir) throw ENOENT();
      const content = files.get(key);
      return {
        isDirectory: () => !files.has(key) && isDir,
        size: content ? content.length : 0,
        mtimeMs: 123,
      };
    },
    async readdir(p: string) {
      const prefix = norm(p) + "/";
      const names = new Set<string>();
      const dirs = new Set<string>();
      for (const key of files.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash === -1) names.add(rest);
        else dirs.add(rest.slice(0, slash));
      }
      return [
        ...[...names].map((n) => ({ name: n, isDirectory: () => false })),
        ...[...dirs].map((n) => ({ name: n, isDirectory: () => true })),
      ];
    },
  };
}

describe("LocalFileSystemProvider", () => {
  let mem: ReturnType<typeof makeMemoryFs>;
  let fs: LocalFileSystemProvider;
  const ROOT = "/workspace";

  beforeEach(() => {
    mem = makeMemoryFs();
    fs = new LocalFileSystemProvider(ROOT, mem as never);
  });

  it("exposes a stable id", () => {
    expect(fs.id).toBe("local");
  });

  it("writes and reads relative to the root", async () => {
    await fs.writeFile("src/main.rs", "fn main() {}");
    expect(await fs.readFile("src/main.rs")).toBe("fn main() {}");
    // Stored under the resolved absolute path.
    expect([...mem.store.keys()].some((k) => k.includes("main.rs"))).toBe(true);
  });

  it("throws FileNotFoundError for a missing file", async () => {
    await expect(fs.readFile("ghost.rs")).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it("reports existence and deletes", async () => {
    await fs.writeFile("a.rs", "x");
    expect(await fs.exists("a.rs")).toBe(true);
    await fs.delete("a.rs");
    expect(await fs.exists("a.rs")).toBe(false);
  });

  it("delete is a no-op for a missing path", async () => {
    await expect(fs.delete("missing.rs")).resolves.toBeUndefined();
  });

  it("lists directory entries and returns [] for a missing directory", async () => {
    await fs.writeFile("pkg/a.rs", "x");
    await fs.writeFile("pkg/sub/b.rs", "x");
    const entries = await fs.list("pkg");
    expect(entries.map((e) => e.path).sort()).toEqual(["pkg/a.rs", "pkg/sub"]);
    expect(await fs.list("does-not-exist")).toEqual([]);
  });

  it("refuses paths that escape the root", async () => {
    await expect(fs.readFile("../../etc/passwd")).rejects.toThrow(/escapes root/);
  });
});

// ── GitHub (remote) adapter — injected fetch mock ────────────────────────────

describe("GitHubFileSystemProvider", () => {
  const base = "https://api.test";
  const opts = (fetchImpl: unknown) => ({
    owner: "octo",
    repo: "demo",
    branch: "main",
    token: "tok",
    apiBase: base,
    fetchImpl: fetchImpl as never,
  });

  afterEach(() => vi.restoreAllMocks());

  it("exposes a stable id", () => {
    const fs = new GitHubFileSystemProvider(opts(vi.fn()));
    expect(fs.id).toBe("github");
  });

  it("reads and base64-decodes a file blob", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: "file",
        name: "lib.rs",
        path: "src/lib.rs",
        size: 11,
        sha: "abc",
        encoding: "base64",
        content: Buffer.from("pub fn y(){}").toString("base64"),
      }),
    });
    const fs = new GitHubFileSystemProvider(opts(fetchImpl));
    expect(await fs.readFile("src/lib.rs")).toBe("pub fn y(){}");
    // Sends auth header and ref.
    expect(fetchImpl).toHaveBeenCalledWith(
      `${base}/repos/octo/demo/contents/src/lib.rs?ref=main`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("throws FileNotFoundError on a 404", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const fs = new GitHubFileSystemProvider(opts(fetchImpl));
    await expect(fs.readFile("nope.rs")).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it("creates a new file with a PUT (no sha) when none exists", async () => {
    const calls: Array<{ url: string; init?: { method?: string; body?: string } }> = [];
    const fetchImpl = vi.fn().mockImplementation((url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, init });
      if (init?.method === "PUT") {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({}) });
      }
      // initial existence GET → 404
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });
    const fs = new GitHubFileSystemProvider(opts(fetchImpl));
    await fs.writeFile("new.rs", "content");

    const put = calls.find((c) => c.init?.method === "PUT")!;
    expect(put).toBeDefined();
    const body = JSON.parse(put.init!.body!);
    expect(body.sha).toBeUndefined(); // new file → no sha
    expect(Buffer.from(body.content, "base64").toString("utf-8")).toBe("content");
  });

  it("updates an existing file by including its blob sha", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
      if (!init || init.method === undefined || init.method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ type: "file", name: "x", path: "x.rs", size: 1, sha: "OLD_SHA" }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    const fs = new GitHubFileSystemProvider(opts(fetchImpl));
    await fs.writeFile("x.rs", "updated");

    const put = fetchImpl.mock.calls.find((c) => c[1]?.method === "PUT")!;
    const body = JSON.parse(put[1].body);
    expect(body.sha).toBe("OLD_SHA");
  });

  it("lists a directory's entries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { type: "file", name: "a.rs", path: "src/a.rs", size: 3, sha: "1" },
        { type: "dir", name: "sub", path: "src/sub", size: 0, sha: "2" },
      ],
    });
    const fs = new GitHubFileSystemProvider(opts(fetchImpl));
    const entries = await fs.list("src");
    expect(entries).toEqual([
      { path: "src/a.rs", isDirectory: false, size: 3 },
      { path: "src/sub", isDirectory: true, size: 0 },
    ]);
  });

  it("reports existence via exists()", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ type: "file", path: "a", size: 1, sha: "s" }) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    const fs = new GitHubFileSystemProvider(opts(fetchImpl));
    expect(await fs.exists("a.rs")).toBe(true);
    expect(await fs.exists("missing.rs")).toBe(false);
  });
});

// ── Cross-adapter contract: all three satisfy the same interface shape ───────

describe("FileSystemProvider contract", () => {
  it("every adapter implements the full interface surface", () => {
    const browser = new BrowserFileSystemProvider("contract-test");
    const local = new LocalFileSystemProvider("/root", makeMemoryFs() as never);
    const github = new GitHubFileSystemProvider({
      owner: "o",
      repo: "r",
      fetchImpl: vi.fn() as never,
    });
    for (const provider of [browser, local, github]) {
      expect(typeof provider.id).toBe("string");
      for (const method of ["readFile", "writeFile", "delete", "exists", "list", "stat"] as const) {
        expect(typeof provider[method]).toBe("function");
      }
    }
  });
});
