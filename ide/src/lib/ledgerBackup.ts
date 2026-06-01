import { z } from "zod";

import type { MockLedgerState } from "@/store/workspaceStore";

export const LEDGER_BACKUP_VERSION = 1 as const;

const mockLedgerEntrySchema = z.object({
  id: z.string().min(1),
  type: z.enum(["account", "contractData", "tokenBalance"]),
  key: z.string(),
  value: z.string(),
  metadata: z.record(z.string()).optional(),
});

const ledgerBackupSchema = z.object({
  version: z.literal(LEDGER_BACKUP_VERSION),
  exportedAt: z.string().datetime(),
  mockLedgerState: z.object({
    entries: z.array(mockLedgerEntrySchema),
  }),
});

export type LedgerBackupPayload = z.infer<typeof ledgerBackupSchema>;

export function exportLedgerBackup(state: MockLedgerState): string {
  const payload: LedgerBackupPayload = {
    version: LEDGER_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    mockLedgerState: state,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseLedgerBackup(
  json: string,
): { state: MockLedgerState; exportedAt: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Ledger backup file is not valid JSON.");
  }

  const result = ledgerBackupSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Ledger backup schema validation failed: ${detail}`);
  }

  return {
    state: result.data.mockLedgerState,
    exportedAt: result.data.exportedAt,
  };
}

export function downloadLedgerBackup(
  state: MockLedgerState,
  filename = "ledger-backup.json",
): void {
  const blob = new Blob([exportLedgerBackup(state)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
