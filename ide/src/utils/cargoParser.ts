/**
 * cargoParser.ts
 *
 * Parses the structured JSON output of `cargo build --message-format=json`
 * to extract precise file paths, line numbers, and error messages.
 *
 * Each line of cargo's JSON output is a separate JSON object (NDJSON).
 * We filter for compiler-message entries and map absolute backend paths
 * back to IDE virtual file IDs (e.g. "hello_world/lib.rs").
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Severity level matching Monaco editor's MarkerSeverity values */
export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

/** A single structured diagnostic item */
export interface Diagnostic {
  /** Virtual file ID used by the IDE (e.g. "hello_world/lib.rs") */
  fileId: string;
  /** 1-based line number */
  line: number;
  /** 1-based column number */
  column: number;
  /** End line (1-based), defaults to same as line */
  endLine: number;
  /** End column (1-based) */
  endColumn: number;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: DiagnosticSeverity;
  /** Short error code, e.g. "E0308" */
  code: string | null;
}

// ─── Internal cargo JSON shapes ───────────────────────────────────────────────

interface CargoSpan {
  file_name: string;
  line_start: number;
  line_end: number;
  column_start: number;
  column_end: number;
  is_primary: boolean;
  label: string | null;
}

interface CargoMessage {
  message: string;
  code: { code: string; explanation: string | null } | null;
  level: string; // "error", "warning", "note", "help", "failure-note"
  spans: CargoSpan[];
  children: CargoMessage[];
}

interface CargoCompilerMessage {
  reason: "compiler-message";
  package_id: string;
  message: CargoMessage;
}

interface CargoOtherMessage {
  reason: string;
}

type CargoLine = CargoCompilerMessage | CargoOtherMessage;

// ─── Path mapping ─────────────────────────────────────────────────────────────

/**
 * Maps an absolute backend file path to an IDE virtual file ID.
 *
 * The backend path looks like:
 *   /workspace/hello_world/src/lib.rs
 *   src/lib.rs  (relative, already short)
 *
 * The IDE virtual path looks like:
 *   hello_world/lib.rs
 *
 * Strategy: strip everything up to and including the first known src/ segment,
 * then reconstruct using the contract folder name derived from the path.
 */
export function mapPathToVirtualId(
  backendPath: string,
  contractName = "hello_world"
): string {
  // Normalise separators
  const normalised = backendPath.replace(/\\/g, "/");

  // If it already looks like a virtual ID (no leading slash, no /src/)
  if (!normalised.startsWith("/") && !normalised.includes("/src/")) {
    // Handle relative paths like "src/lib.rs" → "hello_world/src/lib.rs"
    if (normalised.startsWith("src/")) {
      // IDE virtual layout strips the `src/` folder (e.g. `hello_world/lib.rs`).
      return `${contractName}/${normalised.replace(/^src\//, "")}`;
    }
    return normalised;
  }

  // Extract the filename after the last src/ segment
  const srcMatch = normalised.match(/\/src\/(.+)$/);
  if (srcMatch) {
    // In the IDE virtual file tree, contract files live directly under
    // `<contractName>/...` (no `src/` folder). Strip the `src/` segment so
    // diagnostics match the active Monaco model's `fileId`.
    return `${contractName}/${srcMatch[1]}`;
  }

  // Fallback: just use the basename
  const parts = normalised.split("/");
  return `${contractName}/${parts[parts.length - 1]}`;
}

// ─── Severity mapping ─────────────────────────────────────────────────────────

function mapLevel(level: string): DiagnosticSeverity {
  switch (level) {
    case "error":
    case "error: internal compiler error":
      return "error";
    case "warning":
      return "warning";
    case "note":
    case "help":
      return "info";
    default:
      return "hint";
  }
}

// ─── Core parser ──────────────────────────────────────────────────────────────

/**
 * Parse a single cargo JSON line into zero or more Diagnostic items.
 * Returns an empty array for non-compiler-message lines or irrelevant crates.
 */
export function parseCargoLine(
  rawLine: string,
  contractName = "hello_world"
): Diagnostic[] {
  const trimmed = rawLine.trim();
  if (!trimmed || !trimmed.startsWith("{")) return [];

  let parsed: CargoLine;
  try {
    parsed = JSON.parse(trimmed) as CargoLine;
  } catch {
    return [];
  }

  // Only handle compiler-message entries
  if (parsed.reason !== "compiler-message") return [];

  const entry = parsed as CargoCompilerMessage;
  const msg = entry.message;

  // Skip notes/help that have no primary span (pure noise)
  if (msg.level === "note" || msg.level === "help" || msg.level === "failure-note") {
    return [];
  }

  // Ignore messages from dependency crates (no spans pointing to src/lib.rs)
  const primarySpans = msg.spans.filter((s) => s.is_primary);
  if (primarySpans.length === 0) return [];

  const diagnostics: Diagnostic[] = [];

  for (const span of primarySpans) {
    const fileId = mapPathToVirtualId(span.file_name, contractName);
    const label = span.label ? ` — ${span.label}` : "";

    diagnostics.push({
      fileId,
      line: span.line_start,
      column: span.column_start,
      endLine: span.line_end,
      endColumn: span.column_end,
      message: `${msg.message}${label}`,
      severity: mapLevel(msg.level),
      code: msg.code?.code ?? null,
    });
  }

  return diagnostics;
}

/**
 * Parse the full NDJSON output of `cargo build --message-format=json`.
 *
 * @param output     Raw multi-line string from cargo stdout
 * @param contractName  The IDE virtual contract folder name (default: "hello_world")
 * @returns          Flat array of Diagnostic items, deduplicated by position+message
 */
export function parseCargoOutput(
  output: string,
  contractName = "hello_world"
): Diagnostic[] {
  const lines = output.split("\n");
  const all: Diagnostic[] = [];

  for (const line of lines) {
    const items = parseCargoLine(line, contractName);
    all.push(...items);
  }

  // Deduplicate: same file + line + col + message
  const seen = new Set<string>();
  return all.filter((d) => {
    const key = `${d.fileId}:${d.line}:${d.column}:${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Convenience: parse raw terminal output that may mix plain text lines
 * with cargo JSON lines (e.g. when piped through a wrapper).
 *
 * Plain-text lines matching the classic rustc error format are also parsed:
 *   error[E0308]: mismatched types
 *     --> src/lib.rs:12:5
 */
const RUSTC_PLAIN_ERROR_RE =
  /^(error|warning)(?:\[(\w+)\])?\s*:\s*(.+)$/;
const RUSTC_PLAIN_LOCATION_RE = /^\s*-->\s*(.+):(\d+):(\d+)$/;

export function parseMixedOutput(
  output: string,
  contractName = "hello_world"
): Diagnostic[] {
  const lines = output.split("\n");
  const diagnostics: Diagnostic[] = [];

  // First pass: try JSON parsing
  const jsonDiags = parseCargoOutput(output, contractName);
  if (jsonDiags.length > 0) return jsonDiags;

  // Second pass: plain-text rustc format
  let pendingLevel: DiagnosticSeverity | null = null;
  let pendingMessage = "";
  let pendingCode: string | null = null;

  for (const line of lines) {
    const errorMatch = RUSTC_PLAIN_ERROR_RE.exec(line);
    if (errorMatch) {
      pendingLevel = mapLevel(errorMatch[1]);
      pendingCode = errorMatch[2] ?? null;
      pendingMessage = errorMatch[3];
      continue;
    }

    if (pendingLevel) {
      const locMatch = RUSTC_PLAIN_LOCATION_RE.exec(line);
      if (locMatch) {
        const fileId = mapPathToVirtualId(locMatch[1], contractName);
        const lineNum = parseInt(locMatch[2], 10);
        const col = parseInt(locMatch[3], 10);
        diagnostics.push({
          fileId,
          line: lineNum,
          column: col,
          endLine: lineNum,
          endColumn: col + 1,
          message: pendingMessage,
          severity: pendingLevel,
          code: pendingCode,
        });
        pendingLevel = null;
        pendingMessage = "";
        pendingCode = null;
      }
    }
  }

  return diagnostics;
}
