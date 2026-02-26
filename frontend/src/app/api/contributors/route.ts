import { NextResponse } from "next/server";

// simple pass-through to GitHub so we don't hit CORS from the client
export async function GET() {
  try {
    const res = await fetch(
      "https://api.github.com/repos/0xVida/stellar-suite/contributors?per_page=20"
    );
    if (!res.ok) {
      throw new Error(`GitHub responded ${res.status}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Unable to fetch contributors" }, { status: 500 });
  }
}
