// src/services/formValidationService.ts
// Validates form submission data against parsed ABI parameters.
// No vscode dependency — pure TypeScript service.

import { AbiParameter, SorobanType } from '../utils/abiParser';
import { InputSanitizationService } from './inputSanitizationService';

// ── Interfaces ────────────────────────────────────────────────

export interface FormValidationResult {
    valid: boolean;
    errors: Record<string, string>;          // paramName → error message
    warnings: Record<string, string>;        // paramName → warning message
    sanitizedArgs: Record<string, unknown>;  // cleaned values ready for CLI
}

// ── Service ───────────────────────────────────────────────────

export class FormValidationService {

    /**
     * Validate all fields in formData against the declared AbiParameter[].
     *
     * @param formData             - Raw string values from the webview FormData
     * @param params               - AbiParameter[] for the contract function
     * @param sanitizationService  - Shared InputSanitizationService instance
     * @returns FormValidationResult
     */
    validate(
        formData: Record<string, string>,
        params: AbiParameter[],
        sanitizationService: InputSanitizationService
    ): FormValidationResult {
        const errors: Record<string, string> = {};
        const warnings: Record<string, string> = {};
        const sanitizedArgs: Record<string, unknown> = {};

        for (const param of params) {
            const rawValue = formData[param.name] ?? '';
            const result = this.validateField(
                param.name,
                rawValue,
                param.sorobanType,
                param.required,
                sanitizationService
            );

            if (result.error) {
                errors[param.name] = result.error;
            }
            if (result.warning) {
                warnings[param.name] = result.warning;
            }
            // Only add to sanitizedArgs if there is a value (skip empty optionals)
            if (result.value !== undefined) {
                sanitizedArgs[param.name] = result.value;
            }
        }

        return {
            valid: Object.keys(errors).length === 0,
            errors,
            warnings,
            sanitizedArgs,
        };
    }

    // ── Private: Per-field Validation ─────────────────────────

    private validateField(
        name: string,
        rawValue: string,
        type: SorobanType,
        required: boolean,
        sanitizationService: InputSanitizationService
    ): { error?: string; warning?: string; value?: unknown } {

        // Handle Option<T> — empty string means "None", omit from args
        if (type.kind === 'option') {
            if (rawValue.trim() === '') {
                return { value: undefined };
            }
            // Validate the non-empty value as the inner type (not required)
            return this.validateField(name, rawValue, type.inner, false, sanitizationService);
        }

        // Empty required field
        if (required && rawValue.trim() === '') {
            return { error: `"${name}" is required.` };
        }

        // Empty optional field — skip
        if (!required && rawValue.trim() === '') {
            return { value: undefined };
        }

        return this.validateByType(name, rawValue.trim(), type, sanitizationService);
    }

    private validateByType(
        name: string,
        value: string,
        type: SorobanType,
        sanitizationService: InputSanitizationService
    ): { error?: string; warning?: string; value?: unknown } {

        switch (type.kind) {
            case 'primitive':
                return this.validatePrimitive(name, value, type.name, sanitizationService);

            case 'vec':
            case 'map':
            case 'custom': {
                const jsonResult = sanitizationService.sanitizeJson(value, { field: name });
                if (!jsonResult.valid) {
                    return { error: `"${name}": ${jsonResult.errors[0] ?? 'Invalid JSON.'}` };
                }
                try {
                    return { value: JSON.parse(jsonResult.sanitizedValue) };
                } catch {
                    return { error: `"${name}": Invalid JSON.` };
                }
            }

            case 'option':
                // Already handled above
                return { value: undefined };
        }
    }

    private validatePrimitive(
        name: string,
        value: string,
        typeName: string,
        sanitizationService: InputSanitizationService
    ): { error?: string; warning?: string; value?: unknown } {

        switch (typeName) {
            case 'bool': {
                if (value !== 'true' && value !== 'false') {
                    return { error: `"${name}": Must be "true" or "false".` };
                }
                return { value: value === 'true' };
            }

            case 'u32': {
                const n = parseInt(value, 10);
                if (isNaN(n) || !Number.isInteger(Number(value)) || n < 0 || n > 4294967295) {
                    return { error: `"${name}": Must be an unsigned 32-bit integer (0–4294967295).` };
                }
                return { value: n };
            }

            case 'i32': {
                const n = parseInt(value, 10);
                if (isNaN(n) || !Number.isInteger(Number(value)) || n < -2147483648 || n > 2147483647) {
                    return { error: `"${name}": Must be a signed 32-bit integer (−2147483648–2147483647).` };
                }
                return { value: n };
            }

            case 'u64': case 'u128': case 'u256': {
                if (!/^\d+$/.test(value)) {
                    return { error: `"${name}": Must be a valid ${typeName} (non-negative integer).` };
                }
                const asNum = Number(value);
                const warn = !Number.isSafeInteger(asNum)
                    ? `Value exceeds JS safe integer range; passed as string to CLI.`
                    : undefined;
                return { warning: warn, value: Number.isSafeInteger(asNum) ? asNum : value };
            }

            case 'i64': case 'i128': case 'i256': {
                if (!/^-?\d+$/.test(value)) {
                    return { error: `"${name}": Must be a valid ${typeName} integer.` };
                }
                const asNum = Number(value);
                const warn = !Number.isSafeInteger(asNum)
                    ? `Value exceeds JS safe integer range; passed as string to CLI.`
                    : undefined;
                return { warning: warn, value: Number.isSafeInteger(asNum) ? asNum : value };
            }

            case 'String': case 'Symbol': {
                const r = sanitizationService.sanitizeString(value, { field: name, maxLength: 1024 });
                if (!r.valid) {
                    return { error: `"${name}": ${r.errors[0]}` };
                }
                return { value: r.sanitizedValue };
            }

            case 'Bytes': case 'BytesN': {
                if (!/^[0-9a-fA-F]*$/.test(value)) {
                    return { error: `"${name}": Must be a hex-encoded string (characters 0–9, a–f).` };
                }
                if (value.length % 2 !== 0) {
                    return { error: `"${name}": Hex string must have an even number of characters.` };
                }
                return { value: value.toLowerCase() };
            }

            case 'Address': {
                // Accept C... (contract) or G... (account) addresses — 56 chars total
                const upper = value.toUpperCase();
                const isContract = /^C[A-Z0-9]{55}$/.test(upper);
                const isAccount  = /^G[A-Z0-9]{55}$/.test(upper);
                if (!isContract && !isAccount) {
                    return {
                        error: `"${name}": Must be a valid Stellar address (G... account or C... contract, 56 characters).`
                    };
                }
                return { value: upper };
            }

            default:
                // Unknown primitive — pass through as string
                return { value };
        }
    }
}
