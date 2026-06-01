import { describe, expect, it } from "vitest";
import type * as Monaco from "monaco-editor";
import {
  extractDocComment,
  extractSignature,
  findSymbolLine,
} from "@/lib/rustDocExtractor";

const atLine = (lineNumber: number): Monaco.Position =>
  ({ lineNumber, column: 1 } as Monaco.Position);

describe("extractDocComment", () => {
  it("returns stripped text for a single /// line", () => {
    const lines = ["/// Returns the user id", "pub fn user_id() -> u64 {"];
    expect(extractDocComment(lines, 1)).toBe("Returns the user id");
  });

  it("joins multiple /// lines and preserves blank lines", () => {
    const lines = [
      "/// First paragraph.",
      "///",
      "/// Second paragraph.",
      "pub fn demo() {}",
    ];

    expect(extractDocComment(lines, 3)).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("strips a /** */ doc block", () => {
    const lines = [
      "/**",
      " * Processes a transfer.",
      " *",
      " * Returns true on success.",
      " */",
      "pub fn transfer() -> bool {",
    ];

    expect(extractDocComment(lines, 5)).toBe(
      "Processes a transfer.\n\nReturns true on success.",
    );
  });

  it("returns empty string when no doc comment exists above the symbol", () => {
    const lines = ["let x = 1;", "pub fn missing_docs() {}"];
    expect(extractDocComment(lines, 1)).toBe("");
  });

  it("skips attribute lines between docs and symbol", () => {
    const lines = [
      "/// Helpful docs",
      "#[derive(Clone, Debug)]",
      "pub struct Payload;",
    ];

    expect(extractDocComment(lines, 2)).toBe("Helpful docs");
  });

  it("returns empty when a blank line separates doc comment and symbol", () => {
    const lines = ["/// Detached docs", "", "pub fn detached() {}"];
    expect(extractDocComment(lines, 2)).toBe("");
  });
});

describe("extractSignature", () => {
  it("returns a single-line function signature without body brace", () => {
    const lines = ["pub fn add(a: i32, b: i32) -> i32 {"];
    expect(extractSignature(lines, 0)).toBe("pub fn add(a: i32, b: i32) -> i32");
  });

  it("returns a joined multi-line function signature", () => {
    const lines = [
      "pub async fn load_user(",
      "    id: u64,",
      "    include_deleted: bool,",
      ") -> Result<User, Error> {",
      "    todo!()",
      "}",
    ];

    expect(extractSignature(lines, 0)).toBe(
      "pub async fn load_user( id: u64, include_deleted: bool, ) -> Result<User, Error>",
    );
  });

  it("returns the declaration line for structs", () => {
    const lines = ["pub struct Account {"];
    expect(extractSignature(lines, 0)).toBe("pub struct Account {");
  });

  it("returns the declaration line for enums", () => {
    const lines = ["pub enum Status {"];
    expect(extractSignature(lines, 0)).toBe("pub enum Status {");
  });

  it("returns empty string for non-definition lines", () => {
    const lines = ["let value = compute();"];
    expect(extractSignature(lines, 0)).toBe("");
  });
});

describe("findSymbolLine", () => {
  it("finds a pub fn by name", () => {
    const lines = ["pub fn build() {}"];
    expect(findSymbolLine(lines, "build", atLine(1))).toBe(0);
  });

  it("finds a pub async fn by name", () => {
    const lines = ["pub async fn sync() {}"];
    expect(findSymbolLine(lines, "sync", atLine(1))).toBe(0);
  });

  it("finds a struct by name", () => {
    const lines = ["pub struct Workspace;"];
    expect(findSymbolLine(lines, "Workspace", atLine(1))).toBe(0);
  });

  it("finds an enum by name", () => {
    const lines = ["pub enum Mode { A, B }"];
    expect(findSymbolLine(lines, "Mode", atLine(1))).toBe(0);
  });

  it("returns -1 when symbol is not defined", () => {
    const lines = ["pub fn one() {}"];
    expect(findSymbolLine(lines, "missing", atLine(1))).toBe(-1);
  });

  it("does not match symbol names that appear only in comments", () => {
    const lines = ["// fn fake() {}", "pub fn real() {}"];
    expect(findSymbolLine(lines, "fake", atLine(1))).toBe(-1);
  });
});
