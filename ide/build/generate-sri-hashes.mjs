#!/usr/bin/env node
/**
 * generate-sri-hashes.mjs
 *
 * Build-time Subresource Integrity (SRI) hash generator.
 *
 * Scans:
 *   • public/workers/*.js   — Web Worker scripts
 *   • public/**\/*.wasm      — Any WASM binaries present in public/
 *
 * For each asset computes a SHA-384 digest and writes a manifest to
 * public/wasm-hashes.json so WasmLoader.ts can verify them at runtime.
 *
 * Usage:
 *   node build/generate-sri-hashes.mjs
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const IDE_ROOT = join(__dirname, "..");
const PUBLIC_DIR = join(IDE_ROOT, "public");
const MANIFEST_PATH = join(PUBLIC_DIR, "wasm-hashes.json");

// ─── Collect candidate files ─────────────────────────────────────────────────

function walkDir(dir, predicate, results = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const abs = join(dir, entry);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkDir(abs, predicate, results);
    } else if (predicate(entry)) {
      results.push(abs);
    }
  }
  return results;
}

const isWorkerOrWasm = (name) =>
  name.endsWith(".worker.js") || name.endsWith(".wasm");

const candidates = walkDir(PUBLIC_DIR, isWorkerOrWasm);

if (candidates.length === 0) {
  console.warn(
    "[SRI] No worker or WASM assets found under public/. Manifest will be empty."
  );
}

// ─── Hash each file ───────────────────────────────────────────────────────────

console.log("[SRI] Scanning public/ for WASM and worker assets...");

const assets = {};

for (const abs of candidates) {
  const bytes = readFileSync(abs);
  const digest = createHash("sha384").update(bytes).digest("base64");
  const sri = `sha384-${digest}`;

  // Convert absolute path → URL path relative to public/
  const rel = "/" + relative(PUBLIC_DIR, abs).replace(/\\/g, "/");

  assets[rel] = sri;
  console.log(`[SRI] ${rel.padEnd(42)} → ${sri.slice(0, 30)}...`);
}

// ─── Write manifest ───────────────────────────────────────────────────────────

const manifest = {
  generated: new Date().toISOString(),
  algorithm: "sha384",
  assets,
};

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");

const count = Object.keys(assets).length;
console.log(
  `[SRI] Manifest written to public/wasm-hashes.json (${count} entr${count === 1 ? "y" : "ies"})`
);
