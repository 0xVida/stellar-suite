/**
 * Issue #882 — Remote GitHub adapter for {@link FileSystemProvider}.
 *
 * Backs the workspace with a GitHub repository via the REST Contents API, so a
 * project can be opened straight from (and saved back to) a repo. Reads decode
 * base64 blob content; writes create-or-update a file with its current blob
 * SHA. The `fetch` implementation is injectable for deterministic testing.
 */
import {
  FileNotFoundError,
  type FileStat,
  type FileSystemProvider,
  normalizePath,
} from "../FileSystemProvider";

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface GitHubProviderOptions {
  owner: string;
  repo: string;
  /** Branch to read/write. Defaults to "main". */
  branch?: string;
  /** Personal access token for authenticated / write access. */
  token?: string;
  /** Injectable fetch (defaults to global fetch). */
  fetchImpl?: FetchLike;
  /** Override the API base (defaults to https://api.github.com). */
  apiBase?: string;
}

interface ContentsEntry {
  type: "file" | "dir";
  name: string;
  path: string;
  size: number;
  sha: string;
  content?: string;
  encoding?: string;
}

export class GitHubFileSystemProvider implements FileSystemProvider {
  readonly id = "github";
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch: string;
  private readonly token?: string;
  private readonly fetchImpl: FetchLike;
  private readonly apiBase: string;

  constructor(opts: GitHubProviderOptions) {
    this.owner = opts.owner;
    this.repo = opts.repo;
    this.branch = opts.branch ?? "main";
    this.token = opts.token;
    this.apiBase = opts.apiBase ?? "https://api.github.com";
    const fallback = (globalThis as { fetch?: FetchLike }).fetch;
    const impl = opts.fetchImpl ?? fallback;
    if (!impl) throw new Error("No fetch implementation available");
    this.fetchImpl = impl;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private contentsUrl(path: string): string {
    const p = normalizePath(path);
    return `${this.apiBase}/repos/${this.owner}/${this.repo}/contents/${p}?ref=${encodeURIComponent(this.branch)}`;
  }

  private async getEntry(path: string): Promise<ContentsEntry | ContentsEntry[] | null> {
    const res = await this.fetchImpl(this.contentsUrl(path), {
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status}) for ${normalizePath(path)}`);
    }
    return (await res.json()) as ContentsEntry | ContentsEntry[];
  }

  async readFile(path: string): Promise<string> {
    const entry = await this.getEntry(path);
    if (!entry || Array.isArray(entry) || entry.type !== "file") {
      throw new FileNotFoundError(normalizePath(path));
    }
    if (entry.encoding === "base64" && entry.content !== undefined) {
      // atob is available in browsers and modern Node; fall back to Buffer.
      const b64 = entry.content.replace(/\n/g, "");
      if (typeof atob === "function") return atob(b64);
      return Buffer.from(b64, "base64").toString("utf-8");
    }
    return entry.content ?? "";
  }

  async writeFile(path: string, content: string): Promise<void> {
    const p = normalizePath(path);
    const existing = await this.getEntry(p);
    const sha =
      existing && !Array.isArray(existing) ? existing.sha : undefined;
    const encoded =
      typeof btoa === "function"
        ? btoa(content)
        : Buffer.from(content, "utf-8").toString("base64");

    const res = await this.fetchImpl(
      `${this.apiBase}/repos/${this.owner}/${this.repo}/contents/${p}`,
      {
        method: "PUT",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Update ${p}`,
          content: encoded,
          branch: this.branch,
          ...(sha ? { sha } : {}),
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`GitHub write failed (${res.status}) for ${p}`);
    }
  }

  async delete(path: string): Promise<void> {
    const p = normalizePath(path);
    const existing = await this.getEntry(p);
    if (!existing || Array.isArray(existing)) return; // nothing to delete
    const res = await this.fetchImpl(
      `${this.apiBase}/repos/${this.owner}/${this.repo}/contents/${p}`,
      {
        method: "DELETE",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Delete ${p}`,
          sha: existing.sha,
          branch: this.branch,
        }),
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`GitHub delete failed (${res.status}) for ${p}`);
    }
  }

  async exists(path: string): Promise<boolean> {
    return (await this.getEntry(path)) !== null;
  }

  async list(dir: string): Promise<FileStat[]> {
    const entry = await this.getEntry(dir);
    if (!entry) return [];
    if (!Array.isArray(entry)) {
      // A file path was passed where a directory was expected.
      return [];
    }
    return entry.map((e) => ({
      path: e.path,
      isDirectory: e.type === "dir",
      size: e.size,
    }));
  }

  async stat(path: string): Promise<FileStat> {
    const entry = await this.getEntry(path);
    if (!entry) throw new FileNotFoundError(normalizePath(path));
    if (Array.isArray(entry)) {
      return { path: normalizePath(path), isDirectory: true, size: 0 };
    }
    return {
      path: entry.path,
      isDirectory: entry.type === "dir",
      size: entry.size,
    };
  }
}
