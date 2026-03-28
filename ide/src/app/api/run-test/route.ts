import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  let testName: string;
  let filePath: string;

  try {
    const body = await req.json();
    testName = body.testName;
    filePath = body.filePath;
  } catch {
    return NextResponse.json({ passed: false, output: "Invalid request body" }, { status: 400 });
  }

  if (!testName || typeof testName !== "string") {
    return NextResponse.json({ passed: false, output: "testName is required" }, { status: 400 });
  }

  // Sanitize — only allow alphanumeric, underscores, colons
  if (!/^[a-zA-Z0-9_:]+$/.test(testName)) {
    return NextResponse.json({ passed: false, output: "Invalid test name" }, { status: 400 });
  }

  const workspaceRoot =
    process.env.WORKSPACE_ROOT ||
    process.env.CARGO_WORKSPACE_DIR ||
    process.cwd();

  const command = `cd "${workspaceRoot}" && cargo test "${testName}" -- --nocapture 2>&1`;

  try {
    const { stdout } = await execAsync(command, { timeout: 60_000, maxBuffer: 1024 * 512 });
    const passed =
      stdout.includes("test result: ok") ||
      stdout.includes(`test ${testName} ... ok`);
    return NextResponse.json({ passed, output: stdout });
  } catch (err: unknown) {
    const output = (err as { stdout?: string }).stdout || (err as Error).message || "Unknown error";
    return NextResponse.json({ passed: false, output });
  }
}
