/**
 * MonacoDiagnostics
 *
 * Parses streaming stdout/stderr from the compilation Web Worker (raw cargo
 * NDJSON plus plain-text rustc fallback), turns each parsed diagnostic into a
 * Monaco editor `MarkerData`, and attaches it to whichever model matches the
 * diagnostic's virtual file id. Designed for interactive use during a build:
 *
 *   1. `createDiagnosticsSession(...)` is called when a compile starts.
 *   2. Each onChunk from the worker is fed into `pushChunk(chunk)`.
 *      The session line-buffers across chunk boundaries (NDJSON entries can
 *      be split mid-line), parses every completed line, and emits new
 *      diagnostics through the `onDiagnostics` callback.
 *   3. `finalize()` is called after the worker reports `done`, draining any
 *      trailing partial line.
 *   4. A new compile starts with `clearMonacoDiagnostics()`, removing markers
 *      from all models so stale errors never linger.
 *
 * The module is deliberately Monaco-agnostic at parse time — callers can use
 * the parser without instantiating any editor (this is what tests do). The
 * `applyDiagnosticsToMonaco` helper is the only function that touches the
 * monaco namespace, and it accepts the runtime monaco instance as a parameter
 * so the module never imports the editor at module load.
 */

import type * as Monaco from "monaco-editor";
import {
  parseCargoLine,
  parseMixedOutput,
  type Diagnostic,
  type DiagnosticSeverity,
} from "@/utils/cargoParser";

/** Marker source string used by `monaco.editor.setModelMarkers`. */
export const DIAGNOSTIC_MARKER_SOURCE = "cargo";

export type { Diagnostic, DiagnosticSeverity };

// ─────────────────────────────────────────────────────────────────────────────
// Pure parsing — used by the streaming session and by tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a single completed line. Cargo NDJSON entries land here one at a time,
 * so this is the cheapest hot-path call during a streaming build.
 */
export function parseDiagnosticLine(line: string, contractName: string): Diagnostic[] {
  return parseCargoLine(line, contractName);
}

/**
 * Parse a full (already-buffered) blob — used by callers that have the
 * complete output, e.g. the post-build worker or tests fixtures.
 */
export function parseDiagnosticBlob(output: string, contractName: string): Diagnostic[] {
  return parseMixedOutput(output, contractName);
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming session
// ─────────────────────────────────────────────────────────────────────────────

export interface DiagnosticsSessionOptions {
  /** Virtual contract folder name (e.g. "hello_world"). */
  contractName: string;
  /**
   * Called every time the parser produces new diagnostics. The callback gets
   * the *full* current diagnostic set so subscribers can replace state in one
   * pass without merging.
   */
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
}

export interface DiagnosticsSession {
  /** Feed a raw chunk from the compile worker; safe to call with empty strings. */
  pushChunk(chunk: string): void;
  /** Flush any buffered partial line. Call once after the build finishes. */
  finalize(): void;
  /** Get the cumulative diagnostic list. */
  getDiagnostics(): Diagnostic[];
  /** Reset state without emitting. Useful for tests; the hook prefers a new session. */
  reset(): void;
}

/**
 * Build a streaming diagnostics session. The returned object holds a line
 * buffer and dedupe set so callers can pump chunks directly from the worker.
 */
export function createDiagnosticsSession(
  options: DiagnosticsSessionOptions,
): DiagnosticsSession {
  const { contractName, onDiagnostics } = options;
  let lineBuffer = "";
  let diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  const ingestLines = (lines: string[]) => {
    let added = false;
    for (const line of lines) {
      if (!line) continue;
      const parsed = parseDiagnosticLine(line, contractName);
      for (const d of parsed) {
        const key = `${d.fileId}:${d.line}:${d.column}:${d.severity}:${d.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        diagnostics.push(d);
        added = true;
      }
    }
    if (added) onDiagnostics?.(diagnostics);
  };

  return {
    pushChunk(chunk: string) {
      if (!chunk) return;
      lineBuffer += chunk;
      // Split on \n; the last element is whatever sits past the final newline
      // and gets held back until the next chunk completes it.
      const parts = lineBuffer.split("\n");
      lineBuffer = parts.pop() ?? "";
      ingestLines(parts);
    },

    finalize() {
      if (lineBuffer) {
        ingestLines([lineBuffer]);
        lineBuffer = "";
      }
      // Fallback: if the JSON streaming yielded nothing (e.g. backend ran
      // without --message-format=json), retry the cumulative blob through the
      // plain-text parser so users still get markers.
      if (diagnostics.length === 0) {
        const cumulative = parseDiagnosticBlob(
          diagnostics.map((d) => d.message).join("\n"),
          contractName,
        );
        if (cumulative.length > 0) {
          diagnostics = cumulative;
          onDiagnostics?.(diagnostics);
        }
      }
    },

    getDiagnostics() {
      return diagnostics;
    },

    reset() {
      lineBuffer = "";
      diagnostics = [];
      seen.clear();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Monaco bridge
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_TO_MARKER: Record<DiagnosticSeverity, keyof typeof Monaco.MarkerSeverity> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
  hint: "Hint",
};

/**
 * Find every Monaco model whose path matches a diagnostic fileId. Monaco model
 * URIs typically look like `inmemory://model/<fileId>` or
 * `file:///<fileId>`; we match by suffix so the diagnostic doesn't have to
 * know the URI scheme used by the editor host.
 */
function findModelsForFile(
  monaco: typeof Monaco,
  fileId: string,
): Monaco.editor.ITextModel[] {
  const out: Monaco.editor.ITextModel[] = [];
  for (const model of monaco.editor.getModels()) {
    const path = decodeURIComponent(model.uri.path).replace(/^\/+/, "");
    const uri = decodeURIComponent(model.uri.toString());
    if (path === fileId || path.endsWith(`/${fileId}`) || uri.endsWith(fileId)) {
      out.push(model);
    }
  }
  return out;
}

function toMarker(
  monaco: typeof Monaco,
  d: Diagnostic,
): Monaco.editor.IMarkerData {
  return {
    severity: monaco.MarkerSeverity[SEVERITY_TO_MARKER[d.severity]],
    startLineNumber: d.line,
    startColumn: d.column,
    endLineNumber: d.endLine,
    endColumn: d.endColumn,
    message: d.code ? `[${d.code}] ${d.message}` : d.message,
    source: DIAGNOSTIC_MARKER_SOURCE,
    code: d.code ?? undefined,
  };
}

/**
 * Apply a list of diagnostics to Monaco. Markers are grouped by fileId; every
 * model that matches a fileId receives that file's marker set, while every
 * other model has its markers cleared so a fix in one file removes stale
 * errors.
 */
export function applyDiagnosticsToMonaco(
  monaco: typeof Monaco,
  diagnostics: Diagnostic[],
  markerSource: string = DIAGNOSTIC_MARKER_SOURCE,
): void {
  const byFile = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const bucket = byFile.get(d.fileId) ?? [];
    bucket.push(d);
    byFile.set(d.fileId, bucket);
  }

  const touchedModels = new Set<Monaco.editor.ITextModel>();
  for (const [fileId, items] of byFile.entries()) {
    const models = findModelsForFile(monaco, fileId);
    for (const model of models) {
      monaco.editor.setModelMarkers(
        model,
        markerSource,
        items.map((d) => toMarker(monaco, d)),
      );
      touchedModels.add(model);
    }
  }

  // Clear our marker source on every model that didn't receive new diagnostics
  // so a file that compiles cleanly drops its previous errors.
  for (const model of monaco.editor.getModels()) {
    if (!touchedModels.has(model)) {
      monaco.editor.setModelMarkers(model, markerSource, []);
    }
  }
}

/**
 * Clear every marker we own from every model. Called at the start of each
 * compilation so the editor never shows diagnostics from a previous build.
 */
export function clearMonacoDiagnostics(
  monaco: typeof Monaco,
  markerSource: string = DIAGNOSTIC_MARKER_SOURCE,
): void {
  for (const model of monaco.editor.getModels()) {
    monaco.editor.setModelMarkers(model, markerSource, []);
  }
}
