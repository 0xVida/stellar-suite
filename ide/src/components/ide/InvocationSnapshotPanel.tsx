"use client";

/**
 * InvocationSnapshotPanel.tsx
 * UI for automated snapshot verification of contract invocations — Issue #840
 */

import { useState, useEffect, useCallback } from "react";
import {
  Camera,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { interactionRecorder, type RecordingSession } from "@/lib/testing/interactionRecorder";
import {
  recordSessionSnapshots,
  verifySessionAgainstSnapshots,
  getSessionsWithSnapshots,
  clearSessionSnapshots,
  type SessionVerificationReport,
  type VerificationResult,
} from "@/lib/testing/invocationSnapshotVerifier";

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({ result }: { result: VerificationResult }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiffs = result.diffs && result.diffs.length > 0;

  return (
    <div className="rounded border border-border bg-card/30 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {result.error ? (
          <AlertCircle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
        ) : result.passed ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        )}
        <span className="flex-1 text-[11px] font-mono truncate">
          {result.functionName}({result.args})
        </span>
        <span className="text-[9px] font-mono text-muted-foreground shrink-0">
          {result.contractId.slice(0, 8)}…
        </span>
        {(hasDiffs || result.error) &&
          (expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          ))}
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1.5 border-t border-border/50">
          {result.error && (
            <p className="text-[10px] text-yellow-400 font-mono mt-1.5">{result.error}</p>
          )}
          {hasDiffs &&
            result.diffs!.map((diff, i) => (
              <div key={i} className="text-[10px] font-mono space-y-0.5 mt-1.5">
                <p className="text-muted-foreground uppercase tracking-wider text-[9px]">
                  {diff.type} @ {diff.path}
                </p>
                <p className="text-emerald-400">
                  expected: {JSON.stringify(diff.oldValue)}
                </p>
                <p className="text-destructive">
                  received: {JSON.stringify(diff.newValue)}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Report summary ───────────────────────────────────────────────────────────

function ReportSummary({ report }: { report: SessionVerificationReport }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground truncate">
          {report.sessionName}
        </span>
        <span className="text-[9px] text-muted-foreground shrink-0">
          {new Date(report.ranAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="flex gap-3 text-[10px]">
        <span className="text-emerald-400">{report.passed} passed</span>
        <span className="text-destructive">{report.failed} failed</span>
        {report.errors > 0 && (
          <span className="text-yellow-400">{report.errors} errors</span>
        )}
        <span className="text-muted-foreground ml-auto">
          {report.totalInteractions} total
        </span>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {report.results.map((r) => (
          <ResultRow key={r.interactionId} result={r} />
        ))}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function InvocationSnapshotPanel() {
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [baselineSessions, setBaselineSessions] = useState<string[]>([]);
  const [selectedBaseline, setSelectedBaseline] = useState<string>("");
  const [selectedReplay, setSelectedReplay] = useState<string>("");
  const [report, setReport] = useState<SessionVerificationReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const refresh = useCallback(async () => {
    const [allSessions, withSnapshots] = await Promise.all([
      interactionRecorder.getAllSessions(),
      getSessionsWithSnapshots(),
    ]);
    setSessions(allSessions);
    setBaselineSessions(withSnapshots);
    setIsRecording(interactionRecorder.getRecordingStatus());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRecordBaseline = async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    try {
      const count = await recordSessionSnapshots(session);
      toast.success(`Recorded ${count} snapshot(s) as baseline`);
      await refresh();
    } catch (err) {
      toast.error(`Failed to record baseline: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRunVerification = async () => {
    if (!selectedBaseline || !selectedReplay) {
      toast.error("Select both a baseline and a replay session");
      return;
    }
    const replaySession = sessions.find((s) => s.id === selectedReplay);
    if (!replaySession) return;

    setIsRunning(true);
    try {
      const result = await verifySessionAgainstSnapshots(replaySession, selectedBaseline);
      setReport(result);
      if (result.failed === 0 && result.errors === 0) {
        toast.success(`All ${result.passed} invocations matched snapshots`);
      } else {
        toast.error(`${result.failed} mismatch(es), ${result.errors} error(s)`);
      }
    } catch (err) {
      toast.error(`Verification failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleClearBaseline = async (sessionId: string) => {
    await clearSessionSnapshots(sessionId);
    toast.success("Baseline snapshots cleared");
    await refresh();
  };

  return (
    <div className="flex h-full flex-col bg-sidebar overflow-hidden" data-testid="invocation-snapshot-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Snapshot Verification</span>
        </div>
        <button
          onClick={refresh}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Refresh sessions"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Baseline section */}
        <div className="space-y-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Baseline Session
          </p>
          <p className="text-[9px] text-muted-foreground">
            Record a golden session as the expected output baseline.
          </p>
          <select
            value={selectedBaseline}
            onChange={(e) => setSelectedBaseline(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Select baseline session"
          >
            <option value="">— select session —</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {baselineSessions.includes(s.id) ? " ✓" : ""}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <button
              onClick={() => selectedBaseline && handleRecordBaseline(selectedBaseline)}
              disabled={!selectedBaseline}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 rounded py-1.5 text-[10px] font-medium transition-colors",
                selectedBaseline
                  ? "bg-primary/15 text-primary hover:bg-primary/25"
                  : "bg-muted/20 text-muted-foreground cursor-not-allowed"
              )}
              data-testid="record-baseline-btn"
            >
              <Camera className="h-3 w-3" />
              Record as Baseline
            </button>
            {selectedBaseline && baselineSessions.includes(selectedBaseline) && (
              <button
                onClick={() => handleClearBaseline(selectedBaseline)}
                className="rounded px-2 py-1.5 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Clear baseline"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Replay section */}
        <div className="space-y-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Replay Session
          </p>
          <p className="text-[9px] text-muted-foreground">
            Select a session to verify against the baseline.
          </p>
          <select
            value={selectedReplay}
            onChange={(e) => setSelectedReplay(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Select replay session"
          >
            <option value="">— select session —</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleRunVerification}
            disabled={!selectedBaseline || !selectedReplay || isRunning}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 rounded py-1.5 text-[10px] font-bold transition-colors",
              selectedBaseline && selectedReplay && !isRunning
                ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                : "bg-muted/20 text-muted-foreground cursor-not-allowed"
            )}
            data-testid="run-verification-btn"
          >
            {isRunning ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {isRunning ? "Verifying…" : "Run Verification"}
          </button>
        </div>

        {/* Report */}
        {report && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Last Report
            </p>
            <ReportSummary report={report} />
          </div>
        )}

        {/* Empty state */}
        {sessions.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic text-center py-4">
            No recorded sessions found. Use the Interaction Recorder to capture invocations.
          </p>
        )}
      </div>

      <div className="border-t border-sidebar-border px-3 py-2 text-[9px] text-muted-foreground">
        Record a golden session, then replay to verify contract outputs haven&apos;t changed.
      </div>
    </div>
  );
}
