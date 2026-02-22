// src/utils/abiParser.ts
// Parses raw Soroban CLI type strings into structured AbiParameter types.
// No vscode dependency — pure TypeScript utility.

import { FunctionParameter } from '../services/contractInspector';

// ── Type Definitions ──────────────────────────────────────────

export type SorobanPrimitiveType =
    | 'bool'
    | 'u32' | 'i32' | 'u64' | 'i64'
    | 'u128' | 'i128' | 'u256' | 'i256'
    | 'String' | 'Symbol' | 'Bytes' | 'BytesN'
    | 'Address';

export type SorobanType =
    | { kind: 'primitive'; name: SorobanPrimitiveType }
    | { kind: 'option';    inner: SorobanType }
    | { kind: 'vec';       element: SorobanType }
    | { kind: 'map';       key: SorobanType; value: SorobanType }
    | { kind: 'custom';    name: string };

export interface AbiParameter {
    name: string;
    sorobanType: SorobanType;
    required: boolean;
    description?: string;
}

// ── Primitive Set ─────────────────────────────────────────────

const SOROBAN_PRIMITIVES = new Set<SorobanPrimitiveType>([
    'bool',
    'u32', 'i32', 'u64', 'i64',
    'u128', 'i128', 'u256', 'i256',
    'String', 'Symbol', 'Bytes', 'BytesN',
    'Address',
]);

function isPrimitive(name: string): name is SorobanPrimitiveType {
    return SOROBAN_PRIMITIVES.has(name as SorobanPrimitiveType);
}

// ── Public API ────────────────────────────────────────────────

/**
 * Parse a single type string from CLI help text into a SorobanType.
 * Handles: primitives, Option<T>, Vec<T>, Map<K,V>, custom types.
 *
 * Examples:
 *   parseTypeString('u64')             → { kind: 'primitive', name: 'u64' }
 *   parseTypeString('Option<u64>')     → { kind: 'option', inner: { kind: 'primitive', name: 'u64' } }
 *   parseTypeString('Vec<Address>')    → { kind: 'vec', element: { kind: 'primitive', name: 'Address' } }
 *   parseTypeString('Map<u32,String>') → { kind: 'map', key: ..., value: ... }
 *   parseTypeString('MyStruct')        → { kind: 'custom', name: 'MyStruct' }
 */
export function parseTypeString(typeStr: string): SorobanType {
    const trimmed = typeStr.trim();

    // Option<T>
    const optionMatch = trimmed.match(/^Option<(.+)>$/);
    if (optionMatch) {
        return { kind: 'option', inner: parseTypeString(optionMatch[1]) };
    }

    // Vec<T>
    const vecMatch = trimmed.match(/^Vec<(.+)>$/);
    if (vecMatch) {
        return { kind: 'vec', element: parseTypeString(vecMatch[1]) };
    }

    // Map<K,V> — must split on the top-level comma only
    const mapMatch = trimmed.match(/^Map<(.+)>$/);
    if (mapMatch) {
        const inner = mapMatch[1];
        const splitIdx = findTopLevelComma(inner);
        if (splitIdx !== -1) {
            const keyStr = inner.slice(0, splitIdx).trim();
            const valStr = inner.slice(splitIdx + 1).trim();
            return {
                kind: 'map',
                key: parseTypeString(keyStr),
                value: parseTypeString(valStr),
            };
        }
    }

    // Primitive
    if (isPrimitive(trimmed)) {
        return { kind: 'primitive', name: trimmed };
    }

    // Custom (user-defined enum/struct)
    return { kind: 'custom', name: trimmed };
}

/**
 * Map an array of raw FunctionParameter (from ContractInspector) into
 * AbiParameter[] with fully parsed SorobanType.
 * Parameters without a type field default to 'String'.
 */
export function parseParameters(params: FunctionParameter[]): AbiParameter[] {
    return params.map((p): AbiParameter => ({
        name: p.name,
        sorobanType: parseTypeString(p.type ?? 'String'),
        required: p.required,
        description: p.description,
    }));
}

// ── Internal Helpers ──────────────────────────────────────────

/**
 * Find the index of the first top-level comma in a string (not nested
 * inside angle brackets). Returns -1 if not found.
 *
 * Used to split Map<K,V> inner content correctly when K or V is
 * itself a generic type (e.g., Map<Vec<u32>,String>).
 */
function findTopLevelComma(str: string): number {
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '<') { depth++; }
        else if (str[i] === '>') { depth--; }
        else if (str[i] === ',' && depth === 0) { return i; }
    }
    return -1;
}
