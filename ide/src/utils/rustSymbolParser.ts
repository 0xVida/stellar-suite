/**
 * Rust Symbol Parser
 * Extracts symbols (structs, enums, functions, macros, traits, impls) from Rust code
 */

export type SymbolKind =
  | "struct"
  | "enum"
  | "function"
  | "macro"
  | "impl"
  | "trait"
  | "const"
  | "type"
  | "mod";

export interface RustSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  visibility: "pub" | "private";
  parent?: string; // For methods inside impl blocks
}

/**
 * Parse Rust code and extract all symbols
 */
export function parseRustSymbols(code: string): RustSymbol[] {
  const symbols: RustSymbol[] = [];
  const lines = code.split("\n");
  let currentImpl: string | null = null;
  let braceDepth = 0;
  let implBraceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNumber = i + 1;

    // Skip comments and empty lines
    if (line.startsWith("//") || line.startsWith("/*") || !line) {
      continue;
    }

    // Track brace depth
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;

    // Check for impl blocks
    const implMatch = line.match(/^impl\s+(?:<[^>]+>\s+)?(\w+)/);
    if (implMatch) {
      currentImpl = implMatch[1];
      implBraceDepth = braceDepth;
      symbols.push({
        name: implMatch[1],
        kind: "impl",
        line: lineNumber,
        visibility: "private",
      });
    }

    braceDepth += openBraces - closeBraces;

    // Reset impl context when we exit the impl block
    if (currentImpl && braceDepth <= implBraceDepth) {
      currentImpl = null;
    }

    // Check visibility
    const isPublic = line.startsWith("pub ");

    // Struct
    const structMatch = line.match(/^(?:pub\s+)?struct\s+(\w+)/);
    if (structMatch) {
      symbols.push({
        name: structMatch[1],
        kind: "struct",
        line: lineNumber,
        visibility: isPublic ? "pub" : "private",
      });
      continue;
    }

    // Enum
    const enumMatch = line.match(/^(?:pub\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      symbols.push({
        name: enumMatch[1],
        kind: "enum",
        line: lineNumber,
        visibility: isPublic ? "pub" : "private",
      });
      continue;
    }

    // Trait
    const traitMatch = line.match(/^(?:pub\s+)?trait\s+(\w+)/);
    if (traitMatch) {
      symbols.push({
        name: traitMatch[1],
        kind: "trait",
        line: lineNumber,
        visibility: isPublic ? "pub" : "private",
      });
      continue;
    }

    // Type alias
    const typeMatch = line.match(/^(?:pub\s+)?type\s+(\w+)/);
    if (typeMatch) {
      symbols.push({
        name: typeMatch[1],
        kind: "type",
        line: lineNumber,
        visibility: isPublic ? "pub" : "private",
      });
      continue;
    }

    // Const
    const constMatch = line.match(/^(?:pub\s+)?const\s+(\w+)/);
    if (constMatch) {
      symbols.push({
        name: constMatch[1],
        kind: "const",
        line: lineNumber,
        visibility: isPublic ? "pub" : "private",
      });
      continue;
    }

    // Module
    const modMatch = line.match(/^(?:pub\s+)?mod\s+(\w+)/);
    if (modMatch) {
      symbols.push({
        name: modMatch[1],
        kind: "mod",
        line: lineNumber,
        visibility: isPublic ? "pub" : "private",
      });
      continue;
    }

    // Function (including methods in impl blocks)
    const fnMatch = line.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
    if (fnMatch) {
      symbols.push({
        name: fnMatch[1],
        kind: "function",
        line: lineNumber,
        visibility: isPublic ? "pub" : "private",
        parent: currentImpl || undefined,
      });
      continue;
    }

    // Macro definitions
    const macroMatch = line.match(/^macro_rules!\s+(\w+)/);
    if (macroMatch) {
      symbols.push({
        name: macroMatch[1],
        kind: "macro",
        line: lineNumber,
        visibility: "private",
      });
      continue;
    }
  }

  return symbols;
}

/**
 * Group symbols by their parent (for impl blocks)
 */
export function groupSymbolsByParent(symbols: RustSymbol[]): Map<string | null, RustSymbol[]> {
  const grouped = new Map<string | null, RustSymbol[]>();

  for (const symbol of symbols) {
    const parent = symbol.parent || null;
    if (!grouped.has(parent)) {
      grouped.set(parent, []);
    }
    grouped.get(parent)!.push(symbol);
  }

  return grouped;
}
