/**
 * Type validators for form inputs.
 * Validates Soroban/Stellar types: Address, u32, i128, String, Bool, Symbol, etc.
 */

import type { ValidationResult } from '../../types/cliValidation';
import {
    createErrorIssue,
    buildValidationResult,
    validResult,
    invalidResult,
} from './validationResult';

/** Stellar contract ID format: C followed by 55 base32 chars (A-Z, 2-7) */
const CONTRACT_ID_REGEX = /^C[A-Z2-7]{55}$/;

/** Stellar contract ID format (legacy, more permissive): C followed by 55 alphanumeric */
const CONTRACT_ID_REGEX_LEGACY = /^C[A-Z0-9]{55}$/;

/** Function name: identifier starting with letter or underscore */
const FUNCTION_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Soroban unsigned integer max values by type */
const U32_MAX = 2 ** 32 - 1;
const U64_MAX = BigInt('18446744073709551615');
const U128_MAX = BigInt('340282366920938463463374607431768211455');

/** Soroban signed integer bounds */
const I32_MIN = -(2 ** 31);
const I32_MAX = 2 ** 31 - 1;
const I64_MIN = BigInt('-9223372036854775808');
const I64_MAX = BigInt('9223372036854775807');
const I128_MIN = BigInt('-170141183460469231731687303715884105728');
const I128_MAX = BigInt('170141183460469231731687303715884105727');

/**
 * Validate Stellar contract ID (address format).
 * Uses strkey format: C followed by 55 base32 chars (A-Z, 2-7).
 */
export function validateAddress(value: string): ValidationResult {
    if (value === undefined || value === null) {
        return invalidResult('MISSING_VALUE', 'Address is required', { field: 'address' });
    }
    const trimmed = String(value).trim();
    if (trimmed.length === 0) {
        return invalidResult('MISSING_VALUE', 'Address is required', { field: 'address' });
    }
    const normalized = trimmed.toUpperCase();
    if (!CONTRACT_ID_REGEX.test(normalized)) {
        // Fallback: some inputs may use 0-9
        if (!CONTRACT_ID_REGEX_LEGACY.test(normalized)) {
            return invalidResult('INVALID_ADDRESS_FORMAT', 'Invalid contract ID format (should start with C and be 56 characters)', {
                field: 'address',
                receivedValue: trimmed,
                expectedValue: 'C[A-Z2-7]{55}',
            });
        }
    }
    return validResult();
}

/**
 * Validate Soroban function name.
 * Must match: ^[a-zA-Z_][a-zA-Z0-9_]*$
 */
export function validateFunctionName(value: string): ValidationResult {
    if (value === undefined || value === null) {
        return invalidResult('MISSING_VALUE', 'Function name is required', { field: 'functionName' });
    }
    const trimmed = String(value).trim();
    if (trimmed.length === 0) {
        return invalidResult('MISSING_VALUE', 'Function name is required', { field: 'functionName' });
    }
    if (!FUNCTION_NAME_REGEX.test(trimmed)) {
        return invalidResult('INVALID_FUNCTION_NAME', 'Function name must start with a letter or underscore and contain only letters, numbers, and underscores', {
            field: 'functionName',
            receivedValue: trimmed,
        });
    }
    return validResult();
}

/**
 * Check if a required field has a value.
 */
export function validateRequired(value: string | undefined | null, fieldName: string): ValidationResult {
    if (value === undefined || value === null) {
        return invalidResult('MISSING_REQUIRED', `${fieldName} is required`, { field: fieldName });
    }
    const trimmed = String(value).trim();
    if (trimmed.length === 0) {
        return invalidResult('MISSING_REQUIRED', `${fieldName} is required`, { field: fieldName });
    }
    return validResult();
}

/**
 * Normalize Soroban type string from CLI help (e.g. "<ADDRESS>", "u32", "<STRING>").
 */
function normalizeSorobanType(typeStr: string): string {
    if (!typeStr || typeof typeStr !== 'string') return '';
    const t = typeStr.trim().toLowerCase();
    const match = t.match(/<([^>]+)>/);
    if (match) return match[1];
    return t;
}

/**
 * Validate value against a Soroban type from CLI help.
 */
export function validateSorobanType(value: string, typeStr: string, fieldName?: string): ValidationResult {
    const issues: import('../../types/cliValidation').ValidationIssue[] = [];
    const field = fieldName || 'parameter';
    const trimmed = value === undefined || value === null ? '' : String(value).trim();

    const type = normalizeSorobanType(typeStr);

    // Optional empty value
    if (trimmed.length === 0) {
        return validResult();
    }

    // Address
    if (type === 'address') {
        const addrResult = validateAddress(trimmed);
        if (!addrResult.valid) {
            addrResult.issues.forEach((i) => issues.push({ ...i, field }));
        }
    }
    // Unsigned integers
    else if (type === 'u32' || type === 'u64' || type === 'u128') {
        const numResult = validateUnsignedInteger(trimmed, type, field);
        if (!numResult.valid) {
            issues.push(...numResult.issues);
        }
    }
    // Signed integers
    else if (type === 'i32' || type === 'i64' || type === 'i128') {
        const numResult = validateSignedInteger(trimmed, type, field);
        if (!numResult.valid) {
            issues.push(...numResult.issues);
        }
    }
    // Bool
    else if (type === 'bool' || type === 'boolean') {
        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed !== 'boolean') {
                issues.push(createErrorIssue('INVALID_BOOL', 'Expected boolean (true or false)', { field, receivedValue: trimmed }));
            }
        } catch {
            issues.push(createErrorIssue('INVALID_JSON', 'Invalid JSON for boolean. Use true or false', { field, receivedValue: trimmed }));
        }
    }
    // String, Symbol
    else if (type === 'string' || type === 'symbol') {
        // Any non-empty string is fine; symbol typically expects non-empty
        if (type === 'symbol' && trimmed.length === 0) {
            issues.push(createErrorIssue('INVALID_SYMBOL', 'Symbol cannot be empty', { field }));
        }
    }
    // Vec, Map, Option, or unknown - attempt JSON parse
    else {
        try {
            JSON.parse(trimmed);
        } catch {
            issues.push(createErrorIssue('INVALID_JSON', `Invalid JSON for type ${type || 'unknown'}`, { field, receivedValue: trimmed }));
        }
    }

    return buildValidationResult(issues);
}

function validateUnsignedInteger(value: string, type: string, field: string): ValidationResult {
    let num: number | bigint;
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'number') {
            if (!Number.isInteger(parsed) || parsed < 0) {
                return invalidResult('INVALID_UINT', `Expected non-negative integer for ${type}`, { field, receivedValue: value });
            }
            num = parsed;
        } else if (typeof parsed === 'string' && /^\d+$/.test(parsed)) {
            num = BigInt(parsed);
        } else {
            return invalidResult('INVALID_UINT', `Expected integer for ${type}`, { field, receivedValue: value });
        }
    } catch {
        return invalidResult('INVALID_JSON', `Invalid number for ${type}`, { field, receivedValue: value });
    }

    if (type === 'u32') {
        if ((typeof num === 'number' ? num : Number(num)) > U32_MAX) {
            return invalidResult('OUT_OF_RANGE', `u32 must be 0 to ${U32_MAX}`, { field, receivedValue: value, expectedValue: `0-${U32_MAX}` });
        }
    } else if (type === 'u64' || type === 'u128') {
        const big = typeof num === 'bigint' ? num : BigInt(num);
        const max = type === 'u64' ? U64_MAX : U128_MAX;
        if (big < 0n || big > max) {
            return invalidResult('OUT_OF_RANGE', `${type} must be 0 to ${max}`, { field, receivedValue: value });
        }
    }

    return validResult();
}

function validateSignedInteger(value: string, type: string, field: string): ValidationResult {
    let num: number | bigint;
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'number') {
            if (!Number.isInteger(parsed)) {
                return invalidResult('INVALID_INT', `Expected integer for ${type}`, { field, receivedValue: value });
            }
            num = parsed;
        } else if (typeof parsed === 'string' && /^-?\d+$/.test(parsed)) {
            num = BigInt(parsed);
        } else {
            return invalidResult('INVALID_INT', `Expected integer for ${type}`, { field, receivedValue: value });
        }
    } catch {
        return invalidResult('INVALID_JSON', `Invalid number for ${type}`, { field, receivedValue: value });
    }

    if (type === 'i32') {
        const n = typeof num === 'number' ? num : Number(num);
        if (n < I32_MIN || n > I32_MAX) {
            return invalidResult('OUT_OF_RANGE', `i32 must be ${I32_MIN} to ${I32_MAX}`, { field, receivedValue: value });
        }
    } else if (type === 'i64' || type === 'i128') {
        const big = typeof num === 'bigint' ? num : BigInt(num);
        const [min, max] = type === 'i64' ? [I64_MIN, I64_MAX] : [I128_MIN, I128_MAX];
        if (big < min || big > max) {
            return invalidResult('OUT_OF_RANGE', `${type} out of range`, { field, receivedValue: value });
        }
    }

    return validResult();
}
