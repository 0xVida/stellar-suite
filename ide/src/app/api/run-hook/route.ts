import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";

interface RunHookRequest {
  command: string;
}

interface RunHookResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
}

function runShellCommand(command: string): Promise<RunHookResponse> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(String(chunk));
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(String(chunk));
    });

    child.on("error", (err) => {
      resolve({
        exitCode: 127,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        error: err.message,
      });
    });

    child.on("close", (code) => {
      resolve({
        exitCode: typeof code === "number" ? code : 1,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
      });
    });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RunHookRequest;

  try {
    body = (await req.json()) as RunHookRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { command } = body;

  if (!command || typeof command !== "string" || command.trim() === "") {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const result = await runShellCommand(command.trim());
  const status = result.exitCode === 0 ? 200 : 500;
  return NextResponse.json(result, { status });
}
