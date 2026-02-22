// ============================================================
// src/utils/rustSourceParser.ts
// Regex-based parser for Rust source files that extracts
// function signatures from Soroban #[contractimpl] blocks.
// No external dependencies.
// ============================================================

import {
    ParsedRustFile,
    ParsedRustFunction,
    ParsedRustParameter,
    RustVisibility,
} from '../types/rustParser';

// ── Main entry point ──────────────────────────────────────────

/**
 * Parse a Rust source string and extract all public function
 * signatures, focusing on #[contractimpl] blocks.
 */
export function parseRustSource(source: string, filePath?: string): ParsedRustFile {
    const result: ParsedRustFile = {
        filePath,
        functions: [],
        errors: [],
    };

    const lines = source.split('\n');

    // 1. Detect the contract struct name from #[contract] attribute
    result.contractName = detectContractName(lines);

    // 2. Find #[contractimpl] block ranges
    const contractImplRanges = findContractImplRanges(lines);

    // 3. Extract function signatures
    const functions = extractFunctions(lines, contractImplRanges, result.errors);
    result.functions = functions;

    return result;
}

// ── Contract name detection ───────────────────────────────────

function detectContractName(lines: string[]): string | undefined {
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '#[contract]') {
            // Look at the next non-empty line for `pub struct Name;`
            for (let j = i + 1; j < lines.length; j++) {
                const trimmed = lines[j].trim();
                if (trimmed.length === 0) { continue; }
                const match = trimmed.match(/^pub\s+struct\s+(\w+)/);
                if (match) { return match[1]; }
                break;
            }
        }
    }
    return undefined;
}

// ── #[contractimpl] block detection ───────────────────────────

interface BlockRange {
    start: number; // 0-based line index where impl block body begins
    end: number;   // 0-based line index where impl block body ends
}

/**
 * Find the line ranges of all `impl` blocks that are preceded
 * by a `#[contractimpl]` attribute. Uses brace counting.
 */
function findContractImplRanges(lines: string[]): BlockRange[] {
    const ranges: BlockRange[] = [];
    let i = 0;

    while (i < lines.length) {
        const trimmed = lines[i].trim();

        if (trimmed === '#[contractimpl]') {
            // Find the `impl` line after the attribute
            let implLine = -1;
            for (let j = i + 1; j < lines.length; j++) {
                const t = lines[j].trim();
                if (t.length === 0) { continue; }
                if (t.startsWith('impl ') || t.startsWith('impl<')) {
                    implLine = j;
                    break;
                }
                break; // non-empty, non-impl line → stop
            }

            if (implLine >= 0) {
                // Count braces to find the matching close
                const range = findBraceBlock(lines, implLine);
                if (range) {
                    ranges.push(range);
                    i = range.end + 1;
                    continue;
                }
            }
        }

        i++;
    }

    return ranges;
}

/**
 * Starting from `startLine`, find the opening `{` and then
 * count braces to find where the block ends.
 */
function findBraceBlock(lines: string[], startLine: number): BlockRange | null {
    let depth = 0;
    let foundOpen = false;
    let blockStart = startLine;

    for (let i = startLine; i < lines.length; i++) {
        const line = stripStringLiteralsAndComments(lines[i]);

        for (const ch of line) {
            if (ch === '{') {
                if (!foundOpen) {
                    foundOpen = true;
                    blockStart = i;
                }
                depth++;
            } else if (ch === '}') {
                depth--;
                if (foundOpen && depth === 0) {
                    return { start: blockStart, end: i };
                }
            }
        }
    }

    return null;
}

/**
 * Rough removal of string literals and line comments so brace
 * counting isn't thrown off by `{` or `}` inside strings.
 */
function stripStringLiteralsAndComments(line: string): string {
    // Remove line comments first
    const commentIdx = line.indexOf('//');
    if (commentIdx >= 0) {
        line = line.substring(0, commentIdx);
    }

    // Remove string literals (simple approach)
    return line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

// ── Function extraction ───────────────────────────────────────

/**
 * Walk through all lines, extract function signatures,
 * and flag which ones are inside #[contractimpl] blocks.
 */
function extractFunctions(
    lines: string[],
    contractImplRanges: BlockRange[],
    errors: string[],
): ParsedRustFunction[] {
    const functions: ParsedRustFunction[] = [];
    let i = 0;

    while (i < lines.length) {
        const trimmed = lines[i].trim();

        // Collect doc comments (/// lines)
        const docComments: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('///')) {
            const comment = lines[i].trim().replace(/^\/\/\/\s?/, '');
            docComments.push(comment);
            i++;
        }

        if (i >= lines.length) { break; }

        const currentLine = lines[i].trim();

        // Check if this line starts a function signature
        const fnInfo = tryParseFunctionStart(currentLine);
        if (fnInfo) {
            const startLine = i; // 0-based

            // Collect multi-line signature until we find `{` or `;`
            let fullSignature = currentLine;
            let endLine = i;

            if (!signatureComplete(fullSignature)) {
                for (let j = i + 1; j < lines.length; j++) {
                    fullSignature += ' ' + lines[j].trim();
                    endLine = j;
                    if (signatureComplete(fullSignature)) { break; }
                }
            }

            // Parse the complete signature
            const parsed = parseFullSignature(fullSignature, docComments, errors);
            if (parsed) {
                parsed.startLine = startLine + 1; // 1-based
                parsed.endLine = endLine + 1;
                parsed.isContractImpl = isInsideContractImpl(startLine, contractImplRanges);
                functions.push(parsed);
            }

            // Skip to end of collected signature
            i = endLine + 1;
            continue;
        }

        // If we collected doc comments but no function follows, discard them
        i++;
    }

    return functions;
}

function isInsideContractImpl(lineIndex: number, ranges: BlockRange[]): boolean {
    return ranges.some(r => lineIndex >= r.start && lineIndex <= r.end);
}

/** Check if a line looks like the start of a function definition. */
function tryParseFunctionStart(line: string): boolean {
    return /^(pub(\s*\(crate\))?\s+)?fn\s+\w+/.test(line);
}

/** Check if a signature line is complete (has opening brace or semicolon). */
function signatureComplete(sig: string): boolean {
    return sig.includes('{') || sig.endsWith(';');
}

// ── Signature parsing ─────────────────────────────────────────

function parseFullSignature(
    signature: string,
    docComments: string[],
    errors: string[],
): ParsedRustFunction | null {
    // Remove everything from first `{` onwards (function body)
    const braceIdx = signature.indexOf('{');
    if (braceIdx >= 0) {
        signature = signature.substring(0, braceIdx).trim();
    }
    // Also strip trailing semicolons (for trait declarations)
    signature = signature.replace(/;\s*$/, '').trim();

    // Match: [pub [( crate )]] fn name ( params ) [-> ReturnType]
    const fnMatch = signature.match(
        /^(pub\s*(?:\(crate\)\s*)?)?fn\s+(\w+)\s*\(([^)]*(?:\([^)]*\))*[^)]*)\)\s*(?:->\s*(.+))?$/
    );

    if (!fnMatch) {
        // Try a more permissive match for complex generics in return type
        const relaxedMatch = signature.match(
            /^(pub\s*(?:\(crate\)\s*)?)?fn\s+(\w+)\s*\(([\s\S]*)\)\s*(?:->\s*([\s\S]+))?$/
        );
        if (!relaxedMatch) {
            return null;
        }
        return buildFunction(relaxedMatch, docComments, errors);
    }

    return buildFunction(fnMatch, docComments, errors);
}

function buildFunction(
    match: RegExpMatchArray,
    docComments: string[],
    _errors: string[],
): ParsedRustFunction {
    const visStr = (match[1] || '').trim();
    const name = match[2];
    const paramsStr = match[3] || '';
    const returnTypeStr = (match[4] || '').trim();

    let visibility: RustVisibility = 'private';
    if (visStr.includes('(crate)')) {
        visibility = 'pub_crate';
    } else if (visStr.startsWith('pub')) {
        visibility = 'pub';
    }

    const parameters = parseParameterList(paramsStr);
    const returnType = returnTypeStr.length > 0 ? returnTypeStr : undefined;

    return {
        name,
        visibility,
        parameters,
        returnType,
        docComments,
        isContractImpl: false, // set later
        startLine: 0, // set later
        endLine: 0, // set later
    };
}

// ── Parameter parsing ─────────────────────────────────────────

/**
 * Parse a comma-separated parameter list, respecting nested
 * angle brackets and parentheses.
 */
export function parseParameterList(paramsStr: string): ParsedRustParameter[] {
    const trimmed = paramsStr.trim();
    if (trimmed.length === 0) { return []; }

    const parts = splitAtTopLevelCommas(trimmed);
    const params: ParsedRustParameter[] = [];

    for (const part of parts) {
        const p = part.trim();
        if (p.length === 0) { continue; }

        // Skip `self`, `&self`, `&mut self`
        if (/^&?\s*(mut\s+)?self$/.test(p)) { continue; }

        // Match: name: Type
        const colonIdx = p.indexOf(':');
        if (colonIdx < 0) { continue; }

        const name = p.substring(0, colonIdx).trim();
        let typeStr = p.substring(colonIdx + 1).trim();

        let isReference = false;
        let isMutable = false;

        // Detect &mut Type or &Type
        if (typeStr.startsWith('&mut ')) {
            isReference = true;
            isMutable = true;
            typeStr = typeStr.substring(5).trim();
        } else if (typeStr.startsWith('&')) {
            isReference = true;
            typeStr = typeStr.substring(1).trim();
        }

        params.push({ name, typeStr, isReference, isMutable });
    }

    return params;
}

/**
 * Split a string at commas that are not inside `<>` or `()`.
 */
function splitAtTopLevelCommas(input: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';

    for (const ch of input) {
        if (ch === '<' || ch === '(') {
            depth++;
            current += ch;
        } else if (ch === '>' || ch === ')') {
            depth--;
            current += ch;
        } else if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    if (current.trim().length > 0) {
        parts.push(current);
    }

    return parts;
}

// ── Content hashing ───────────────────────────────────────────

/** Simple DJB2 hash for content comparison. */
export function hashContent(content: string): string {
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
    }
    return `djb2:${(hash >>> 0).toString(16)}`;
}
