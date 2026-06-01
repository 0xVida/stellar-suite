"use client";

/**
 * WasmDebuggerPanel.tsx
 * UI panel for Soroban WASM Breakpoint Debugging (Browser) — Issue #833
 *
 * Provides a debugger overlay that integrates with WasmDebugger to let
 * developers set breakpoints, step through execution, and inspect locals/globals.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bug,
  Play,
  Square,
  StepForward,
  SkipForward,
  Trash2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  AlertTriangle,
  Upload,
} from "lucide-react";

import {
  WasmDebugger,
  type DebuggerState,
  type PauseFrame,
  type ResolvedBreakpoint,
} from "@/lib/debug/WasmDebugger";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BreakpointEntry {
  sourceFile: string;
  sourceLine: number;
  enabled: boolean;
  resolved: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors border-b border-sidebar-border"
    >
      {expanded ? (
        <ChevronDown className="h-3 w-3 shrink-0" />
      ) : (
        <ChevronRight className="h-3 w-3 shrink-0" />
      )}
      {label}
    </button>
  );
}

function StateBadge({ state }: { state: DebuggerState }) {
  const colors: Record<DebuggerState, string> = {
    idle: "bg-muted text-muted-foreground",
    loaded: "bg-blue-500/15 text-blue-400",
    running: "bg-emerald-500/15 text-emerald-400",
    paused: "bg-amber-500/15 text-amber-400",
    stepping: "bg-primary/15 text-primary",
    terminated: "bg-muted text-muted-foreground",
    error: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
        colors[state]
      )}
    >
      {state}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WasmDebuggerPanel() {
  const [debuggerState, setDebuggerState] = useState<DebuggerState>("idle");
  const [pauseFrame, setPauseFrame] = useState<PauseFrame | null>(null);
  const [breakpoints, setBreakpoints] = useState<BreakpointEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [wasmFileName, setWasmFileName] = useState<string | null>(null);

  // Collapsible sections
  const [showBreakpoints, setShowBreakpoints] = useState(true);
  const [showLocals, setShowLocals] = useState(true);
  const [showCallStack, setShowCallStack] = useState(true);
  const [showGlobals, setShowGlobals] = useState(false);

  // New breakpoint form
  const [bpFile, setBpFile] = useState("src/lib.rs");
  const [bpLine, setBpLine] = useState("1");

  const dbgRef = useRef<WasmDebugger | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Wire up debugger events ──────────────────────────────────────────────
  const attachListeners = useCallback((dbg: WasmDebugger) => {
    dbg.on<null>("started", () => setDebuggerState("running"));
    dbg.on<PauseFrame>("paused", (frame) => {
      setDebuggerState("paused");
      setPauseFrame(frame);
    });
    dbg.on<null>("resumed", () => {
      setDebuggerState("running");
      setPauseFrame(null);
    });
    dbg.on<null>("stepped", () => setDebuggerState("stepping"));
    dbg.on<null>("terminated", () => {
      setDebuggerState("terminated");
    });
    dbg.on<ResolvedBreakpoint>("breakpointResolved", (bp) => {
      setBreakpoints((prev) =>
        prev.map((b) =>
          b.sourceFile === bp.sourceFile && b.sourceLine === bp.sourceLine
            ? { ...b, resolved: bp.wasmOffset !== null }
            : b
        )
      );
    });
    dbg.on<Error>("error", (err) => {
      setError(err?.message ?? "Unknown debugger error");
      setDebuggerState("error");
    });
  }, []);

  // ── Load WASM file ────────────────────────────────────────────────────────
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);
      setWasmFileName(file.name);
      setDebuggerState("idle");
      setPauseFrame(null);

      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const dbg = await WasmDebugger.load(bytes);
        attachListeners(dbg);
        dbgRef.current = dbg;
        setDebuggerState("loaded");

        // Re-register any existing breakpoints
        setBreakpoints((prev) => {
          for (const bp of prev) {
            const resolved = dbg.setBreakpoint(bp.sourceFile, bp.sourceLine);
            if (!bp.enabled) dbg.toggleBreakpoint(bp.sourceFile, bp.sourceLine, false);
            return prev.map((b) =>
              b.sourceFile === bp.sourceFile && b.sourceLine === bp.sourceLine
                ? { ...b, resolved: resolved.wasmOffset !== null }
                : b
            );
          }
          return prev;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load WASM");
        setDebuggerState("error");
      }
    },
    [attachListeners]
  );

  // ── Controls ──────────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    const dbg = dbgRef.current;
    if (!dbg) return;
    setError(null);
    try {
      await dbg.run();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
      setDebuggerState("error");
    }
  }, []);

  const handleResume = useCallback(() => {
    dbgRef.current?.resume();
  }, []);

  const handleStepOver = useCallback(async () => {
    await dbgRef.current?.stepOver();
  }, []);

  const handleTerminate = useCallback(() => {
    dbgRef.current?.terminate();
  }, []);

  // ── Breakpoint management ─────────────────────────────────────────────────
  const handleAddBreakpoint = useCallback(() => {
    const line = parseInt(bpLine, 10);
    if (!bpFile.trim() || isNaN(line) || line < 1) return;

    const dbg = dbgRef.current;
    let resolved = false;
    if (dbg) {
      const bp = dbg.setBreakpoint(bpFile.trim(), line);
      resolved = bp.wasmOffset !== null;
    }

    setBreakpoints((prev) => {
      const exists = prev.some(
        (b) => b.sourceFile === bpFile.trim() && b.sourceLine === line
      );
      if (exists) return prev;
      return [...prev, { sourceFile: bpFile.trim(), sourceLine: line, enabled: true, resolved }];
    });
  }, [bpFile, bpLine]);

  const handleRemoveBreakpoint = useCallback((sourceFile: string, sourceLine: number) => {
    dbgRef.current?.removeBreakpoint(sourceFile, sourceLine);
    setBreakpoints((prev) =>
      prev.filter((b) => !(b.sourceFile === sourceFile && b.sourceLine === sourceLine))
    );
  }, []);

  const handleToggleBreakpoint = useCallback((sourceFile: string, sourceLine: number) => {
    dbgRef.current?.toggleBreakpoint(
      sourceFile,
      sourceLine,
      !breakpoints.find((b) => b.sourceFile === sourceFile && b.sourceLine === sourceLine)?.enabled
    );
    setBreakpoints((prev) =>
      prev.map((b) =>
        b.sourceFile === sourceFile && b.sourceLine === sourceLine
          ? { ...b, enabled: !b.enabled }
          : b
      )
    );
  }, [breakpoints]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { dbgRef.current?.terminate(); };
  }, []);

  const canRun = debuggerState === "loaded" || debuggerState === "terminated";
  const canStep = debuggerState === "paused";
  const canResume = debuggerState === "paused";
  const canTerminate = debuggerState === "running" || debuggerState === "paused" || debuggerState === "stepping";

  return (
    <div
      className="flex h-full flex-col bg-sidebar overflow-hidden"
      data-testid="wasm-debugger-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Bug className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">WASM Debugger</span>
        </div>
        <StateBadge state={debuggerState} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-sidebar-border px-3 py-1.5">
        {/* Load WASM */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".wasm"
          className="hidden"
          onChange={(e) => void handleFileChange(e)}
          data-testid="wasm-file-input"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Load WASM binary"
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          data-testid="wasm-load-btn"
        >
          <Upload className="h-3.5 w-3.5" />
          {wasmFileName ? (
            <span className="max-w-[80px] truncate">{wasmFileName}</span>
          ) : (
            "Load .wasm"
          )}
        </button>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Run */}
        <button
          onClick={() => void handleRun()}
          disabled={!canRun}
          title="Run"
          className={cn(
            "rounded p-1.5 transition-colors",
            canRun
              ? "text-emerald-400 hover:bg-emerald-500/10"
              : "text-muted-foreground/30 cursor-not-allowed"
          )}
          data-testid="wasm-run-btn"
        >
          <Play className="h-3.5 w-3.5" />
        </button>

        {/* Resume */}
        <button
          onClick={handleResume}
          disabled={!canResume}
          title="Resume"
          className={cn(
            "rounded p-1.5 transition-colors",
            canResume
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground/30 cursor-not-allowed"
          )}
          data-testid="wasm-resume-btn"
        >
          <SkipForward className="h-3.5 w-3.5" />
        </button>

        {/* Step Over */}
        <button
          onClick={() => void handleStepOver()}
          disabled={!canStep}
          title="Step Over"
          className={cn(
            "rounded p-1.5 transition-colors",
            canStep
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground/30 cursor-not-allowed"
          )}
          data-testid="wasm-step-btn"
        >
          <StepForward className="h-3.5 w-3.5" />
        </button>

        {/* Terminate */}
        <button
          onClick={handleTerminate}
          disabled={!canTerminate}
          title="Stop"
          className={cn(
            "rounded p-1.5 transition-colors",
            canTerminate
              ? "text-destructive hover:bg-destructive/10"
              : "text-muted-foreground/30 cursor-not-allowed"
          )}
          data-testid="wasm-stop-btn"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 border-b border-destructive/20 bg-destructive/10 px-3 py-2 text-[10px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="break-all">{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ── Breakpoints ─────────────────────────────────────────────── */}
        <SectionHeader
          label={`Breakpoints (${breakpoints.length})`}
          expanded={showBreakpoints}
          onToggle={() => setShowBreakpoints((v) => !v)}
        />
        {showBreakpoints && (
          <div className="px-3 py-2 space-y-2">
            {/* Add breakpoint form */}
            <div className="flex items-center gap-1.5">
              <input
                value={bpFile}
                onChange={(e) => setBpFile(e.target.value)}
                placeholder="src/lib.rs"
                className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="bp-file-input"
              />
              <input
                type="number"
                min={1}
                value={bpLine}
                onChange={(e) => setBpLine(e.target.value)}
                className="w-14 rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="bp-line-input"
              />
              <button
                onClick={handleAddBreakpoint}
                className="rounded bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/25 transition-colors"
                data-testid="bp-add-btn"
              >
                Add
              </button>
            </div>

            {breakpoints.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">No breakpoints set.</p>
            ) : (
              <ul className="space-y-1">
                {breakpoints.map((bp) => (
                  <li
                    key={`${bp.sourceFile}:${bp.sourceLine}`}
                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/30"
                    data-testid={`bp-entry-${bp.sourceLine}`}
                  >
                    <button
                      onClick={() => handleToggleBreakpoint(bp.sourceFile, bp.sourceLine)}
                      title={bp.enabled ? "Disable breakpoint" : "Enable breakpoint"}
                      className="shrink-0"
                    >
                      {bp.enabled ? (
                        <CircleDot className="h-3 w-3 text-red-500" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground/40" />
                      )}
                    </button>
                    <span className="flex-1 min-w-0 text-[10px] font-mono text-foreground truncate">
                      {bp.sourceFile}
                      <span className="text-primary">:{bp.sourceLine}</span>
                    </span>
                    {!bp.resolved && (
                      <span className="text-[9px] text-amber-400" title="No DWARF mapping found">
                        unresolved
                      </span>
                    )}
                    <button
                      onClick={() => handleRemoveBreakpoint(bp.sourceFile, bp.sourceLine)}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      data-testid={`bp-remove-${bp.sourceLine}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Pause frame ──────────────────────────────────────────────── */}
        {pauseFrame && (
          <>
            {/* Call Stack */}
            <SectionHeader
              label="Call Stack"
              expanded={showCallStack}
              onToggle={() => setShowCallStack((v) => !v)}
            />
            {showCallStack && (
              <div className="px-3 py-2 space-y-1">
                {pauseFrame.callStack.map((frame, i) => (
                  <div
                    key={i}
                    className="rounded bg-card/40 border border-border px-2 py-1.5 text-[10px] font-mono"
                  >
                    <div className="text-foreground font-semibold">
                      {frame.functionName ?? `fn#${frame.functionIndex}`}
                    </div>
                    <div className="text-muted-foreground">
                      {frame.sourceFile ?? "?"}:{frame.sourceLine ?? "?"}
                      <span className="ml-2 text-primary">@0x{frame.wasmOffset.toString(16)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Locals */}
            <SectionHeader
              label={`Locals (${pauseFrame.locals.length})`}
              expanded={showLocals}
              onToggle={() => setShowLocals((v) => !v)}
            />
            {showLocals && (
              <div className="px-3 py-2">
                {pauseFrame.locals.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic">No locals captured.</p>
                ) : (
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pb-1 font-medium">Name</th>
                        <th className="text-left pb-1 font-medium">Type</th>
                        <th className="text-left pb-1 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pauseFrame.locals.map((local) => (
                        <tr key={local.name} className="hover:bg-muted/20">
                          <td className="py-0.5 pr-2 text-foreground">{local.name}</td>
                          <td className="py-0.5 pr-2 text-muted-foreground">{local.type}</td>
                          <td className="py-0.5 text-primary break-all">
                            {String(local.value.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Globals */}
            <SectionHeader
              label={`Globals (${pauseFrame.globals.length})`}
              expanded={showGlobals}
              onToggle={() => setShowGlobals((v) => !v)}
            />
            {showGlobals && (
              <div className="px-3 py-2">
                {pauseFrame.globals.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic">No globals.</p>
                ) : (
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pb-1 font-medium">#</th>
                        <th className="text-left pb-1 font-medium">Type</th>
                        <th className="text-left pb-1 font-medium">Value</th>
                        <th className="text-left pb-1 font-medium">Mut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pauseFrame.globals.map((g) => (
                        <tr key={g.index} className="hover:bg-muted/20">
                          <td className="py-0.5 pr-2 text-muted-foreground">{g.index}</td>
                          <td className="py-0.5 pr-2 text-muted-foreground">{g.type}</td>
                          <td className="py-0.5 pr-2 text-primary">{String(g.value.value)}</td>
                          <td className="py-0.5 text-muted-foreground">{g.mutable ? "✓" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}

        {/* Idle / loaded hint */}
        {(debuggerState === "idle" || debuggerState === "loaded") && !pauseFrame && (
          <div className="px-3 py-4 text-center text-[10px] text-muted-foreground">
            {debuggerState === "idle"
              ? "Load a .wasm binary to begin debugging."
              : "Binary loaded. Set breakpoints then press Run."}
          </div>
        )}

        {debuggerState === "terminated" && !pauseFrame && (
          <div className="px-3 py-4 text-center text-[10px] text-muted-foreground">
            Session terminated. Load a binary to start a new session.
          </div>
        )}
      </div>
    </div>
  );
}
