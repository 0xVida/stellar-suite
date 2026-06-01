import { describe, expect, it } from "vitest";

import {
  exportLedgerBackup,
  LEDGER_BACKUP_VERSION,
  parseLedgerBackup,
} from "@/lib/ledgerBackup";

describe("ledgerBackup", () => {
  const sampleState = {
    entries: [
      {
        id: "entry-1",
        type: "contractData" as const,
        key: "balance",
        value: "1000",
      },
    ],
  };

  it("exports and parses a valid backup", () => {
    const json = exportLedgerBackup(sampleState);
    const parsed = parseLedgerBackup(json);

    expect(parsed.state).toEqual(sampleState);
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects invalid schema", () => {
    expect(() =>
      parseLedgerBackup(
        JSON.stringify({
          version: LEDGER_BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          mockLedgerState: { entries: [{ id: "", type: "bad", key: "", value: "" }] },
        }),
      ),
    ).toThrow(/schema validation failed/i);
  });
});
