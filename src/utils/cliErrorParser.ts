export type CliErrorType = 'network' | 'validation' | 'execution' | 'unknown';

export type CliErrorFormat = 'json' | 'plain' | 'unknown';

export interface CliErrorContext {
    command?: string;
    contractId?: string;
    functionName?: string;
    network?: string;
    transactionHash?: string;
}

export interface ParsedCliError {
    raw: string;
    normalized: string;
    format: CliErrorFormat;
    type: CliErrorType;
    code?: string;
    message: string;
    details?: string;
    context: CliErrorContext;
    suggestions: string[];
    malformed: boolean;
}

interface JsonErrorPayload {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    error?: unknown;
    hint?: unknown;
}

const NETWORK_KEYWORDS = [
    'econnrefused',
    'enotfound',
    'network',
    'connection',
    'timeout',
    'timed out',
    'unreachable',
    'dns',
    'tls',
    'certificate',
    'rpc',
];

const VALIDATION_KEYWORDS = [
    'invalid',
    'missing',
    'required',
    'expected',
    'unexpected',
    'malformed',
    'argument',
    'usage:',
    'unknown option',
    'unrecognized option',
    'contract id',
    'wasm file not found',
];

const EXECUTION_KEYWORDS = [
    'execution failed',
    'simulate failed',
    'simulation failed',
    'hosterror',
    'panic',
    'panicked',
    'trap',
    'transaction failed',
    'authorization',
    'insufficient',
    'reverted',
];

function stripAnsi(input: string): string {
    return input.replace(/\u001b\[[0-9;]*m/g, '');
}

function normalizeOutput(rawOutput: string): string {
    return stripAnsi(rawOutput)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();
}

function parseJsonPayload(normalized: string): JsonErrorPayload | undefined {
    if (!normalized) {
        return undefined;
    }

    const direct = tryParseJson(normalized);
    if (direct && typeof direct === 'object') {
        return direct as JsonErrorPayload;
    }

    const objectMatch = normalized.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
        return undefined;
    }

    const extracted = tryParseJson(objectMatch[0]);
    if (extracted && typeof extracted === 'object') {
        return extracted as JsonErrorPayload;
    }

    return undefined;
}

function tryParseJson(value: string): unknown | undefined {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function pickString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : undefined;
}

function firstNonEmptyLine(input: string): string | undefined {
    const lines = input.split('\n').map(line => line.trim()).filter(Boolean);
    return lines[0];
}

function extractMessage(normalized: string, payload: JsonErrorPayload | undefined): string {
    if (payload) {
        const payloadError = payload.error;
        if (typeof payloadError === 'object' && payloadError !== null) {
            const nestedMessage = pickString((payloadError as JsonErrorPayload).message);
            if (nestedMessage) {
                return nestedMessage;
            }
            const nestedErrorText = pickString((payloadError as JsonErrorPayload).error);
            if (nestedErrorText) {
                return nestedErrorText;
            }
        }

        const payloadMessage = pickString(payload.message);
        if (payloadMessage) {
            return payloadMessage;
        }

        const payloadErrorText = pickString(payload.error);
        if (payloadErrorText) {
            return payloadErrorText;
        }
    }

    const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
        if (/(error|failed|panic|exception)/i.test(line)) {
            return line;
        }
    }

    return firstNonEmptyLine(normalized) || 'Stellar CLI execution failed.';
}

function extractCode(normalized: string, payload: JsonErrorPayload | undefined): string | undefined {
    if (payload) {
        const payloadError = payload.error;
        if (typeof payloadError === 'object' && payloadError !== null) {
            const nestedCode = pickString((payloadError as JsonErrorPayload).code);
            if (nestedCode) {
                return nestedCode;
            }
        }

        const payloadCode = payload.code;
        if (typeof payloadCode === 'string' && payloadCode.trim()) {
            return payloadCode.trim();
        }
        if (typeof payloadCode === 'number') {
            return String(payloadCode);
        }
    }

    const hostCode = normalized.match(/Error\([^,]+,\s*#(\d+)\)/i);
    if (hostCode) {
        return `HOST_${hostCode[1]}`;
    }

    const errnoCode = normalized.match(/\b(E[A-Z0-9_]{2,})\b/);
    if (errnoCode) {
        return errnoCode[1];
    }

    const namedCode = normalized.match(/\b([A-Z]{2,}[A-Z0-9]*_[A-Z0-9_]+)\b/);
    if (namedCode) {
        return namedCode[1];
    }

    const httpCode = normalized.match(/\b([45]\d{2})\b/);
    if (httpCode) {
        return httpCode[1];
    }

    return undefined;
}

function extractDetails(normalized: string, payload: JsonErrorPayload | undefined, message: string): string | undefined {
    if (payload) {
        const payloadError = payload.error;
        if (typeof payloadError === 'object' && payloadError !== null) {
            const nestedDetails = pickString((payloadError as JsonErrorPayload).details);
            if (nestedDetails) {
                return nestedDetails;
            }
            const nestedHint = pickString((payloadError as JsonErrorPayload).hint);
            if (nestedHint) {
                return nestedHint;
            }
        }

        const payloadDetails = pickString(payload.details);
        if (payloadDetails) {
            return payloadDetails;
        }

        const payloadHint = pickString(payload.hint);
        if (payloadHint) {
            return payloadHint;
        }
    }

    const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length <= 1) {
        return undefined;
    }

    const remaining = lines.filter(line => line !== message);
    return remaining.length > 0 ? remaining.join('\n') : undefined;
}

function inferType(normalized: string, message: string, code?: string): CliErrorType {
    const haystack = `${normalized}\n${message}\n${code || ''}`.toLowerCase();

    if (NETWORK_KEYWORDS.some(keyword => haystack.includes(keyword))) {
        return 'network';
    }
    if (VALIDATION_KEYWORDS.some(keyword => haystack.includes(keyword))) {
        return 'validation';
    }
    if (EXECUTION_KEYWORDS.some(keyword => haystack.includes(keyword))) {
        return 'execution';
    }

    return 'unknown';
}

function extractContext(normalized: string, baseContext?: CliErrorContext): CliErrorContext {
    const context: CliErrorContext = {
        command: baseContext?.command,
        contractId: baseContext?.contractId,
        functionName: baseContext?.functionName,
        network: baseContext?.network,
        transactionHash: baseContext?.transactionHash,
    };

    if (!context.contractId) {
        const contractMatch = normalized.match(/\b(C[A-Z0-9]{55})\b/);
        if (contractMatch) {
            context.contractId = contractMatch[1];
        }
    }

    if (!context.transactionHash) {
        const txMatch = normalized.match(/\b([a-f0-9]{64})\b/i);
        if (txMatch) {
            context.transactionHash = txMatch[1];
        }
    }

    if (!context.network) {
        const networkMatch = normalized.match(/\b(testnet|mainnet|futurenet)\b/i);
        if (networkMatch) {
            context.network = networkMatch[1].toLowerCase();
        }
    }

    return context;
}

export function getCliErrorSuggestions(parsedError: ParsedCliError): string[] {
    const suggestions = new Set<string>();
    const haystack = `${parsedError.normalized}\n${parsedError.message}\n${parsedError.code || ''}`.toLowerCase();

    if (haystack.includes('enoent') || haystack.includes('not found') || haystack.includes('command not found')) {
        suggestions.add('Verify Stellar CLI is installed and `stellarSuite.cliPath` points to the executable.');
    }
    if (haystack.includes('wasm file not found')) {
        suggestions.add('Build the contract again and confirm the selected WASM path exists.');
    }
    if (haystack.includes('contract id') && haystack.includes('invalid')) {
        suggestions.add('Check the contract ID format. It should start with `C` and be 56 characters.');
    }
    if (haystack.includes('authorization') || haystack.includes('signature')) {
        suggestions.add('Check that the selected source account has the required permissions and signatures.');
    }
    if (haystack.includes('insufficient')) {
        suggestions.add('Fund the source account and retry the operation.');
    }

    if (parsedError.type === 'network') {
        suggestions.add('Confirm your network value and RPC connectivity, then retry.');
        suggestions.add('If this is intermittent, retry with a longer timeout.');
    } else if (parsedError.type === 'validation') {
        suggestions.add('Validate CLI flags and argument values (`stellar contract invoke --help`).');
    } else if (parsedError.type === 'execution') {
        suggestions.add('Inspect contract logic, state, and auth requirements for this invocation.');
    } else {
        suggestions.add('Review the detailed CLI output for additional clues and retry with verbose logging.');
    }

    return Array.from(suggestions);
}

function typeLabel(type: CliErrorType): string {
    if (type === 'network') {
        return 'Network';
    }
    if (type === 'validation') {
        return 'Validation';
    }
    if (type === 'execution') {
        return 'Execution';
    }
    return 'Unknown';
}

function formatContextSummary(context: CliErrorContext): string | undefined {
    const parts: string[] = [];
    if (context.command) {
        parts.push(`command=${context.command}`);
    }
    if (context.network) {
        parts.push(`network=${context.network}`);
    }
    if (context.contractId) {
        parts.push(`contract=${context.contractId}`);
    }
    if (context.functionName) {
        parts.push(`fn=${context.functionName}`);
    }
    if (context.transactionHash) {
        parts.push(`tx=${context.transactionHash}`);
    }

    return parts.length > 0 ? parts.join(', ') : undefined;
}

export function formatCliErrorForDisplay(parsedError: ParsedCliError): string {
    const lines: string[] = [
        `Stellar CLI ${typeLabel(parsedError.type)} Error`,
        parsedError.message,
    ];

    if (parsedError.code) {
        lines.push(`Code: ${parsedError.code}`);
    }

    const contextSummary = formatContextSummary(parsedError.context);
    if (contextSummary) {
        lines.push(`Context: ${contextSummary}`);
    }

    if (parsedError.details) {
        lines.push(`Details: ${parsedError.details}`);
    }

    if (parsedError.suggestions.length > 0) {
        lines.push('Suggestions:');
        for (const suggestion of parsedError.suggestions) {
            lines.push(`- ${suggestion}`);
        }
    }

    return lines.join('\n');
}

export function formatCliErrorForNotification(parsedError: ParsedCliError): string {
    const codeText = parsedError.code ? ` (${parsedError.code})` : '';
    return `${typeLabel(parsedError.type)} error${codeText}: ${parsedError.message}`;
}

export function logCliError(parsedError: ParsedCliError, prefix: string = '[CLI Error]'): void {
    const contextSummary = formatContextSummary(parsedError.context) || 'none';
    console.error(`${prefix} type=${parsedError.type} code=${parsedError.code || 'n/a'} context=${contextSummary}`);
    if (parsedError.details) {
        console.error(`${prefix} details=${parsedError.details}`);
    }
}

export function parseCliErrorOutput(rawOutput: string, baseContext?: CliErrorContext): ParsedCliError {
    const normalized = normalizeOutput(rawOutput);

    if (!normalized) {
        const emptyError: ParsedCliError = {
            raw: rawOutput,
            normalized: '',
            format: 'unknown',
            type: 'unknown',
            message: 'Stellar CLI returned an empty error response.',
            context: extractContext('', baseContext),
            suggestions: [
                'Retry the command with verbose logging to capture more details.',
                'Check VS Code output logs for stderr from Stellar CLI.',
            ],
            malformed: true,
        };
        return emptyError;
    }

    const jsonPayload = parseJsonPayload(normalized);
    const message = extractMessage(normalized, jsonPayload);
    const code = extractCode(normalized, jsonPayload);
    const type = inferType(normalized, message, code);
    const details = extractDetails(normalized, jsonPayload, message);
    const context = extractContext(normalized, baseContext);

    const parsedError: ParsedCliError = {
        raw: rawOutput,
        normalized,
        format: jsonPayload ? 'json' : 'plain',
        type,
        code,
        message,
        details,
        context,
        suggestions: [],
        malformed: false,
    };

    parsedError.suggestions = getCliErrorSuggestions(parsedError);
    return parsedError;
}

export function looksLikeCliError(output: string): boolean {
    const normalized = normalizeOutput(output);
    if (!normalized) {
        return false;
    }

    if (/(error|failed|panic|exception|enoent)/i.test(normalized)) {
        return true;
    }

    const payload = parseJsonPayload(normalized);
    if (!payload) {
        return false;
    }

    return Boolean(
        payload.error !== undefined
        || payload.message !== undefined
        || payload.code !== undefined
    );
}
