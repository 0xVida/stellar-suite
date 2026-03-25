/**
 * Tests for utils/cargoParser.ts
 *
 * Verifies that cargo --message-format=json output is correctly parsed
 * into structured Diagnostic items.
 */
import { describe, it, expect } from "vitest";
import {
  parseCargoLine,
  parseCargoOutput,
  parseMixedOutput,
  mapPathToVirtualId,
} from "../utils/cargoParser";

// ─── mapPathToVirtualId ───────────────────────────────────────────────────────

describe("mapPathToVirtualId", () => {
  it("maps absolute backend path to virtual ID", () => {
    expect(mapPathToVirtualId("/workspace/hello_world/src/lib.rs", "hello_world")).toBe(
      "hello_world/lib.rs"
    );
  });

  it("handles relative src/ paths", () => {
    expect(mapPathToVirtualId("src/lib.rs", "hello_world")).toBe(
      "hello_world/lib.rs"
    );
  });

  it("returns basename fallback when no src/ segment", () => {
    expect(mapPathToVirtualId("/workspace/hello_world/lib.rs", "hello_world")).toBe(
      "hello_world/lib.rs"
    );
  });

  it("passes through already-virtual IDs unchanged", () => {
    expect(mapPathToVirtualId("hello_world/lib.rs", "hello_world")).toBe(
      "hello_world/lib.rs"
    );
  });
});

// ─── parseCargoLine ───────────────────────────────────────────────────────────

const makeCompilerMessage = (overrides: object) =>
  JSON.stringify({
    reason: "compiler-message",
    package_id: "hello_world 0.1.0",
    message: {
      message: "mismatched types",
      code: { code: "E0308", explanation: null },
      level: "error",
      spans: [
        {
          file_name: "/workspace/hello_world/src/lib.rs",
          line_start: 12,
          line_end: 12,
          column_start: 9,
          column_end: 21,
          is_primary: true,
          label: null,
        },
      ],
      children: [],
      ...overrides,
    },
  });

describe("parseCargoLine", () => {
  it("returns empty array for blank lines", () => {
    expect(parseCargoLine("")).toEqual([]);
    expect(parseCargoLine("   ")).toEqual([]);
  });

  it("returns empty array for non-JSON lines", () => {
    expect(parseCargoLine("Compiling hello_world v0.1.0")).toEqual([]);
  });

  it("returns empty array for non-compiler-message reasons", () => {
    const line = JSON.stringify({ reason: "build-finished", success: true });
    expect(parseCargoLine(line)).toEqual([]);
  });

  it("parses an error with primary span", () => {
    const line = makeCompilerMessage({});
    const result = parseCargoLine(line, "hello_world");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      fileId: "hello_world/lib.rs",
      line: 12,
      column: 9,
      endLine: 12,
      endColumn: 21,
      message: "mismatched types",
      severity: "error",
      code: "E0308",
    });
  });

  it("parses a warning correctly", () => {
    const line = makeCompilerMessage({ level: "warning", message: "unused variable: `x`" });
    const result = parseCargoLine(line, "hello_world");
    expect(result[0].severity).toBe("warning");
  });

  it("ignores messages with no primary span", () => {
    const line = JSON.stringify({
      reason: "compiler-message",
      package_id: "hello_world 0.1.0",
      message: {
        message: "some note",
        code: null,
        level: "note",
        spans: [],
        children: [],
      },
    });
    expect(parseCargoLine(line)).toEqual([]);
  });

  it("ignores non-primary spans", () => {
    const line = JSON.stringify({
      reason: "compiler-message",
      package_id: "hello_world 0.1.0",
      message: {
        message: "error here",
        code: null,
        level: "error",
        spans: [
          {
            file_name: "src/lib.rs",
            line_start: 5,
            line_end: 5,
            column_start: 1,
            column_end: 5,
            is_primary: false,
            label: null,
          },
        ],
        children: [],
      },
    });
    expect(parseCargoLine(line)).toEqual([]);
  });

  it("appends span label to message when present", () => {
    const line = makeCompilerMessage({ message: "type error" });
    // Patch the span label
    const parsed = JSON.parse(line);
    parsed.message.spans[0].label = "expected `u32`";
    const result = parseCargoLine(JSON.stringify(parsed), "hello_world");
    expect(result[0].message).toContain("expected `u32`");
  });
});

// ─── parseCargoOutput ─────────────────────────────────────────────────────────

describe("parseCargoOutput", () => {
  it("parses multiple NDJSON lines", () => {
    const output = [
      makeCompilerMessage({ message: "error one" }),
      makeCompilerMessage({ message: "error two", level: "warning" }),
      JSON.stringify({ reason: "build-finished", success: false }),
    ].join("\n");

    const result = parseCargoOutput(output, "hello_world");
    expect(result).toHaveLength(2);
    expect(result[0].message).toBe("error one");
    expect(result[1].severity).toBe("warning");
  });

  it("deduplicates identical diagnostics", () => {
    const line = makeCompilerMessage({});
    const output = [line, line].join("\n");
    const result = parseCargoOutput(output, "hello_world");
    expect(result).toHaveLength(1);
  });

  it("ignores dependency crate messages (non-primary spans only)", () => {
    const depLine = JSON.stringify({
      reason: "compiler-message",
      package_id: "soroban-sdk 20.0.0",
      message: {
        message: "dep warning",
        code: null,
        level: "warning",
        spans: [
          {
            file_name: "/root/.cargo/registry/soroban-sdk/src/lib.rs",
            line_start: 1,
            line_end: 1,
            column_start: 1,
            column_end: 5,
            is_primary: false,
            label: null,
          },
        ],
        children: [],
      },
    });
    expect(parseCargoOutput(depLine, "hello_world")).toHaveLength(0);
  });

  it("maps src/lib.rs errors to virtual file IDs", () => {
    const line = makeCompilerMessage({});
    const result = parseCargoOutput(line, "hello_world");
    expect(result[0].fileId).toBe("hello_world/lib.rs");
  });
});

// ─── parseMixedOutput ─────────────────────────────────────────────────────────

describe("parseMixedOutput", () => {
  it("prefers JSON parsing when JSON lines are present", () => {
    const output = makeCompilerMessage({ message: "json error" });
    const result = parseMixedOutput(output, "hello_world");
    expect(result[0].message).toBe("json error");
  });

  it("falls back to plain-text rustc format", () => {
    const output = [
      "error[E0308]: mismatched types",
      "  --> src/lib.rs:12:5",
    ].join("\n");
    const result = parseMixedOutput(output, "hello_world");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      severity: "error",
      code: "E0308",
      message: "mismatched types",
      line: 12,
      column: 5,
    });
  });

  it("parses plain-text warnings", () => {
    const output = [
      "warning[unused_variables]: unused variable: `x`",
      "  --> src/lib.rs:5:9",
    ].join("\n");
    const result = parseMixedOutput(output, "hello_world");
    expect(result[0].severity).toBe("warning");
  });
});
