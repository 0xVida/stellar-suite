"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Download, FileJson, FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AuditExportFormat,
  buildAuditExport,
  downloadAuditExport,
} from "@/lib/audit/exportAuditLog";
import { useAuditLogStore } from "@/store/useAuditLogStore";

function formatIso(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AuditExporter() {
  const logs = useAuditLogStore((s) => s.logs);
  const [format, setFormat] = useState<AuditExportFormat>("json");
  const [signingKey, setSigningKey] = useState("");
  const [signEnabled, setSignEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSignature, setLastSignature] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (logs.length === 0) {
      return { count: 0, earliest: null as string | null, latest: null as string | null };
    }
    const sorted = [...logs].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    return {
      count: logs.length,
      earliest: sorted[0]!.timestamp,
      latest: sorted[sorted.length - 1]!.timestamp,
    };
  }, [logs]);

  const canExport = logs.length > 0 && !busy;
  const signatureReady = signEnabled && signingKey.trim().length > 0;

  const handleExport = async () => {
    if (logs.length === 0) {
      toast.error("No audit log entries to export");
      return;
    }
    if (signEnabled && !signingKey.trim()) {
      toast.error("Signing key is required when signing is enabled");
      return;
    }
    setBusy(true);
    setLastSignature(null);
    try {
      const result = await buildAuditExport(logs, {
        format,
        signingKey: signEnabled ? signingKey.trim() : undefined,
      });
      downloadAuditExport(result);
      setLastSignature(result.signature);
      toast.success(
        result.signature
          ? `Exported ${result.count} entries with HMAC signature`
          : `Exported ${result.count} entries`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Audit log export failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold">Audit log export</h3>
          <p className="text-sm text-muted-foreground">
            Download the local audit log for compliance review. Optionally sign
            the file with HMAC-SHA-256 so reviewers can verify it has not been
            altered.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-md border border-border bg-background p-3">
          <div className="text-xs uppercase text-muted-foreground">Entries</div>
          <div className="text-lg font-semibold">{summary.count}</div>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <div className="text-xs uppercase text-muted-foreground">Earliest</div>
          <div className="font-mono text-xs">
            {summary.earliest ? formatIso(summary.earliest) : "—"}
          </div>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <div className="text-xs uppercase text-muted-foreground">Latest</div>
          <div className="font-mono text-xs">
            {summary.latest ? formatIso(summary.latest) : "—"}
          </div>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Format</legend>
        <div className="flex flex-wrap gap-2">
          <FormatButton
            active={format === "json"}
            onClick={() => setFormat("json")}
            icon={<FileJson className="h-4 w-4" />}
            label="JSON (envelope)"
          />
          <FormatButton
            active={format === "csv"}
            onClick={() => setFormat("csv")}
            icon={<FileText className="h-4 w-4" />}
            label="CSV (comment header)"
          />
        </div>
      </fieldset>

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={signEnabled}
            onChange={(e) => setSignEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          Sign file (HMAC-SHA-256)
        </label>
        {signEnabled ? (
          <div className="space-y-2">
            <Label htmlFor="audit-signing-key" className="text-xs text-muted-foreground">
              Signing secret (not persisted — copy it to verify later)
            </Label>
            <Input
              id="audit-signing-key"
              type="password"
              value={signingKey}
              onChange={(e) => setSigningKey(e.target.value)}
              placeholder="e.g. team-rotating-secret"
              autoComplete="off"
            />
            {!signatureReady && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                Enter a secret to enable signing.
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Unsigned exports are fine for personal records. Enable signing for
            compliance trails where tamper-evidence matters.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {lastSignature && (
            <div className="truncate text-xs text-muted-foreground">
              Last signature:{" "}
              <span className="font-mono text-foreground">{lastSignature}</span>
            </div>
          )}
        </div>
        <Button onClick={handleExport} disabled={!canExport}>
          <Download className="mr-2 h-4 w-4" />
          {busy ? "Exporting…" : "Download export"}
        </Button>
      </div>
    </div>
  );
}

interface FormatButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function FormatButton({ active, onClick, icon, label }: FormatButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors " +
        (active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:text-foreground")
      }
    >
      {icon}
      {label}
    </button>
  );
}

export default AuditExporter;
