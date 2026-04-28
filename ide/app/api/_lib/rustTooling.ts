import { mkdtemp, mkdir, rm, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

export interface RustWorkspaceFile {
  path: string;
  content: string;
}

export interface RustWorkspacePayload {
  contractName: string;
  files: RustWorkspaceFile[];
}

export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  spawnError?: string;
}

export interface PreparedWorkspace {
  rootDir: string;
  contractDir: string;
  cleanup: () => Promise<void>;
}

export interface PrepareWorkspaceOptions {
  mode?: "single-contract" | "shared";
}

const sanitizePath = (rawPath: string) => {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const safe = path.posix.normalize(normalized);
  if (safe.startsWith("../") || safe === "..") {
    throw new Error(`Invalid file path: ${rawPath}`);
  }
  return safe;
};

const hasCargoToml = async (directory: string) => {
  try {
    await access(path.join(directory, "Cargo.toml"), fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export async function prepareRustWorkspace(
  payload: RustWorkspacePayload,
  options: PrepareWorkspaceOptions = {},
): Promise<PreparedWorkspace> {
  const contractName = payload.contractName?.trim() || "hello_world";
  const mode = options.mode ?? "single-contract";

  const filtered =
    mode === "shared"
      ? payload.files
      : payload.files.filter((file) =>
          sanitizePath(file.path).startsWith(`${contractName}/`),
        );

  if (filtered.length === 0) {
    throw new Error(`No files found for contract '${contractName}'.`);
  }

  const rootDir = await mkdtemp(path.join(tmpdir(), "stellar-ide-rust-"));
  const contractDir = path.join(rootDir, contractName);

  await mkdir(contractDir, { recursive: true });

  for (const file of filtered) {
    const safePath = sanitizePath(file.path);
    const relative =
      mode === "shared" ? safePath : safePath.replace(`${contractName}/`, "");
    if (!relative || relative === ".") {
      continue;
    }

    const absolute =
      mode === "shared" ? path.join(rootDir, relative) : path.join(contractDir, relative);
    const parent = path.dirname(absolute);
    await mkdir(parent, { recursive: true });
    await writeFile(absolute, file.content, "utf-8");
  }

  const hasManifest = await hasCargoToml(contractDir);
  if (!hasManifest) {
    await rm(rootDir, { recursive: true, force: true });
    throw new Error(`Missing Cargo.toml for contract '${contractName}'.`);
  }

  return {
    rootDir,
    contractDir,
    cleanup: () => rm(rootDir, { recursive: true, force: true }),
  };
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(String(chunk));
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(String(chunk));
    });

    child.on("error", (error) => {
      resolve({
        command,
        args,
        exitCode: 127,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        spawnError: error.message,
      });
    });

    child.on("close", (code) => {
      resolve({
        command,
        args,
        exitCode: typeof code === "number" ? code : 1,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
      });
    });
  });
}
