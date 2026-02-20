"use strict";
// ============================================================
// src/services/parameterValidator.ts
// Schema-based parameter validation for CLI commands.
// Validates types, formats, ranges, mutual exclusion, and
// dependency groups.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateParameter = validateParameter;
exports.validateCommandParameters = validateCommandParameters;
exports.generateUsageString = generateUsageString;
// ── Helpers ───────────────────────────────────────────────────
function createIssue(code, message, options) {
    return {
        severity: 'error',
        code,
        message,
        ...options,
    };
}
function displayName(schema) {
    return schema.label || schema.name;
}
// ── Single-parameter validators ───────────────────────────────
function validateRequired(schema, value) {
    if (!schema.required) {
        return undefined;
    }
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        return createIssue('MISSING_PARAMETER', `Missing required parameter: ${displayName(schema)}`, {
            field: schema.name,
            suggestion: schema.description
                ? `Provide ${displayName(schema)} — ${schema.description}`
                : `Provide a value for ${displayName(schema)}.`,
        });
    }
    return undefined;
}
function validateStringFormat(schema, value) {
    if (schema.type !== 'string' || !schema.pattern) {
        return undefined;
    }
    if (!schema.pattern.test(value)) {
        return createIssue('INVALID_FORMAT', `Invalid format for ${displayName(schema)}: "${value}"`, {
            field: schema.name,
            receivedValue: value,
            expectedValue: schema.patternDescription || schema.pattern.toString(),
            suggestion: schema.patternDescription
                ? `Expected format: ${schema.patternDescription}`
                : `Value must match pattern ${schema.pattern.toString()}.`,
        });
    }
    return undefined;
}
function validateNumericRange(schema, value) {
    if (schema.type !== 'number') {
        return undefined;
    }
    if (schema.min !== undefined && value < schema.min) {
        return createIssue('OUT_OF_RANGE', `${displayName(schema)} must be at least ${schema.min}, got ${value}`, {
            field: schema.name,
            receivedValue: String(value),
            expectedValue: `>= ${schema.min}`,
            suggestion: `Provide a value of at least ${schema.min}.`,
        });
    }
    if (schema.max !== undefined && value > schema.max) {
        return createIssue('OUT_OF_RANGE', `${displayName(schema)} must be at most ${schema.max}, got ${value}`, {
            field: schema.name,
            receivedValue: String(value),
            expectedValue: `<= ${schema.max}`,
            suggestion: `Provide a value of at most ${schema.max}.`,
        });
    }
    return undefined;
}
function validateEnum(schema, value) {
    if (schema.type !== 'enum' || !schema.enumValues || schema.enumValues.length === 0) {
        return undefined;
    }
    const lowerValue = value.toLowerCase();
    const match = schema.enumValues.find(v => v.toLowerCase() === lowerValue);
    if (!match) {
        return createIssue('INVALID_ENUM_VALUE', `Invalid value "${value}" for ${displayName(schema)}`, {
            field: schema.name,
            receivedValue: value,
            expectedValue: schema.enumValues.join(', '),
            suggestion: `Allowed values: ${schema.enumValues.join(', ')}`,
        });
    }
    return undefined;
}
function validateBoolean(schema, value) {
    if (schema.type !== 'boolean') {
        return undefined;
    }
    if (typeof value === 'boolean') {
        return undefined;
    }
    const strValue = String(value).toLowerCase().trim();
    const allowed = new Set(['true', 'false', '1', '0', 'yes', 'no']);
    if (!allowed.has(strValue)) {
        return createIssue('INVALID_BOOLEAN', `Invalid boolean value "${value}" for ${displayName(schema)}`, {
            field: schema.name,
            receivedValue: String(value),
            expectedValue: 'true, false, 1, 0, yes, no',
            suggestion: 'Provide a boolean value: true or false.',
        });
    }
    return undefined;
}
function validateType(schema, value) {
    if (schema.type === 'number') {
        const num = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(num)) {
            return createIssue('INVALID_TYPE', `${displayName(schema)} must be a number, got "${value}"`, {
                field: schema.name,
                receivedValue: String(value),
                expectedValue: 'number',
                suggestion: 'Provide a valid numeric value.',
            });
        }
        return validateNumericRange(schema, num);
    }
    if (schema.type === 'boolean') {
        return validateBoolean(schema, value);
    }
    if (schema.type === 'enum') {
        return validateEnum(schema, String(value));
    }
    if (schema.type === 'string' && typeof value === 'string') {
        return validateStringFormat(schema, value);
    }
    return undefined;
}
// ── Cross-parameter validators ────────────────────────────────
function validateMutualExclusion(schemas, params) {
    const issues = [];
    const checked = new Set();
    for (const schema of schemas) {
        if (!schema.mutuallyExclusiveWith || schema.mutuallyExclusiveWith.length === 0) {
            continue;
        }
        if (params[schema.name] === undefined) {
            continue;
        }
        for (const exclusiveName of schema.mutuallyExclusiveWith) {
            const key = [schema.name, exclusiveName].sort().join('|');
            if (checked.has(key)) {
                continue;
            }
            checked.add(key);
            if (params[exclusiveName] !== undefined) {
                issues.push(createIssue('MUTUALLY_EXCLUSIVE', `Parameters "${displayName(schema)}" and "${exclusiveName}" cannot be used together.`, {
                    field: schema.name,
                    suggestion: `Remove either "${displayName(schema)}" or "${exclusiveName}".`,
                }));
            }
        }
    }
    return issues;
}
function validateDependencies(schemas, params) {
    const issues = [];
    for (const schema of schemas) {
        if (!schema.dependsOn || schema.dependsOn.length === 0) {
            continue;
        }
        if (params[schema.name] === undefined) {
            continue;
        }
        for (const depName of schema.dependsOn) {
            if (params[depName] === undefined) {
                issues.push(createIssue('MISSING_DEPENDENCY', `Parameter "${displayName(schema)}" requires "${depName}" to be specified.`, {
                    field: schema.name,
                    suggestion: `Also provide "${depName}" when using "${displayName(schema)}".`,
                }));
            }
        }
    }
    return issues;
}
function detectUnknownFlags(schema, params) {
    const issues = [];
    const knownNames = new Set();
    for (const s of schema.flags || []) {
        knownNames.add(s.name);
    }
    for (const s of schema.positionalArgs || []) {
        knownNames.add(s.name);
    }
    if (schema.aliases) {
        for (const alias of Object.keys(schema.aliases)) {
            knownNames.add(alias);
        }
    }
    for (const key of Object.keys(params)) {
        if (!knownNames.has(key)) {
            // Build a suggestion with closest match
            const similar = findSimilarFlag(key, knownNames);
            issues.push(createIssue('UNKNOWN_FLAG', `Unknown flag: "${key}"`, {
                severity: 'error',
                field: key,
                suggestion: similar
                    ? `Did you mean "${similar}"? Run with --help for usage.`
                    : `Run with --help to see available options.`,
            }));
        }
    }
    return issues;
}
function findSimilarFlag(input, known) {
    const stripped = input.replace(/^-+/, '');
    let best;
    let bestDistance = Infinity;
    for (const flag of known) {
        const flagStripped = flag.replace(/^-+/, '');
        const dist = levenshtein(stripped, flagStripped);
        if (dist < bestDistance && dist <= 3) {
            bestDistance = dist;
            best = flag;
        }
    }
    return best;
}
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) {
        dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
        dp[0][j] = j;
    }
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}
// ── Public API ────────────────────────────────────────────────
function buildResult(issues) {
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    return {
        valid: errors.length === 0,
        issues,
        errors,
        warnings,
    };
}
/**
 * Validate a single parameter against its schema.
 */
function validateParameter(schema, value) {
    const issues = [];
    const reqIssue = validateRequired(schema, value);
    if (reqIssue) {
        issues.push(reqIssue);
        return buildResult(issues);
    }
    if (value !== undefined && value !== null) {
        const typeIssue = validateType(schema, value);
        if (typeIssue) {
            issues.push(typeIssue);
        }
    }
    return buildResult(issues);
}
/**
 * Validate all parameters for a command against its schema.
 */
function validateCommandParameters(schema, params, logger) {
    const issues = [];
    const allSchemas = [
        ...(schema.positionalArgs || []),
        ...(schema.flags || []),
    ];
    logger?.debug(`[ParameterValidator] Validating ${Object.keys(params).length} parameter(s) against "${schema.name}" schema`);
    // 1. Detect unknown flags
    issues.push(...detectUnknownFlags(schema, params));
    // 2. Resolve aliases
    const resolvedParams = { ...params };
    if (schema.aliases) {
        for (const [alias, canonical] of Object.entries(schema.aliases)) {
            if (resolvedParams[alias] !== undefined && resolvedParams[canonical] === undefined) {
                resolvedParams[canonical] = resolvedParams[alias];
                delete resolvedParams[alias];
            }
        }
    }
    // 3. Validate each known parameter
    for (const paramSchema of allSchemas) {
        const value = resolvedParams[paramSchema.name];
        const result = validateParameter(paramSchema, value);
        issues.push(...result.issues);
    }
    // 4. Cross-parameter checks
    issues.push(...validateMutualExclusion(allSchemas, resolvedParams));
    issues.push(...validateDependencies(allSchemas, resolvedParams));
    const result = buildResult(issues);
    if (!result.valid) {
        logger?.warn(`[ParameterValidator] Validation failed with ${result.errors.length} error(s)`);
    }
    else {
        logger?.debug(`[ParameterValidator] All parameters valid`);
    }
    return result;
}
/**
 * Generate a usage string from a command schema.
 */
function generateUsageString(schema) {
    if (schema.usage) {
        return schema.usage;
    }
    const parts = [`stellar ${schema.name}`];
    for (const arg of schema.positionalArgs || []) {
        parts.push(arg.required ? `<${arg.name}>` : `[${arg.name}]`);
    }
    for (const flag of schema.flags || []) {
        const valuePart = flag.type === 'boolean' ? '' : ` <${flag.name.replace(/^-+/, '')}>`;
        if (flag.required) {
            parts.push(`${flag.name}${valuePart}`);
        }
        else {
            parts.push(`[${flag.name}${valuePart}]`);
        }
    }
    return `Usage: ${parts.join(' ')}`;
}
