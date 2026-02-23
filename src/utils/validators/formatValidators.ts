/**
 * Format validators for form inputs.
 * Validates JSON structures, address format, etc.
 */

import type { ValidationResult } from '../../types/cliValidation';
import { createErrorIssue, buildValidationResult, validResult, invalidResult } from './validationResult';
import { validateAddress as validateAddressFormat } from './typeValidators';

/**
 * Validate that a string is valid JSON and parses to an object (not array or primitive).
 */
export function validateJsonObject(value: string, field?: string): ValidationResult {
    if (value === undefined || value === null) {
        return invalidResult('MISSING_VALUE', 'JSON object is required', { field: field || 'json' });
    }
    const trimmed = String(value).trim();
    if (trimmed.length === 0) {
        return invalidResult('MISSING_VALUE', 'JSON object is required', { field: field || 'json' });
    }
    try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return invalidResult('INVALID_JSON_OBJECT', 'Arguments must be a JSON object', {
                field: field || 'json',
                receivedValue: trimmed.substring(0, 100),
            });
        }
        return validResult();
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid JSON';
        return invalidResult('INVALID_JSON', `Invalid JSON: ${msg}`, {
            field: field || 'json',
            receivedValue: trimmed.substring(0, 100),
        });
    }
}

/**
 * Validate that a string is valid JSON (any value).
 */
export function validateJsonValue(value: string, field?: string): ValidationResult {
    if (value === undefined || value === null) {
        return validResult(); // Empty is ok for optional
    }
    const trimmed = String(value).trim();
    if (trimmed.length === 0) {
        return validResult();
    }
    try {
        JSON.parse(trimmed);
        return validResult();
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid JSON';
        return invalidResult('INVALID_JSON', `Invalid JSON: ${msg}`, {
            field: field || 'json',
            receivedValue: trimmed.substring(0, 100),
        });
    }
}

/**
 * Validate Stellar contract address format.
 * Re-exports type validator for consistency.
 */
export function validateAddress(value: string): ValidationResult {
    return validateAddressFormat(value);
}
