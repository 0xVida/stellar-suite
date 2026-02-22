// ============================================================
// src/types/rustParser.ts
// Type definitions for Rust source code parsing.
// No vscode dependency — pure TypeScript types.
// ============================================================

// ── Parsed function types ─────────────────────────────────────

/** A single parsed parameter from a Rust function signature. */
export interface ParsedRustParameter {
    /** Parameter name as declared. */
    name: string;
    /** Full type string (e.g. "Address", "Vec<Address>"). */
    typeStr: string;
    /** Whether the parameter is a reference (&Type). */
    isReference: boolean;
    /** Whether the parameter is a mutable reference (&mut Type). */
    isMutable: boolean;
}

/** Visibility level of a Rust function. */
export type RustVisibility = 'pub' | 'pub_crate' | 'private';

/** A single parsed function from a Rust source file. */
export interface ParsedRustFunction {
    /** Function name. */
    name: string;
    /** Visibility modifier. */
    visibility: RustVisibility;
    /** Parsed parameters (excluding self). */
    parameters: ParsedRustParameter[];
    /** Return type string, or undefined for -> (). */
    returnType?: string;
    /** Lines of /// doc comments above the function. */
    docComments: string[];
    /** Whether the function is inside a #[contractimpl] block. */
    isContractImpl: boolean;
    /** 1-based start line in the source file. */
    startLine: number;
    /** 1-based end line of the function signature. */
    endLine: number;
}

/** Result of parsing an entire Rust source file. */
export interface ParsedRustFile {
    /** Original file path (if provided). */
    filePath?: string;
    /** Contract struct name (from #[contract] attribute). */
    contractName?: string;
    /** All parsed public functions. */
    functions: ParsedRustFunction[];
    /** Parsing errors / warnings encountered. */
    errors: string[];
}

// ── Cache types ───────────────────────────────────────────────

/** Cached parse result for a single file. */
export interface SignatureCacheEntry {
    /** The parsed file result. */
    parsed: ParsedRustFile;
    /** Hash of the source content at parse time. */
    contentHash: string;
    /** ISO timestamp of when this entry was cached. */
    cachedAt: string;
}
