"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  downloadLedgerBackup,
  exportLedgerBackup,
  parseLedgerBackup,
} from "@/lib/ledgerBackup";
import { useWorkspaceStore } from "@/store/workspaceStore";

export function LedgerBackup() {
  const mockLedgerState = useWorkspaceStore((s) => s.mockLedgerState);
  const setMockLedgerState = useWorkspaceStore((s) => s.setMockLedgerState);
  const clearMockLedgerState = useWorkspaceStore((s) => s.clearMockLedgerState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);

  const handleExport = () => {
    try {
      downloadLedgerBackup(mockLedgerState);
      setLastExportedAt(new Date().toISOString());
      toast.success(`Exported ${mockLedgerState.entries.length} ledger entries`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(exportLedgerBackup(mockLedgerState));
      toast.success("Ledger backup JSON copied to clipboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Copy failed");
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const { state, exportedAt } = parseLedgerBackup(text);
      setMockLedgerState(state);
      setLastExportedAt(exportedAt);
      toast.success(`Restored ${state.entries.length} ledger entries`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    }
  };

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Simulated Ledger Backup
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {mockLedgerState.entries.length} entr
            {mockLedgerState.entries.length === 1 ? "y" : "ies"} in memory
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            onClick={handleExport}
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3 w-3 mr-1" />
            Import
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImportFile(file);
          event.target.value = "";
        }}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 flex-1 text-[10px]"
          onClick={() => void handleCopyJson()}
        >
          Copy JSON
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 flex-1 text-[10px] text-destructive hover:text-destructive"
          onClick={() => {
            clearMockLedgerState();
            toast.message("Cleared simulated ledger state");
          }}
          disabled={mockLedgerState.entries.length === 0}
        >
          Clear
        </Button>
      </div>

      {lastExportedAt && (
        <p className="text-[10px] font-mono text-muted-foreground">
          Last backup: {new Date(lastExportedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
