/**
 * Export utilities for the local AuditLogStore.
 *
 * Produces either JSON or CSV, optionally accompanied by an HMAC-SHA-256
 * signature so a consumer can detect tampering. Signing uses the Web Crypto
 * SubtleCrypto API — no external dependencies.
 *
 * Verification (in JS):
 *   const sig = await signPayload(canonicalPayload, secret);
 *   assert(sig === envelope.signature.digest);
 *
 * Verification (CLI-friendly, JSON export):
 *   cat audit.json | jq -r '.payload | @json' | openssl dgst -sha256 -hmac "<secret>"
 */

import type { AuditLogEntry } from "@/store/useAuditLogStore";

export const AUDIT_EXPORT_VERSION = "1";

export type AuditExportFormat = "json" | "csv";

export interface AuditExportOptions {
  format: AuditExportFormat;
  signingKey?: string;
  generatedAt?: Date;
}

export interface AuditExportResult {
  filename: string;
  mimeType: string;
  body: string;
  signature: string | null;
  count: number;
  generatedAt: string;
}

interface SignedEnvelope {
  version: string;
  format: AuditExportFormat;
  exportedAt: string;
  count: number;
  payload: AuditLogEntry[];
  signature: {
    algorithm: "HMAC-SHA-256";
    digest: string;
  } | null;
}

const CSV_COLUMNS: (keyof AuditLogEntry)[] = [
  "id",
  "timestamp",
  "category",
  "action",
  "status",
  "user",
  "details",
  "params",
  "rawJson",
];

/**
 * Canonical serialization of log entries. Stable key order so the HMAC digest
 * is reproducible across browsers and tooling.
 */
export function canonicalizeLogs(logs: AuditLogEntry[]): string {
  return JSON.stringify(logs.map(canonicalEntry));
}

function canonicalEntry(entry: AuditLogEntry): Record<string, unknown> {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    category: entry.category,
    action: entry.action,
    status: entry.status,
    user: entry.user,
    details: entry.details,
    params: entry.params,
    rawJson: entry.rawJson,
  };
}

function escapeCsvCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function renderCsv(logs: AuditLogEntry[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = logs.map((entry) =>
    CSV_COLUMNS.map((col) => escapeCsvCell(entry[col])).join(","),
  );
  return [header, ...rows].join("\r\n");
}

export async function signPayload(
  payload: string,
  secret: string,
): Promise<string> {
  if (!secret) {
    throw new Error("signPayload requires a non-empty secret");
  }
  const subtle =
    typeof globalThis !== "undefined" && globalThis.crypto?.subtle
      ? globalThis.crypto.subtle
      : null;
  if (!subtle) {
    throw new Error(
      "SubtleCrypto is not available — audit log signing requires a secure context",
    );
  }
  const encoder = new TextEncoder();
  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await subtle.sign("HMAC", key, encoder.encode(payload));
  return bufferToHex(sig);
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function formatFilename(format: AuditExportFormat, generatedAt: Date): string {
  const stamp = generatedAt.toISOString().replace(/[:.]/g, "-");
  return `audit-log-${stamp}.${format}`;
}

export async function buildAuditExport(
  logs: AuditLogEntry[],
  options: AuditExportOptions,
): Promise<AuditExportResult> {
  const generatedAt = options.generatedAt ?? new Date();
  const generatedAtIso = generatedAt.toISOString();
  const canonical = canonicalizeLogs(logs);
  const signature = options.signingKey
    ? await signPayload(canonical, options.signingKey)
    : null;

  if (options.format === "json") {
    const envelope: SignedEnvelope = {
      version: AUDIT_EXPORT_VERSION,
      format: "json",
      exportedAt: generatedAtIso,
      count: logs.length,
      payload: logs.map(canonicalEntry) as unknown as AuditLogEntry[],
      signature: signature
        ? { algorithm: "HMAC-SHA-256", digest: signature }
        : null,
    };
    return {
      filename: formatFilename("json", generatedAt),
      mimeType: "application/json",
      body: JSON.stringify(envelope, null, 2),
      signature,
      count: logs.length,
      generatedAt: generatedAtIso,
    };
  }

  // CSV: metadata + optional signature live in a comment-prefixed header
  // block so the file still parses as standard CSV once the comment lines
  // are stripped.
  const headerLines = [
    `# audit-log-export version=${AUDIT_EXPORT_VERSION}`,
    `# exported-at=${generatedAtIso}`,
    `# count=${logs.length}`,
  ];
  if (signature) {
    headerLines.push(`# signature-algorithm=HMAC-SHA-256`);
    headerLines.push(`# signature-digest=${signature}`);
  }
  const csv = renderCsv(logs);
  return {
    filename: formatFilename("csv", generatedAt),
    mimeType: "text/csv",
    body: `${headerLines.join("\r\n")}\r\n${csv}`,
    signature,
    count: logs.length,
    generatedAt: generatedAtIso,
  };
}

/**
 * Trigger a browser download for an export result. Returns a teardown
 * function that releases the object URL.
 */
export function downloadAuditExport(result: AuditExportResult): () => void {
  const blob = new Blob([result.body], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return () => URL.revokeObjectURL(url);
}
