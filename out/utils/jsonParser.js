"use strict";
/**
 * Utility functions for parsing JSON input from users.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJson = parseJson;
exports.parseFunctionArgs = parseFunctionArgs;
/**
 * Safely parse JSON string with helpful error messages.
 *
 * @param input - JSON string to parse
 * @returns ParseResult with parsed data or error message
 */
function parseJson(input) {
    if (!input || input.trim().length === 0) {
        return {
            success: false,
            error: 'Input is empty'
        };
    }
    try {
        const parsed = JSON.parse(input.trim());
        return {
            success: true,
            data: parsed
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown parsing error';
        return {
            success: false,
            error: `Invalid JSON: ${message}`
        };
    }
}
/**
 * Parse function arguments from JSON string.
 * Handles both array format and object format.
 *
 * @param input - JSON string representing function arguments
 * @returns ParseResult with parsed arguments array
 */
function parseFunctionArgs(input) {
    const result = parseJson(input);
    if (!result.success) {
        return result;
    }
    // If it's already an array, return as-is
    if (Array.isArray(result.data)) {
        return {
            success: true,
            data: result.data
        };
    }
    // If it's an object, convert to array of values
    if (typeof result.data === 'object' && result.data !== null) {
        return {
            success: true,
            data: Object.values(result.data)
        };
    }
    // Single value - wrap in array
    return {
        success: true,
        data: [result.data]
    };
}
//# sourceMappingURL=jsonParser.js.map