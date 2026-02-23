/**
 * Range validators for form inputs.
 * Validates numeric ranges and string length constraints.
 */

import type { ValidationResult } from '../../types/cliValidation';
import { createErrorIssue, buildValidationResult, validResult, invalidResult } from './validationResult';

/**
 * Validate a number is within optional min/max bounds.
 */
export function validateNumberRange(
    value: number,
    options?: { min?: number; max?: number; field?: string }
): ValidationResult {
    const { min, max, field = 'value' } = options || {};
    if (min !== undefined && value < min) {
        return invalidResult('BELOW_MIN', `Value must be at least ${min}`, {
            field,
            receivedValue: String(value),
            expectedValue: `min ${min}`,
        });
    }
    if (max !== undefined && value > max) {
        return invalidResult('ABOVE_MAX', `Value must be at most ${max}`, {
            field,
            receivedValue: String(value),
            expectedValue: `max ${max}`,
        });
    }
    return validResult();
}

/**
 * Validate string length is within optional min/max.
 */
export function validateStringLength(
    value: string,
    options?: { min?: number; max?: number; field?: string }
): ValidationResult {
    const { min, max, field = 'value' } = options || {};
    const len = value.length;
    if (min !== undefined && len < min) {
        return invalidResult('TOO_SHORT', `Value must be at least ${min} characters`, {
            field,
            expectedValue: `min length ${min}`,
        });
    }
    if (max !== undefined && len > max) {
        return invalidResult('TOO_LONG', `Value must be at most ${max} characters`, {
            field,
            expectedValue: `max length ${max}`,
        });
    }
    return validResult();
}

/**
 * Get min/max bounds for a Soroban integer type.
 */
export function getSorobanIntegerBounds(type: string): { min?: number; max?: number } {
    const t = type.toLowerCase();
    switch (t) {
        case 'u32':
            return { min: 0, max: 2 ** 32 - 1 };
        case 'i32':
            return { min: -(2 ** 31), max: 2 ** 31 - 1 };
        case 'u64':
        case 'u128':
        case 'i64':
        case 'i128':
            // BigInt ranges - caller should use BigInt validation
            return {};
        default:
            return {};
    }
}
