import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, normalize, sep } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompilePayload {
  files: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BUILD_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Validate that every file path in the payload is safe:
 *   – no ".." segments (path traversal)
 *   – no absolute paths
 *   – no empty keys
 */
function validatePaths(files: Record<string, string>): string | null {
  for (const relPath of Object.keys(files)) {
    if (!relPath || relPath.trim().length === 0) {
      return "File path must not be empty";
    }

    const normalized = normalize(relPath);

    // Reject absolute paths
    if (normalized.startsWith(sep) || /^[a-zA-Z]:/.test(normalized)) {
      return `Absolute paths are not allowed: ${relPath}`;
    }

    // Reject path traversal
    if (normalized.startsWith("..") || normalized.includes(`${sep}..`)) {
      return `Path traversal is not allowed: ${relPath}`;
    }
  }
  return null;
}

/**
 * Write every file from the payload into `baseDir`.
 * Creates intermediate directories as needed.
 */
async function writeFilesToDisk(
  baseDir: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    const dest = join(baseDir, normalize(relPath));

    // Safety: ensure resolved path is still inside baseDir
    if (!dest.startsWith(baseDir)) {
      throw new Error(`Resolved path escapes sandbox: ${relPath}`);
    }

    await mkdir(join(dest, ".."), { recursive: true });
    await writeFile(dest, content, "utf-8");
  }
}

/**
 * Locate the compiled .wasm file inside the target directory.
 * Returns the file contents as a base64 string, or null.
 */
async function readWasmArtifact(baseDir: string): Promise<string | null> {
  const releaseDir = join(
    baseDir,
    "target",
    "wasm32-unknown-unknown",
    "release",
  );

  try {
    const { readdirSync } = await import("fs");
    const entries = readdirSync(releaseDir);
    const wasmFile = entries.find((f: string) => f.endsWith(".wasm"));
    if (!wasmFile) return null;
    const buf = await readFile(join(releaseDir, wasmFile));
    return buf.toString("base64");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SSE encoder helper
// ---------------------------------------------------------------------------

function sseEvent(
  event: string,
  data: Record<string, unknown>,
): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // ── Parse & validate payload ────────────────────────────────────────
  let payload: CompilePayload;
  try {
    payload = await req.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (
    !payload.files ||
    typeof payload.files !== "object" ||
    Array.isArray(payload.files)
  ) {
    return Response.json(
      { error: "Body must contain a `files` object mapping paths to contents" },
      { status: 400 },
    );
  }

  if (Object.keys(payload.files).length === 0) {
    return Response.json(
      { error: "File tree is empty" },
      { status: 400 },
    );
  }

  const pathError = validatePaths(payload.files);
  if (pathError) {
    return Response.json({ error: pathError }, { status: 400 });
  }

  // ── Create temp sandbox ─────────────────────────────────────────────
  let sandboxDir: string;
  try {
    sandboxDir = await mkdtemp(join(tmpdir(), "stellar-compile-"));
  } catch (err) {
    return Response.json(
      { error: "Failed to create sandbox directory", detail: String(err) },
      { status: 500 },
    );
  }

  // ── Stream build events via SSE ─────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Write the virtual files to disk
        await writeFilesToDisk(sandboxDir, payload.files);

        controller.enqueue(
          sseEvent("status", { message: "Files written. Starting build…" }),
        );

        // Spawn cargo build
        const cargo = spawn(
          "cargo",
          ["build", "--target", "wasm32-unknown-unknown", "--release"],
          {
            cwd: sandboxDir,
            env: { ...process.env, CARGO_TARGET_DIR: join(sandboxDir, "target") },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );

        let killed = false;

        // Timeout guard
        const timer = setTimeout(() => {
          killed = true;
          cargo.kill("SIGKILL");
          controller.enqueue(
            sseEvent("error", { message: "Build timed out after 60 s" }),
          );
        }, BUILD_TIMEOUT_MS);

        // Stream stdout
        cargo.stdout.on("data", (chunk: Buffer) => {
          controller.enqueue(
            sseEvent("stdout", { data: chunk.toString() }),
          );
        });

        // Stream stderr
        cargo.stderr.on("data", (chunk: Buffer) => {
          controller.enqueue(
            sseEvent("stderr", { data: chunk.toString() }),
          );
        });

        // Wait for process exit
        const exitCode = await new Promise<number | null>((resolve) => {
          cargo.on("close", (code) => resolve(code));
          cargo.on("error", (err) => {
            controller.enqueue(
              sseEvent("error", { message: `Spawn error: ${err.message}` }),
            );
            resolve(null);
          });
        });

        clearTimeout(timer);

        if (killed) {
          // Already sent the timeout error event
        } else if (exitCode === 0) {
          const wasmBase64 = await readWasmArtifact(sandboxDir);
          controller.enqueue(
            sseEvent("done", {
              success: true,
              exitCode: 0,
              wasm: wasmBase64,
            }),
          );
        } else {
          controller.enqueue(
            sseEvent("done", {
              success: false,
              exitCode,
              wasm: null,
            }),
          );
        }
      } catch (err) {
        controller.enqueue(
          sseEvent("error", {
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      } finally {
        // Cleanup sandbox
        try {
          await rm(sandboxDir, { recursive: true, force: true });
        } catch {
          /* best-effort cleanup */
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
