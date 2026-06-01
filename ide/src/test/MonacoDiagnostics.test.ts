import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyDiagnosticsToMonaco,
  clearMonacoDiagnostics,
  createDiagnosticsSession,
  DIAGNOSTIC_MARKER_SOURCE,
  parseDiagnosticBlob,
  parseDiagnosticLine,
} from "@/lib/diagnostics/MonacoDiagnostics";

const CARGO_ERROR_LINE = JSON.stringify({
  reason: "compiler-message",
  package_id: "hello_world 0.1.0",
  message: {
    message: "cannot find value `foo` in this scope",
    code: { code: "E0425", explanation: null },
    level: "error",
    spans: [
      {
        file_name: "src/lib.rs",
        line_start: 12,
        line_end: 12,
        column_start: 5,
        column_end: 8,
        is_primary: true,
        label: "not found in this scope",
      },
    ],
    children: [],
  },
});

const CARGO_WARNING_LINE = JSON.stringify({
  reason: "compiler-message",
  package_id: "hello_world 0.1.0",
  message: {
    message: "unused variable: `x`",
    code: { code: "unused_variables", explanation: null },
    level: "warning",
    spans: [
      {
        file_name: "src/lib.rs",
        line_start: 7,
        line_end: 7,
        column_start: 9,
        column_end: 10,
        is_primary: true,
        label: null,
      },
    ],
    children: [],
  },
});

describe("parseDiagnosticLine", () => {
  it("extracts line/column from a cargo NDJSON error", () => {
    const [d] = parseDiagnosticLine(CARGO_ERROR_LINE, "hello_world");
    expect(d).toBeDefined();
    expect(d.severity).toBe("error");
    expect(d.line).toBe(12);
    expect(d.column).toBe(5);
    expect(d.endLine).toBe(12);
    expect(d.endColumn).toBe(8);
    expect(d.code).toBe("E0425");
    expect(d.message).toContain("cannot find value");
    expect(d.fileId).toBe("hello_world/lib.rs");
  });

  it("returns no diagnostic for unrelated JSON lines", () => {
    expect(
      parseDiagnosticLine(
        JSON.stringify({ reason: "build-script-executed" }),
        "hello_world",
      ),
    ).toEqual([]);
  });

  it("ignores plain-text lines (handled by the cumulative parser)", () => {
    expect(parseDiagnosticLine("Compiling hello_world v0.1.0", "hello_world")).toEqual([]);
  });
});

describe("createDiagnosticsSession streaming", () => {
  it("parses diagnostics that arrive split across chunk boundaries", () => {
    const updates: number[] = [];
    const session = createDiagnosticsSession({
      contractName: "hello_world",
      onDiagnostics: (d) => updates.push(d.length),
    });

    // Split the JSON line into three arbitrary chunks (mid-token)
    const split1 = CARGO_ERROR_LINE.slice(0, 30);
    const split2 = CARGO_ERROR_LINE.slice(30, 80);
    const split3 = CARGO_ERROR_LINE.slice(80) + "\n";

    session.pushChunk(split1);
    expect(session.getDiagnostics()).toHaveLength(0);
    session.pushChunk(split2);
    expect(session.getDiagnostics()).toHaveLength(0);
    session.pushChunk(split3);

    expect(session.getDiagnostics()).toHaveLength(1);
    expect(updates).toEqual([1]);
  });

  it("emits cumulative diagnostics as new lines arrive", () => {
    const snapshots: number[][] = [];
    const session = createDiagnosticsSession({
      contractName: "hello_world",
      onDiagnostics: (d) => snapshots.push(d.map((x) => x.line)),
    });

    session.pushChunk(CARGO_ERROR_LINE + "\n");
    session.pushChunk(CARGO_WARNING_LINE + "\n");
    session.finalize();

    expect(session.getDiagnostics()).toHaveLength(2);
    expect(snapshots).toEqual([[12], [12, 7]]);
  });

  it("deduplicates identical diagnostics", () => {
    const session = createDiagnosticsSession({ contractName: "hello_world" });
    session.pushChunk(CARGO_ERROR_LINE + "\n");
    session.pushChunk(CARGO_ERROR_LINE + "\n");
    session.finalize();
    expect(session.getDiagnostics()).toHaveLength(1);
  });

  it("flushes a trailing line without a newline on finalize()", () => {
    const session = createDiagnosticsSession({ contractName: "hello_world" });
    session.pushChunk(CARGO_ERROR_LINE); // no trailing \n
    expect(session.getDiagnostics()).toHaveLength(0);
    session.finalize();
    expect(session.getDiagnostics()).toHaveLength(1);
  });

  it("reset() drops state without emitting", () => {
    const cb = vi.fn();
    const session = createDiagnosticsSession({
      contractName: "hello_world",
      onDiagnostics: cb,
    });
    session.pushChunk(CARGO_ERROR_LINE + "\n");
    expect(cb).toHaveBeenCalledTimes(1);
    cb.mockClear();
    session.reset();
    expect(session.getDiagnostics()).toEqual([]);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("parseDiagnosticBlob (plain-text fallback)", () => {
  it("parses the classic rustc plain-text format", () => {
    const output = [
      "   Compiling hello_world v0.1.0",
      "error[E0308]: mismatched types",
      "  --> src/lib.rs:12:5",
      "   |",
      "12 |     foo",
      "   |     ^^^",
    ].join("\n");

    const diagnostics = parseDiagnosticBlob(output, "hello_world");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      fileId: "hello_world/lib.rs",
      line: 12,
      column: 5,
      severity: "error",
      code: "E0308",
    });
  });
});

// ─── Monaco bridge ───────────────────────────────────────────────────────────

function makeFakeMonaco() {
  const setModelMarkers = vi.fn();
  const models: { uri: { path: string; toString: () => string } }[] = [];

  return {
    monaco: {
      editor: {
        getModels: () => models,
        setModelMarkers,
      },
      MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
    },
    setModelMarkers,
    models,
    addModel(fileId: string) {
      const model = {
        uri: {
          path: `/${fileId}`,
          toString: () => `inmemory://model/${fileId}`,
        },
      };
      models.push(model);
      return model;
    },
  };
}

describe("applyDiagnosticsToMonaco", () => {
  it("sets error markers on the matching model", () => {
    const fake = makeFakeMonaco();
    const model = fake.addModel("hello_world/lib.rs");

    applyDiagnosticsToMonaco(fake.monaco as never, [
      {
        fileId: "hello_world/lib.rs",
        line: 12,
        column: 5,
        endLine: 12,
        endColumn: 8,
        message: "boom",
        severity: "error",
        code: "E0425",
      },
    ]);

    expect(fake.setModelMarkers).toHaveBeenCalledWith(
      model,
      DIAGNOSTIC_MARKER_SOURCE,
      [
        expect.objectContaining({
          severity: 8,
          startLineNumber: 12,
          startColumn: 5,
          endLineNumber: 12,
          endColumn: 8,
          source: DIAGNOSTIC_MARKER_SOURCE,
          message: "[E0425] boom",
        }),
      ],
    );
  });

  it("clears markers on models that no longer have diagnostics", () => {
    const fake = makeFakeMonaco();
    const fixed = fake.addModel("hello_world/fixed.rs");

    applyDiagnosticsToMonaco(fake.monaco as never, [
      {
        fileId: "hello_world/lib.rs",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 2,
        message: "x",
        severity: "error",
        code: null,
      },
    ]);

    // fixed.rs is in the model set but absent from the diagnostic list, so it
    // must be cleared.
    expect(fake.setModelMarkers).toHaveBeenCalledWith(
      fixed,
      DIAGNOSTIC_MARKER_SOURCE,
      [],
    );
  });
});

describe("clearMonacoDiagnostics", () => {
  it("clears the marker source on every model", () => {
    const fake = makeFakeMonaco();
    const a = fake.addModel("hello_world/a.rs");
    const b = fake.addModel("hello_world/b.rs");

    clearMonacoDiagnostics(fake.monaco as never);

    expect(fake.setModelMarkers).toHaveBeenCalledWith(a, DIAGNOSTIC_MARKER_SOURCE, []);
    expect(fake.setModelMarkers).toHaveBeenCalledWith(b, DIAGNOSTIC_MARKER_SOURCE, []);
    expect(fake.setModelMarkers).toHaveBeenCalledTimes(2);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
