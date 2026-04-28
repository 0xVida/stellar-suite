/**
 * cloudSyncService.ts
 *
 * Client-side API wrapper for cloud project persistence.
 * All network calls go through Next.js API routes so that
 * Supabase service-role credentials never leave the server.
 */

// ── Shared types ──────────────────────────────────────────────────────────────

export interface WorkspaceTextFile {
  path: string;
  content: string;
}

export interface ProjectTag {
  id: string;
  name: string;
  color: "blue" | "green" | "red" | "purple" | "yellow" | "pink" | "indigo" | "cyan";
}

export interface ProjectMeta {
  id: string;
  name: string;
  network: string;
  updatedAt: string;
  fileCount: number;
  tags?: ProjectTag[];
}

export interface ProjectData extends ProjectMeta {
  files: WorkspaceTextFile[];
  fileHashes: Record<string, string>;
}

// Returned by saveProject
export type SaveResult =
  | {
      type: "saved";
      projectId: string;
      updatedAt: string;
      fileHashes: Record<string, string>;
    }
  | {
      type: "conflict";
      cloudData: ProjectData;
    };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; status: number }> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  const data = (await res.json()) as T;
  return { data, status: res.status };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List all projects for the signed-in user.
 */
export async function listProjects(): Promise<ProjectMeta[]> {
  const { data } = await apiFetch<ProjectMeta[]>("/api/projects");
  return data;
}

/**
 * Save (create or update) a project.
 *
 * If the cloud copy was updated after `lastKnownUpdatedAt`, the server
 * returns a 409 which we surface as `{ type: "conflict" }`.
 */
export async function saveProject(params: {
  projectId: string | null;
  name: string;
  network: string;
  files: WorkspaceTextFile[];
  fileHashes: Record<string, string>;
  lastKnownUpdatedAt: string | null;
  tags?: ProjectTag[];
}): Promise<SaveResult> {
  const url = params.projectId
    ? `/api/projects/${params.projectId}`
    : "/api/projects";
  const method = params.projectId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      network: params.network,
      files: params.files,
      fileHashes: params.fileHashes,
      lastKnownUpdatedAt: params.lastKnownUpdatedAt,
      tags: params.tags || [],
    }),
  });

  if (res.status === 409) {
    const body = (await res.json()) as { cloudData: ProjectData };
    return { type: "conflict", cloudData: body.cloudData };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  const body = (await res.json()) as {
    id: string;
    updatedAt: string;
    fileHashes: Record<string, string>;
  };
  return {
    type: "saved",
    projectId: body.id,
    updatedAt: body.updatedAt,
    fileHashes: body.fileHashes,
  };
}

/**
 * Load a single project by ID.
 */
export async function loadProject(id: string): Promise<ProjectData | null> {
  try {
    const { data } = await apiFetch<ProjectData>(`/api/projects/${id}`);
    return data;
  } catch {
    return null;
  }
}

/**
 * Convert a flat WorkspaceTextFile list back into a FileNode tree.
 * Used when applying a cloud version to the workspace store.
 */
export interface FileNode {
  name: string;
  type: "file" | "folder";
  content?: string;
  language?: string;
  children?: FileNode[];
}

export function buildFileTree(files: WorkspaceTextFile[]): FileNode[] {
  const root: FileNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let cursor = root;

    for (let i = 0; i < parts.length - 1; i++) {
      let folder = cursor.find(
        (n) => n.name === parts[i] && n.type === "folder",
      );
      if (!folder) {
        folder = { name: parts[i], type: "folder", children: [] };
        cursor.push(folder);
      }
      cursor = folder.children!;
    }

    const filename = parts[parts.length - 1] ?? "";
    const ext = filename.split(".").pop() ?? "";
    const language =
      ext === "rs"
        ? "rust"
        : ext === "toml"
          ? "toml"
          : ext === "json"
            ? "json"
            : ext === "ts" || ext === "tsx"
              ? "typescript"
              : "text";

    cursor.push({
      name: filename,
      type: "file",
      content: file.content,
      language,
    });
  }

  return root;
}
