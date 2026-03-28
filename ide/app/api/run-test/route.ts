import { NextRequest, NextResponse } from "next/server";

import {
  prepareRustWorkspace,
  runCommand,
  type RustWorkspacePayload,
} from "../_lib/rustTooling";

export const runtime = "nodejs";

interface RunTestPayload extends RustWorkspacePayload {
  mode?: "full" | "failed-only";
  failedTestNames?: string[];
  integrationTargets?: string[];
}

const TEST_RESULT_RE = /^test\s+(.+?)\s+\.\.\.\s+(ok|FAILED)$/;

function parseCargoTestOutput(stdout: string) {
  const lines = stdout.split(/\r?\n/);
  const outcomes = new Map<string, "passed" | "failed">();

  for (const line of lines) {
    const match = line.trim().match(TEST_RESULT_RE);
    if (!match) {
      continue;
    }

    const [, name, status] = match;
    outcomes.set(name, status === "ok" ? "passed" : "failed");
  }

  return outcomes;
}

export async function POST(request: NextRequest) {
  let payload: RunTestPayload;

  try {
    payload = (await request.json()) as RunTestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!payload || !Array.isArray(payload.files) || payload.files.length === 0) {
    return NextResponse.json({ error: "files[] payload is required." }, { status: 400 });
  }

  if (!payload.contractName?.trim()) {
    return NextResponse.json({ error: "contractName is required." }, { status: 400 });
  }

  let workspace;
  try {
    workspace = await prepareRustWorkspace(payload, { mode: "shared" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare Rust workspace." },
      { status: 400 },
    );
  }

  try {
    const integrationTargets = Array.from(new Set(payload.integrationTargets ?? []));
    const mode = payload.mode === "failed-only" ? "failed-only" : "full";

    let args: string[] = [];
    let commandLabel = "cargo test";

    if (integrationTargets.length > 0) {
      args = ["test"];
      for (const target of integrationTargets) {
        args.push("--test", target);
      }
      args.push("--", "--nocapture");
      commandLabel = `cargo test --test ${integrationTargets.join(" --test ")}`;
    } else if (mode === "failed-only" && (payload.failedTestNames?.length ?? 0) === 1) {
      const onlyFailed = payload.failedTestNames?.[0] ?? "";
      args = ["test", onlyFailed, "--", "--exact", "--nocapture"];
      commandLabel = `cargo test ${onlyFailed} -- --exact --nocapture`;
    } else {
      args = ["test", "--", "--nocapture"];
      commandLabel = "cargo test -- --nocapture";
    }

    const result = await runCommand("cargo", args, workspace.contractDir);
    const outcomes = parseCargoTestOutput(result.stdout);

    return NextResponse.json({
      success: result.exitCode === 0,
      mode,
      command: commandLabel,
      commandArgs: result.args,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      outcomes: Object.fromEntries(outcomes.entries()),
      error: result.spawnError,
    });
  } finally {
    await workspace.cleanup();
  }
}
