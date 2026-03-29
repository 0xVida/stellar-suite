import { NextRequest, NextResponse } from "next/server";

import {
  prepareRustWorkspace,
  runCommand,
  type RustWorkspacePayload,
} from "../_lib/rustTooling";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let payload: RustWorkspacePayload;

  try {
    payload = (await request.json()) as RustWorkspacePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!payload || !Array.isArray(payload.files) || payload.files.length === 0) {
    return NextResponse.json({ error: "files[] payload is required." }, { status: 400 });
  }

  let workspace;
  try {
    workspace = await prepareRustWorkspace(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare Rust workspace." },
      { status: 400 },
    );
  }

  try {
    const result = await runCommand(
      "cargo",
      ["clippy", "--message-format=json", "--all-targets"],
      workspace.contractDir,
    );

    return NextResponse.json({
      success: result.exitCode === 0,
      command: `cargo ${result.args.join(" ")}`,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.spawnError,
    });
  } finally {
    await workspace.cleanup();
  }
}
