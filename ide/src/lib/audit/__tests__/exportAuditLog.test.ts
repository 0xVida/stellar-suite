import { describe, it, expect } from "vitest";
import {
  AUDIT_EXPORT_VERSION,
  buildAuditExport,
  canonicalizeLogs,
  signPayload,
} from "../exportAuditLog";
import type { AuditLogEntry } from "@/store/useAuditLogStore";

const sampleLogs: AuditLogEntry[] = [
  {
    id: "log-1",
    timestamp: "2026-04-24T12:00:00.000Z",
    category: "deploy",
    action: "contract.deploy",
    status: "success",
    user: "dev@example.com",
    params: { network: "testnet" },
    details: "Deployed contract ABC",
    rawJson: { txHash: "0xabc" },
  },
  {
    id: "log-2",
    timestamp: "2026-04-24T12:05:00.000Z",
    category: "build",
    action: "build.contract",
    status: "failure",
    user: "dev@example.com",
    params: { target: "wasm" },
    details: "Build failed: missing crate",
    rawJson: {},
  },
];

describe("exportAuditLog", () => {
  it("produces a signed JSON envelope with deterministic signature", async () => {
    const result = await buildAuditExport(sampleLogs, {
      format: "json",
      signingKey: "shared-secret",
      generatedAt: new Date("2026-04-24T13:00:00.000Z"),
    });

    expect(result.filename).toBe("audit-log-2026-04-24T13-00-00-000Z.json");
    expect(result.mimeType).toBe("application/json");
    expect(result.count).toBe(2);
    expect(result.signature).toMatch(/^[0-9a-f]{64}$/);

    const parsed = JSON.parse(result.body);
    expect(parsed.version).toBe(AUDIT_EXPORT_VERSION);
    expect(parsed.signature).toEqual({
      algorithm: "HMAC-SHA-256",
      digest: result.signature,
    });
    expect(parsed.count).toBe(2);
    expect(parsed.payload).toHaveLength(2);

    // Signature must match the canonical serialization of the payload.
    const expected = await signPayload(
      canonicalizeLogs(sampleLogs),
      "shared-secret",
    );
    expect(parsed.signature.digest).toBe(expected);
  });

  it("produces an unsigned JSON envelope when no key is provided", async () => {
    const result = await buildAuditExport(sampleLogs, { format: "json" });
    const parsed = JSON.parse(result.body);
    expect(parsed.signature).toBeNull();
    expect(result.signature).toBeNull();
  });

  it("emits a CSV with comment header and standard rows", async () => {
    const result = await buildAuditExport(sampleLogs, {
      format: "csv",
      signingKey: "shared-secret",
      generatedAt: new Date("2026-04-24T13:00:00.000Z"),
    });
    expect(result.filename.endsWith(".csv")).toBe(true);
    expect(result.mimeType).toBe("text/csv");

    const lines = result.body.split("\r\n");
    expect(lines[0]).toBe(`# audit-log-export version=${AUDIT_EXPORT_VERSION}`);
    expect(lines.some((l) => l.startsWith("# signature-algorithm="))).toBe(true);
    expect(lines.some((l) => l.startsWith("# signature-digest="))).toBe(true);

    const headerIdx = lines.findIndex((l) => l.startsWith("id,"));
    expect(headerIdx).toBeGreaterThan(0);
    expect(lines[headerIdx]).toContain("timestamp");
    expect(lines[headerIdx]).toContain("rawJson");
    expect(lines.length).toBe(headerIdx + 1 + sampleLogs.length);
  });

  it("escapes CSV cells that contain commas, quotes, or newlines", async () => {
    const tricky: AuditLogEntry[] = [
      {
        id: "log-x",
        timestamp: "2026-04-24T12:00:00.000Z",
        category: "settings",
        action: 'set,"flag"',
        status: "success",
        user: "dev@example.com",
        params: {},
        details: "line1\nline2",
        rawJson: {},
      },
    ];
    const result = await buildAuditExport(tricky, { format: "csv" });
    // A cell containing a quote is wrapped and the quote is doubled.
    expect(result.body).toContain('"set,""flag"""');
    // A cell containing a newline is wrapped in quotes.
    expect(result.body).toContain('"line1\nline2"');
  });

  it("rejects signing with an empty key", async () => {
    await expect(signPayload("payload", "")).rejects.toThrow();
  });

  it("produces a different signature when any entry changes (tamper-evident)", async () => {
    const a = await buildAuditExport(sampleLogs, {
      format: "json",
      signingKey: "k",
      generatedAt: new Date("2026-04-24T13:00:00.000Z"),
    });
    const mutated = sampleLogs.map((e) =>
      e.id === "log-1" ? { ...e, details: "tampered" } : e,
    );
    const b = await buildAuditExport(mutated, {
      format: "json",
      signingKey: "k",
      generatedAt: new Date("2026-04-24T13:00:00.000Z"),
    });
    expect(a.signature).not.toBe(b.signature);
  });
});
