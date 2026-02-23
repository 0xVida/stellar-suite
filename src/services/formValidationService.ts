/**
 * Form validation service for contract function parameters.
 * Validates input types, ranges, and formats before submission.
 */

import type { ValidationResult, ValidationIssue } from '../types/cliValidation';
import type { FunctionParameter } from './contractInspector';
import { validateAddress, validateFunctionName as validateFnName, validateRequired, validateSorobanType } from '../utils/validators/typeValidators';
import { validateJsonObject } from '../utils/validators/formatValidators';
import { buildValidationResult } from '../utils/validators/validationResult';

/**
 * Form validation service.
 * Centralizes validation logic for simulate transaction and deploy flows.
 */
export class FormValidationService {
    /**
     * Validate Stellar contract ID (address format).
     */
    validateContractId(value: string): ValidationResult {
        return validateAddress(value);
    }

    /**
     * Validate Soroban function name.
     */
    validateFunctionName(value: string): ValidationResult {
        return validateFnName(value);
    }

    /**
     * Validate a single parameter value against its metadata.
     */
    validateParameter(value: string | undefined | null, param: FunctionParameter): ValidationResult {
        const issues: ValidationIssue[] = [];
        const field = param.name;

        // Required check
        if (param.required) {
            const requiredResult = validateRequired(value ?? '', field);
            if (!requiredResult.valid) {
                return requiredResult;
            }
        } else {
            // Optional: empty is valid
            const trimmed = value === undefined || value === null ? '' : String(value).trim();
            if (trimmed.length === 0) {
                return { valid: true, issues: [], errors: [], warnings: [] };
            }
        }

        const trimmed = String(value ?? '').trim();

        // Type validation
        if (param.type) {
            const typeResult = validateSorobanType(trimmed, param.type, field);
            if (!typeResult.valid) {
                issues.push(...typeResult.issues);
            }
        }
        // No type metadata: accept any non-empty string (JSON parsing handled at submission)

        return buildValidationResult(issues);
    }

    /**
     * Validate a batch of parameter values.
     */
    validateParameterValues(
        params: FunctionParameter[],
        values: Record<string, string>
    ): ValidationResult {
        const allIssues: ValidationIssue[] = [];
        for (const param of params) {
            const value = values[param.name];
            const result = this.validateParameter(value, param);
            if (!result.valid) {
                allIssues.push(...result.issues);
            }
        }
        return buildValidationResult(allIssues);
    }

    /**
     * Validate raw JSON arguments input.
     */
    validateJsonArgs(value: string | undefined | null): ValidationResult {
        return validateJsonObject(value ?? '', 'arguments');
    }

    /**
     * Get a VS Code validateInput-compatible callback for contract ID.
     * Returns undefined when valid, error message string when invalid.
     */
    getContractIdValidator(): (value: string) => string | undefined {
        return (value: string) => this.toValidateInputMessage(this.validateContractId(value));
    }

    /**
     * Get a VS Code validateInput-compatible callback for function name.
     */
    getFunctionNameValidator(): (value: string) => string | undefined {
        return (value: string) => this.toValidateInputMessage(this.validateFunctionName(value));
    }

    /**
     * Get a VS Code validateInput-compatible callback for a parameter.
     */
    getParameterValidator(param: FunctionParameter): (value: string) => string | undefined {
        return (value: string) => this.toValidateInputMessage(this.validateParameter(value, param));
    }

    /**
     * Get a VS Code validateInput-compatible callback for raw JSON args.
     */
    getJsonArgsValidator(): (value: string) => string | undefined {
        return (value: string) => this.toValidateInputMessage(this.validateJsonArgs(value));
    }

    /**
     * Convert ValidationResult to VS Code validateInput return type.
     * Returns undefined if valid, first error message if invalid.
     */
    toValidateInputMessage(result: ValidationResult): string | undefined {
        if (result.valid) return undefined;
        return result.errors[0]?.message ?? result.issues[0]?.message ?? 'Invalid value';
    }
}

/** Singleton instance for convenience. */
let _instance: FormValidationService | null = null;

/**
 * Get the shared FormValidationService instance.
 */
export function getFormValidationService(): FormValidationService {
    if (!_instance) {
        _instance = new FormValidationService();
    }
    return _instance;
}
