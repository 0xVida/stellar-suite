import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { withCorsProtection } from "../_lib/corsMiddleware";

async function handleFormatRequest(req: NextRequest): Promise<NextResponse> {
  try {
    const { code } = await req.json();

    if (!code) {
      return NextResponse.json({ error: "No code provided" }, { status: 400 });
    }

    const result = spawnSync("rustfmt", ["--emit", "stdout"], {
      input: code,
      encoding: "utf-8",
    });

    if (result.error) {
      console.error("rustfmt execution error:", result.error);
      return NextResponse.json(
        { error: "Failed to execute rustfmt" },
        { status: 500 }
      );
    }

    if (result.status !== 0) {
      const stderr = result.stderr.toString();
      return NextResponse.json(
        { error: "Formatting failed", details: stderr },
        { status: 422 }
      );
    }

    const formattedCode = result.stdout.toString();
    return NextResponse.json({ formattedCode });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const handlers = {
  POST: handleFormatRequest,
};

export const POST = withCorsProtection(handlers.POST as (req: NextRequest) => Promise<NextResponse>);