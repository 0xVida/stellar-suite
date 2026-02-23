/**
 * Helper utilities for building ValidationResult from ValidationIssues.
 */

import type { ValidationResult, ValidationIssue } from '../../types/cliValidation';

/**
 * Create a ValidationIssue with error severity.
 */
export function createErrorIssue(
    code: string,
    message: string,
    options?: { field?: string; receivedValue?: string; expectedValue?: string; suggestion?: string }
): ValidationIssue {
    return {
        severity: 'error',
        code,
        message,
        ...options,
    };
}

/**
 * Build a ValidationResult from an array of issues.
 */
export function buildValidationResult(issues: ValidationIssue[]): ValidationResult {
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning' || i.severity === 'info');
    return {
        valid: errors.length === 0,
        issues,
        errors,
        warnings,
    };
}

/**
 * Return a valid empty result.
 */
export function validResult(): ValidationResult {
    return {
        valid: true,
        issues: [],
        errors: [],
        warnings: [],
    };
}

/**
 * Return a failed result with a single error.
 */
export function invalidResult(
    code: string,
    message: string,
    options?: { field?: string; receivedValue?: string; expectedValue?: string }
): ValidationResult {
    const issue = createErrorIssue(code, message, options);
    return buildValidationResult([issue]);
}
