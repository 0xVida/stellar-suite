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

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id || "dev-user-123";
  const trash = request.nextUrl.searchParams.get("trash") === "true";

  if (supabase) {
    try {
      let query = supabase.from("projects").select("*").eq("user_id", userId);
      if (trash) {
        query = query.not("deleted_at", "is", null);
      } else {
        query = query.is("deleted_at", null);
      }
      
      const { data, error } = await query.order("updated_at", { ascending: false });
      if (error) throw error;
      
      const mapped = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        network: p.network,
        updatedAt: p.updated_at,
        fileCount: Array.isArray(p.files) ? p.files.length : 0,
        tags: p.tags || [],
        deletedAt: p.deleted_at || null,
      }));
      return NextResponse.json(mapped);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  } else {
    const db = await readLocalDb();
    const filtered = db.filter((p: any) => p.user_id === userId && (trash ? !!p.deleted_at : !p.deleted_at));
    const sorted = filtered.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    const mapped = sorted.map((p: any) => ({
      id: p.id,
      name: p.name,
      network: p.network,
      updatedAt: p.updated_at,
      fileCount: p.files ? p.files.length : 0,
      tags: p.tags || [],
      deletedAt: p.deleted_at || null,
    }));
    return NextResponse.json(mapped);
  }
}

export async function POST(request: NextRequest) {
  const csrfError = csrfGuard(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id || "dev-user-123";

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, network, files, fileHashes, tags } = body;
  const newId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newProject = {
    id: newId,
    user_id: userId,
    name: name || "Untitled Project",
    files: files || [],
    file_hashes: fileHashes || {},
    network: network || "testnet",
    tags: tags || [],
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  if (supabase) {
    try {
      const { error } = await supabase.from("projects").insert([
        {
          id: newProject.id,
          user_id: newProject.user_id,
          name: newProject.name,
          files: newProject.files,
          file_hashes: newProject.file_hashes,
          network: newProject.network,
          tags: newProject.tags,
          created_at: newProject.created_at,
          updated_at: newProject.updated_at,
          deleted_at: newProject.deleted_at,
        }
      ]);
      if (error) throw error;
      return NextResponse.json({ id: newId, updatedAt: now, fileHashes: newProject.file_hashes });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  } else {
    const db = await readLocalDb();
    db.push(newProject);
    await writeLocalDb(db);
    return NextResponse.json({ id: newId, updatedAt: now, fileHashes: newProject.file_hashes });
  }
}