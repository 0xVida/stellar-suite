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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id || "dev-user-123";

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      return NextResponse.json({
        id: data.id,
        name: data.name,
        network: data.network,
        updatedAt: data.updated_at,
        files: data.files || [],
        fileHashes: data.file_hashes || {},
        tags: data.tags || [],
        deletedAt: data.deleted_at || null,
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  } else {
    const db = await readLocalDb();
    const project = db.find((p: any) => p.id === id && p.user_id === userId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: project.id,
      name: project.name,
      network: project.network,
      updatedAt: project.updated_at,
      files: project.files || [],
      fileHashes: project.file_hashes || {},
      tags: project.tags || [],
      deletedAt: project.deleted_at || null,
    });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const { name, network, files, fileHashes, lastKnownUpdatedAt, tags } = body;
  const now = new Date().toISOString();

  if (supabase) {
    try {
      const { data: current, error: getErr } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (getErr || !current) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      if (lastKnownUpdatedAt && current.updated_at !== lastKnownUpdatedAt) {
        return NextResponse.json({ cloudData: current }, { status: 409 });
      }

      const { error: updateErr } = await supabase
        .from("projects")
        .update({
          name: name ?? current.name,
          network: network ?? current.network,
          files: files ?? current.files,
          file_hashes: fileHashes ?? current.file_hashes,
          tags: tags ?? current.tags,
          updated_at: now,
        })
        .eq("id", id)
        .eq("user_id", userId);

      if (updateErr) throw updateErr;

      return NextResponse.json({ id, updatedAt: now, fileHashes: fileHashes ?? current.file_hashes });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  } else {
    const db = await readLocalDb();
    const idx = db.findIndex((p: any) => p.id === id && p.user_id === userId);
    if (idx === -1) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const current = db[idx];

    if (lastKnownUpdatedAt && current.updated_at !== lastKnownUpdatedAt) {
      return NextResponse.json({ cloudData: current }, { status: 409 });
    }

    db[idx] = {
      ...current,
      name: name ?? current.name,
      network: network ?? current.network,
      files: files ?? current.files,
      file_hashes: fileHashes ?? current.file_hashes,
      tags: tags ?? current.tags,
      updated_at: now,
    };

    await writeLocalDb(db);
    return NextResponse.json({ id, updatedAt: now, fileHashes: db[idx].file_hashes });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const csrfError = csrfGuard(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id || "dev-user-123";
  const permanent = request.nextUrl.searchParams.get("permanent") === "true";

  if (supabase) {
    try {
      if (permanent) {
        const { error } = await supabase
          .from("projects")
          .delete()
          .eq("id", id)
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("projects")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId);

        if (error) throw error;
      }
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

    if (permanent) {
      db.splice(idx, 1);
    } else {
      db[idx].deleted_at = new Date().toISOString();
    }

    await writeLocalDb(db);
    return NextResponse.json({ success: true });
  }
}