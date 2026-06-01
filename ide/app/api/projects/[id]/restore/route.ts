import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { supabase } from "@/lib/cloud/supabaseClient";
import fs from "node:fs/promises";
import path from "node:path";
import { csrfGuard } from "@/lib/csrf";

const DB_PATH = path.join(process.cwd(), "projects-db.json");

async function readLocalDb() {
  try {
    const data = await fs.readFile(DB_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeLocalDb(data: any) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const csrfError = csrfGuard(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id || "dev-user-123";

  if (supabase) {
    try {
      const { error } = await supabase
        .from("projects")
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw error;
      return NextResponse.json({ success: true });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  } else {
    const db = await readLocalDb();
    const idx = db.findIndex((p: any) => p.id === id && p.user_id === userId);
    if (idx === -1) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    db[idx].deleted_at = null;
    db[idx].updated_at = new Date().toISOString();
    await writeLocalDb(db);
    return NextResponse.json({ success: true });
  }
}