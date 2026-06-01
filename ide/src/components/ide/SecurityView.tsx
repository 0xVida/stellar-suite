import { useMemo, useState } from "react";
import { Bug, Loader2, RefreshCcw, ShieldAlert, Sparkles, Wrench, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SSHKeyManager } from "@/components/settings/SSHKeyManager";
import type { CargoAuditFinding } from "@/utils/cargoAuditParser";
import type { ClippyCategory, ClippyLint } from "@/utils/clippyParser";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { checkUpgradeCompatibility, parseSpecFromFile, type UpgradeCompatibilityResult } from "@/lib/audit/contractUpgradeabilityChecker";
import { toast } from "sonner";

interface SecurityViewProps {
  clippyLints: ClippyLint[];
  clippyRunning: boolean;
  clippyError: string | null;
  onRunClippy: () => void;
  onApplyClippyFix: (lint: ClippyLint) => void;
  auditFindings: CargoAuditFinding[];
  auditRunning: boolean;
  auditError: string | null;
  onRunAudit: () => void;
  lastClippyRunAt?: string | null;
  lastAuditRunAt?: string | null;
}

const categoryLabel: Record<ClippyCategory, string> = {
  style: "Style",
  correctness: "Correctness",
  performance: "Performance",
};

const severityClass = {
  critical: "text-red-300 border-red-500/40 bg-red-500/10",
  high: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  medium: "text-yellow-200 border-yellow-500/40 bg-yellow-500/10",
  low: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  unknown: "text-muted-foreground border-border bg-muted/30",
};

export function SecurityView({
  clippyLints,
  clippyRunning,
  clippyError,
  onRunClippy,
  onApplyClippyFix,
  auditFindings,
  auditRunning,
  auditError,
  onRunAudit,
  lastClippyRunAt,
  lastAuditRunAt,
}: SecurityViewProps) {
  const { files } = useWorkspaceStore();
  const [selectedBaseFile, setSelectedBaseFile] = useState("");
  const [selectedUpgradeFile, setSelectedUpgradeFile] = useState("");
  const [upgradeCheckResult, setUpgradeCheckResult] = useState<UpgradeCompatibilityResult | null>(null);
  const [upgradeCheckRun, setUpgradeCheckRun] = useState(false);

  // Recursively find all files that look like contract specs/WASM
  const specFiles = useMemo(() => {
    const list: { name: string; path: string; content: string }[] = [];
    const traverse = (nodes: any[], currentPath: string[] = []) => {
      if (!nodes) return;
      for (const node of nodes) {
        const nextPath = [...currentPath, node.name];
        if (node.type === "folder" && node.children) {
          traverse(node.children, nextPath);
        } else if (node.type === "file") {
          const name = node.name.toLowerCase();
          if (name.endsWith(".wasm") || name.endsWith(".json")) {
            list.push({
              name: node.name,
              path: nextPath.join("/"),
              content: node.content || "",
            });
          }
        }
      }
    };
    traverse(files);
    return list;
  }, [files]);

  const handleRunUpgradeCheck = () => {
    const baseFile = specFiles.find((f) => f.path === selectedBaseFile);
    const upgradeFile = specFiles.find((f) => f.path === selectedUpgradeFile);

    if (!baseFile || !upgradeFile) {
      toast.error("Please select both a base contract and an upgrade contract version.");
      return;
    }

    try {
      const oldSpec = parseSpecFromFile(baseFile.name, baseFile.content);
      const newSpec = parseSpecFromFile(upgradeFile.name, upgradeFile.content);

      const result = checkUpgradeCompatibility(oldSpec, newSpec);
      setUpgradeCheckResult(result);
      setUpgradeCheckRun(true);
      if (result.success) {
        toast.success("Upgrade Check Passed! Storage layouts are compatible.");
      } else {
        toast.error("Upgrade Check Failed! Incompatibilities detected.");
      }
    } catch (err: any) {
      toast.error(`Check failed: ${err.message}`);
    }
  };

  const lintGroups = useMemo(() => {
    const buckets: Record<ClippyCategory, ClippyLint[]> = {
      style: [],
      correctness: [],
      performance: [],
    };

    for (const lint of clippyLints) {
      buckets[lint.category].push(lint);
    }

    return buckets;
  }, [clippyLints]);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="border-b border-sidebar-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Security & Quality
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <SSHKeyManager />

        <section className="space-y-2 rounded-md border border-border bg-card/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Clippy Lints
            </div>
            <Button type="button" size="sm" className="h-7 text-[10px]" onClick={onRunClippy} disabled={clippyRunning}>
              {clippyRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCcw className="mr-1 h-3 w-3" />}
              Run Clippy
            </Button>
          </div>

          {lastClippyRunAt ? <p className="text-[10px] text-muted-foreground">Last run: {lastClippyRunAt}</p> : null}
          {clippyError ? <p className="text-[10px] text-destructive">{clippyError}</p> : null}

          {clippyLints.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No clippy findings yet.</p>
          ) : (
            <div className="space-y-2">
              {(Object.keys(lintGroups) as ClippyCategory[]).map((category) => {
                const items = lintGroups[category];
                if (items.length === 0) {
                  return null;
                }

                return (
                  <div key={category} className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {categoryLabel[category]} ({items.length})
                    </div>
                    {items.map((lint) => (
                      <div key={lint.id} className="rounded border border-border bg-background/60 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] text-foreground">{lint.title}</p>
                            <p className="truncate font-mono text-[10px] text-muted-foreground">
                              {lint.code} · {lint.fileId}:{lint.line}:{lint.column}
                            </p>
                          </div>
                          {lint.autoFix ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 shrink-0 gap-1 px-2 text-[10px]"
                              onClick={() => onApplyClippyFix(lint)}
                            >
                              <Wrench className="h-3 w-3" />
                              Auto-Fix
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-2 rounded-md border border-border bg-card/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
              <ShieldAlert className="h-3.5 w-3.5 text-primary" />
              Dependency Audit
            </div>
            <Button type="button" size="sm" className="h-7 text-[10px]" onClick={onRunAudit} disabled={auditRunning}>
              {auditRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Bug className="mr-1 h-3 w-3" />}
              Run Audit
            </Button>
          </div>

          {lastAuditRunAt ? <p className="text-[10px] text-muted-foreground">Last run: {lastAuditRunAt}</p> : null}
          {auditError ? <p className="text-[10px] text-destructive">{auditError}</p> : null}

          {auditFindings.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No vulnerability findings yet.</p>
          ) : (
            <div className="space-y-2">
              {auditFindings.map((finding) => (
                <article key={finding.id} className="rounded border border-border bg-background/60 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-foreground">{finding.advisoryId}</p>
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] uppercase ${severityClass[finding.severity]}`}>
                      {finding.severity}
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground">{finding.title}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {finding.packageName} {finding.packageVersion}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{finding.recommendation}</p>
                  {finding.url ? (
                    <a
                      href={finding.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-[10px] text-primary underline underline-offset-2"
                    >
                      Advisory Details
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-md border border-border bg-card/60 p-3">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
              <ShieldAlert className="h-3.5 w-3.5 text-primary" />
              Upgrade Compatibility Checker
            </div>
            <Button
              type="button"
              size="sm"
              className="h-7 text-[10px]"
              onClick={handleRunUpgradeCheck}
              disabled={!selectedBaseFile || !selectedUpgradeFile}
            >
              <Play className="mr-1 h-3 w-3" />
              Check Upgrade
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground leading-normal">
            Validate that a new contract version's storage layout and public function signatures are backward-compatible with an older version before deploying.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase">Base Version</label>
              <select
                value={selectedBaseFile}
                onChange={(e) => setSelectedBaseFile(e.target.value)}
                className="w-full bg-background border border-border rounded p-1 text-[11px] text-foreground focus:outline-none"
              >
                <option value="">Select base spec...</option>
                {specFiles.map((f) => (
                  <option key={f.path} value={f.path}>{f.path}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground font-semibold uppercase">New Version</label>
              <select
                value={selectedUpgradeFile}
                onChange={(e) => setSelectedUpgradeFile(e.target.value)}
                className="w-full bg-background border border-border rounded p-1 text-[11px] text-foreground focus:outline-none"
              >
                <option value="">Select upgrade spec...</option>
                {specFiles.map((f) => (
                  <option key={f.path} value={f.path}>{f.path}</option>
                ))}
              </select>
            </div>
          </div>

          {upgradeCheckRun && upgradeCheckResult && (
            <div className="space-y-2 pt-2 border-t border-border/40">
              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                {upgradeCheckResult.success ? (
                  <span className="text-emerald-500 flex items-center gap-1">✓ Compatible</span>
                ) : (
                  <span className="text-red-500 flex items-center gap-1">✗ Incompatible layout</span>
                )}
                <span className="text-muted-foreground font-normal">
                  ({upgradeCheckResult.findings.length} findings)
                </span>
              </div>

              {upgradeCheckResult.findings.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic">No layout or signature changes detected.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {upgradeCheckResult.findings.map((f, i) => (
                    <div
                      key={i}
                      className={`p-2 rounded border text-[10px] ${
                        f.type === "error"
                          ? "bg-red-500/10 border-red-500/20 text-red-300"
                          : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                      }`}
                    >
                      <div className="font-bold font-mono text-[9px] mb-0.5 uppercase">
                        {f.type}: {f.path}
                      </div>
                      <div>{f.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
