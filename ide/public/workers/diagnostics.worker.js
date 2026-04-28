/**
 * Diagnostics Web Worker
 *
 * Offloads Rust diagnostics parsing to a background thread to keep the main
 * UI thread responsive during heavy analysis.
 *
 * Inbound messages (main → worker):
 *   { type: 'parseDiagnostics', output: string, contractName: string }
 *   { type: 'parseClippy', output: string, contractName: string }
 *
 * Outbound messages (worker → main):
 *   { diagnostics: Diagnostic[] }  // for parseDiagnostics
 *   { diagnostics: Diagnostic[], lints: ClippyLint[] }  // for parseClippy
 *   { error: string }  // on parsing error
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Severity level matching Monaco editor's MarkerSeverity values */
const DiagnosticSeverity = {
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
  HINT: "hint"
};

/** A single structured diagnostic item */
function createDiagnostic(fileId, line, column, endLine, endColumn, message, severity, code) {
  return {
    fileId,
    line,
    column,
    endLine,
    endColumn,
    message,
    severity,
    code
  };
}

// ─── Path mapping ─────────────────────────────────────────────────────────────

/**
 * Maps an absolute backend file path to an IDE virtual file ID.
 */
function mapPathToVirtualId(backendPath, contractName = "hello_world") {
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
    return `${contractName}/${srcMatch[1]}`;
  }

  // Fallback: just use the basename
  const parts = normalised.split("/");
  return `${contractName}/${parts[parts.length - 1]}`;
}

// ─── Severity mapping ─────────────────────────────────────────────────────────

function mapLevel(level) {
  switch (level) {
    case "error":
    case "error: internal compiler error":
      return DiagnosticSeverity.ERROR;
    case "warning":
      return DiagnosticSeverity.WARNING;
    case "note":
    case "help":
      return DiagnosticSeverity.INFO;
    default:
      return DiagnosticSeverity.HINT;
  }
}

// ─── Core parser ──────────────────────────────────────────────────────────────

/**
 * Parse a single cargo JSON line into zero or more Diagnostic items.
 */
function parseCargoLine(rawLine, contractName = "hello_world") {
  const trimmed = rawLine.trim();
  if (!trimmed || !trimmed.startsWith("{")) return [];

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  // Only handle compiler-message entries
  if (parsed.reason !== "compiler-message") return [];

  const entry = parsed;
  const msg = entry.message;

  // Skip notes/help that have no primary span (pure noise)
  if (msg.level === "note" || msg.level === "help" || msg.level === "failure-note") {
    return [];
  }

  // Ignore messages from dependency crates (no spans pointing to src/lib.rs)
  const primarySpans = msg.spans.filter((s) => s.is_primary);
  if (primarySpans.length === 0) return [];

  const diagnostics = [];

  for (const span of primarySpans) {
    const fileId = mapPathToVirtualId(span.file_name, contractName);
    const label = span.label ? ` — ${span.label}` : "";

    diagnostics.push(createDiagnostic(
      fileId,
      span.line_start,
      span.column_start,
      span.line_end,
      span.column_end,
      `${msg.message}${label}`,
      mapLevel(msg.level),
      msg.code?.code ?? null
    ));
  }

  return diagnostics;
}

/**
 * Parse the full NDJSON output of `cargo build --message-format=json`.
 */
function parseCargoOutput(output, contractName = "hello_world") {
  const lines = output.split("\n");
  const all = [];

  for (const line of lines) {
    const items = parseCargoLine(line, contractName);
    all.push(...items);
  }

  // Deduplicate: same file + line + col + message
  const seen = new Set();
  return all.filter((d) => {
    const key = `${d.fileId}:${d.line}:${d.column}:${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Convenience: parse raw terminal output that may mix plain text lines
 * with cargo JSON lines.
 */
const RUSTC_PLAIN_ERROR_RE = /^(error|warning)(?:\[(\w+)\])?\s*:\s*(.+)$/;
const RUSTC_PLAIN_LOCATION_RE = /^\s*-->\s*(.+):(\d+):(\d+)$/;

function parseMixedOutput(output, contractName = "hello_world") {
  const lines = output.split("\n");
  const diagnostics = [];

  // First pass: try JSON parsing
  const jsonDiags = parseCargoOutput(output, contractName);
  if (jsonDiags.length > 0) return jsonDiags;

  // Second pass: plain-text rustc format
  let pendingLevel = null;
  let pendingMessage = "";
  let pendingCode = null;

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
        diagnostics.push(createDiagnostic(
          fileId,
          lineNum,
          col,
          lineNum,
          col + 1,
          pendingMessage,
          pendingLevel,
          pendingCode
        ));
        pendingLevel = null;
        pendingMessage = "";
        pendingCode = null;
      }
    }
  }

  return diagnostics;
}

// ─── Clippy parser ───────────────────────────────────────────────────────────

const CORRECTNESS_HINTS = [
  "unwrap",
  "expect",
  "panic",
  "unsafe",
  "invalid",
  "overflow",
  "unreachable",
  "lossy",
  "checked",
];

const PERFORMANCE_HINTS = [
  "inefficient",
  "slow",
  "alloc",
  "clone",
  "collect",
  "large",
  "bytes",
  "vec",
  "string",
  "iter",
];

function inferCategory(lintCode) {
  const code = lintCode.toLowerCase();

  if (CORRECTNESS_HINTS.some((hint) => code.includes(hint))) {
    return "correctness";
  }

  if (PERFORMANCE_HINTS.some((hint) => code.includes(hint))) {
    return "performance";
  }

  return "style";
}

function isMachineApplicable(span) {
  return (
    typeof span.suggested_replacement === "string" &&
    span.suggested_replacement.length >= 0 &&
    span.suggestion_applicability === "MachineApplicable"
  );
}

function findMachineApplicableFix(msg, contractName) {
  const queue = [msg, ...msg.children];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    for (const span of current.spans) {
      if (!isMachineApplicable(span)) {
        continue;
      }

      return {
        fileId: mapPathToVirtualId(span.file_name, contractName),
        line: span.line_start,
        column: span.column_start,
        endLine: span.line_end,
        endColumn: span.column_end,
        replacement: span.suggested_replacement ?? "",
        applicability: span.suggestion_applicability ?? "Unspecified",
      };
    }

    queue.push(...current.children);
  }

  return undefined;
}

function mapSeverity(level) {
  if (level === "error") return DiagnosticSeverity.ERROR;
  if (level === "warning") return DiagnosticSeverity.WARNING;
  return DiagnosticSeverity.INFO;
}

function parseClippyOutput(output, contractName = "hello_world") {
  const diagnostics = [];
  const lints = [];

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("{")) continue;

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.reason !== "compiler-message") {
      continue;
    }

    const message = parsed.message;
    const lintCode = message.code?.code;
    if (!lintCode?.startsWith("clippy::")) {
      continue;
    }

    const primarySpans = message.spans.filter((span) => span.is_primary);
    if (primarySpans.length === 0) {
      continue;
    }

    const autoFix = findMachineApplicableFix(message, contractName);
    const category = inferCategory(lintCode);
    const severity = mapSeverity(message.level);

    for (const span of primarySpans) {
      const fileId = mapPathToVirtualId(span.file_name, contractName);
      const lintId = `${lintCode}:${fileId}:${span.line_start}:${span.column_start}:${message.message}`;

      const diagnostic = createDiagnostic(
        fileId,
        span.line_start,
        span.column_start,
        span.line_end,
        span.column_end,
        message.message,
        severity,
        lintCode
      );

      diagnostics.push(diagnostic);
      lints.push({
        ...diagnostic,
        id: lintId,
        lintCode,
        category,
        title: message.message,
        autoFix: autoFix && autoFix.fileId === fileId ? autoFix : undefined,
      });
    }
  }

  const dedupe = new Set();
  const uniqueLints = lints.filter((lint) => {
    if (dedupe.has(lint.id)) return false;
    dedupe.add(lint.id);
    return true;
  });

  const diagnosticDedupe = new Set();
  const uniqueDiagnostics = diagnostics.filter((diag) => {
    const key = `${diag.fileId}:${diag.line}:${diag.column}:${diag.message}:${diag.code}`;
    if (diagnosticDedupe.has(key)) return false;
    diagnosticDedupe.add(key);
    return true;
  });

  return {
    diagnostics: uniqueDiagnostics,
    lints: uniqueLints,
  };
}

// ─── Worker message handling ─────────────────────────────────────────────────

self.addEventListener('message', (e) => {
  const msg = e.data;

  try {
    if (msg.type === 'parseDiagnostics') {
      const diagnostics = parseMixedOutput(msg.output, msg.contractName);
      self.postMessage({ diagnostics });
    } else if (msg.type === 'parseClippy') {
      const result = parseClippyOutput(msg.output, msg.contractName);
      self.postMessage(result);
    }
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Unknown parsing error'
    });
  }
});