import { NextResponse } from "next/server";

interface TicketPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function POST(request: Request) {
  try {
    const body: TicketPayload = await request.json();

    // basic validation
    if (!body.name || !body.email || !body.subject || !body.message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // TODO: in a real system we might persist to a database or open a GitHub issue.
    // if a GITHUB_TOKEN is provided we can create an issue on this repo.
    if (process.env.GITHUB_TOKEN) {
      try {
        await fetch("https://api.github.com/repos/0xVida/stellar-suite/issues", {
          method: "POST",
          headers: {
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: `[Support] ${body.subject}`,
            body: `**From:** ${body.name} <${body.email}>

${body.message}`,
            labels: ["support"],
          }),
        });
      } catch (err) {
        console.error("Failed to create GitHub issue", err);
      }
    } else {
      console.log("ticket received", body);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
