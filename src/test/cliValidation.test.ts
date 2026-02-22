// ============================================================
// src/test/cliValidation.test.ts
// Comprehensive unit tests for the CLI validation and
// pre-flight check system.
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number; env: Record<string, string | undefined>; version: string };

const assert = require('assert');

import {
    CommandSchema,
    ParameterSchema,
    ValidationResult,
    PreFlightCheckResult,
} from '../types/cliValidation';

import {
    validateParameter,
    validateCommandParameters,
    generateUsageString,
} from '../services/parameterValidator';

import {
    validateEnvironment,
} from '../services/environmentValidator';

import {
    validateFilePath,
    validateFilePaths,
    FileValidationRule,
} from '../services/fileValidator';

import {
    CommandSyntaxCheck,
    CliAvailabilityCheck,
    EnvironmentCheck,
    FileValidationCheck,
    NetworkConnectivityCheck,
    runPreFlightChecks,
    formatPreFlightReport,
} from '../services/preFlightCheckService';

import {
    COMMAND_SCHEMAS,
    validateCommand,
    formatValidationResult,
    ConsoleValidationLogger,
} from '../services/cliValidationService';

// ── Silent logger for tests ───────────────────────────────────

const silentLogger = {
    info: () => { },
    warn: () => { },
    error: () => { },
    debug: () => { },
};

// ── Test runner ───────────────────────────────────────────────

type TestFn = () => Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn) {
    tests.push({ name, fn });
}

// ═══════════════════════════════════════════════════════════════
// Parameter Validator Tests
// ═══════════════════════════════════════════════════════════════

test('validateParameter: required parameter present passes', async () => {
    const schema: ParameterSchema = { name: 'id', type: 'string', required: true };
    const result = validateParameter(schema, 'some-value');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
});

test('validateParameter: required parameter missing fails', async () => {
    const schema: ParameterSchema = { name: 'id', type: 'string', required: true };
    const result = validateParameter(schema, undefined);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].code, 'MISSING_PARAMETER');
});

test('validateParameter: required parameter empty string fails', async () => {
    const schema: ParameterSchema = { name: 'id', type: 'string', required: true };
    const result = validateParameter(schema, '   ');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors[0].code, 'MISSING_PARAMETER');
});

test('validateParameter: optional parameter missing passes', async () => {
    const schema: ParameterSchema = { name: 'label', type: 'string', required: false };
    const result = validateParameter(schema, undefined);
    assert.strictEqual(result.valid, true);
});

test('validateParameter: string format valid matches pattern', async () => {
    const schema: ParameterSchema = {
        name: 'contractId',
        type: 'string',
        required: true,
        pattern: /^C[A-Z0-9]{55}$/,
        patternDescription: '56-char contract ID starting with C',
    };
    const validId = 'C' + 'A'.repeat(55);
    const result = validateParameter(schema, validId);
    assert.strictEqual(result.valid, true);
});

test('validateParameter: string format invalid fails with pattern', async () => {
    const schema: ParameterSchema = {
        name: 'contractId',
        type: 'string',
        required: true,
        pattern: /^C[A-Z0-9]{55}$/,
        patternDescription: '56-char contract ID starting with C',
    };
    const result = validateParameter(schema, 'invalid-id');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors[0].code, 'INVALID_FORMAT');
    assert.ok(result.errors[0].suggestion?.includes('56-char'));
});

test('validateParameter: number type valid integer', async () => {
    const schema: ParameterSchema = { name: 'count', type: 'number', required: true };
    const result = validateParameter(schema, 42);
    assert.strictEqual(result.valid, true);
});

test('validateParameter: number type valid string conversion', async () => {
    const schema: ParameterSchema = { name: 'count', type: 'number', required: true };
    const result = validateParameter(schema, '42');
    assert.strictEqual(result.valid, true);
});

test('validateParameter: number type invalid string fails', async () => {
    const schema: ParameterSchema = { name: 'count', type: 'number', required: true };
    const result = validateParameter(schema, 'not-a-number');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors[0].code, 'INVALID_TYPE');
});

test('validateParameter: number below min fails', async () => {
    const schema: ParameterSchema = { name: 'port', type: 'number', required: true, min: 1 };
    const result = validateParameter(schema, 0);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors[0].code, 'OUT_OF_RANGE');
});

test('validateParameter: number above max fails', async () => {
    const schema: ParameterSchema = { name: 'port', type: 'number', required: true, max: 65535 };
    const result = validateParameter(schema, 70000);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors[0].code, 'OUT_OF_RANGE');
});

test('validateParameter: number within range passes', async () => {
    const schema: ParameterSchema = { name: 'port', type: 'number', required: true, min: 1, max: 65535 };
    const result = validateParameter(schema, 8080);
    assert.strictEqual(result.valid, true);
});

test('validateParameter: boolean true passes', async () => {
    const schema: ParameterSchema = { name: 'verbose', type: 'boolean', required: false };
    const result = validateParameter(schema, true);
    assert.strictEqual(result.valid, true);
});

test('validateParameter: boolean string "yes" passes', async () => {
    const schema: ParameterSchema = { name: 'verbose', type: 'boolean', required: false };
    const result = validateParameter(schema, 'yes');
    assert.strictEqual(result.valid, true);
});

test('validateParameter: boolean invalid string fails', async () => {
    const schema: ParameterSchema = { name: 'verbose', type: 'boolean', required: false };
    const result = validateParameter(schema, 'maybe');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors[0].code, 'INVALID_BOOLEAN');
});

test('validateParameter: enum valid value passes', async () => {
    const schema: ParameterSchema = {
        name: '--network',
        type: 'enum',
        required: true,
        enumValues: ['testnet', 'mainnet', 'futurenet'],
    };
    const result = validateParameter(schema, 'testnet');
    assert.strictEqual(result.valid, true);
});

test('validateParameter: enum case insensitive passes', async () => {
    const schema: ParameterSchema = {
        name: '--network',
        type: 'enum',
        required: true,
        enumValues: ['testnet', 'mainnet'],
    };
    const result = validateParameter(schema, 'TESTNET');
    assert.strictEqual(result.valid, true);
});

test('validateParameter: enum invalid value fails', async () => {
    const schema: ParameterSchema = {
        name: '--network',
        type: 'enum',
        required: true,
        enumValues: ['testnet', 'mainnet', 'futurenet'],
    };
    const result = validateParameter(schema, 'devnet');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors[0].code, 'INVALID_ENUM_VALUE');
    assert.ok(result.errors[0].suggestion?.includes('testnet'));
});

// ═══════════════════════════════════════════════════════════════
// Command Parameter Validation (cross-parameter tests)
// ═══════════════════════════════════════════════════════════════

test('validateCommandParameters: valid parameters pass', async () => {
    const schema: CommandSchema = {
        name: 'test-cmd',
        flags: [
            { name: '--network', type: 'enum', required: true, enumValues: ['testnet', 'mainnet'] },
            { name: '--source', type: 'string', required: true },
        ],
    };
    const result = validateCommandParameters(schema, {
        '--network': 'testnet',
        '--source': 'dev',
    }, silentLogger);
    assert.strictEqual(result.valid, true);
});

test('validateCommandParameters: unknown flag detected', async () => {
    const schema: CommandSchema = {
        name: 'test-cmd',
        flags: [
            { name: '--network', type: 'string', required: false },
        ],
    };
    const result = validateCommandParameters(schema, {
        '--network': 'testnet',
        '--foo': 'bar',
    }, silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'UNKNOWN_FLAG'));
});

test('validateCommandParameters: unknown flag suggests similar', async () => {
    const schema: CommandSchema = {
        name: 'test-cmd',
        flags: [
            { name: '--network', type: 'string', required: false },
        ],
    };
    const result = validateCommandParameters(schema, {
        '--netwok': 'testnet',
    }, silentLogger);
    assert.strictEqual(result.valid, false);
    const unknownIssue = result.errors.find(e => e.code === 'UNKNOWN_FLAG');
    assert.ok(unknownIssue);
    assert.ok(unknownIssue!.suggestion?.includes('--network'));
});

test('validateCommandParameters: mutually exclusive flags detected', async () => {
    const schema: CommandSchema = {
        name: 'test-cmd',
        flags: [
            { name: '--json', type: 'boolean', required: false, mutuallyExclusiveWith: ['--csv'] },
            { name: '--csv', type: 'boolean', required: false, mutuallyExclusiveWith: ['--json'] },
        ],
    };
    const result = validateCommandParameters(schema, {
        '--json': true,
        '--csv': true,
    }, silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'MUTUALLY_EXCLUSIVE'));
});

test('validateCommandParameters: dependency missing detected', async () => {
    const schema: CommandSchema = {
        name: 'test-cmd',
        flags: [
            { name: '--wasm', type: 'path', required: false, dependsOn: ['--network'] },
            { name: '--network', type: 'string', required: false },
        ],
    };
    const result = validateCommandParameters(schema, {
        '--wasm': '/path/to/file.wasm',
    }, silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'MISSING_DEPENDENCY'));
});

test('validateCommandParameters: alias resolution works', async () => {
    const schema: CommandSchema = {
        name: 'test-cmd',
        flags: [
            { name: '--network', type: 'enum', required: true, enumValues: ['testnet', 'mainnet'] },
        ],
        aliases: { '-n': '--network' },
    };
    const result = validateCommandParameters(schema, {
        '-n': 'testnet',
    }, silentLogger);
    assert.strictEqual(result.valid, true);
});

// ═══════════════════════════════════════════════════════════════
// Environment Validator Tests
// ═══════════════════════════════════════════════════════════════

test('validateEnvironment: no requirements passes', async () => {
    const result = validateEnvironment({ logger: silentLogger });
    assert.strictEqual(result.valid, true);
});

test('validateEnvironment: missing env var fails', async () => {
    const varName = 'STELLAR_TEST_VAR_THAT_DOES_NOT_EXIST_' + Date.now();
    const result = validateEnvironment({
        requiredEnvVars: [varName],
        logger: silentLogger,
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'MISSING_ENV_VAR'));
});

test('validateEnvironment: existing env var passes', async () => {
    // PATH is always set
    const result = validateEnvironment({
        requiredEnvVars: ['PATH'],
        logger: silentLogger,
    });
    assert.strictEqual(result.valid, true);
});

test('validateEnvironment: missing config file fails', async () => {
    const result = validateEnvironment({
        requiredConfigFiles: ['/this/file/does/not/exist.json'],
        logger: silentLogger,
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'MISSING_CONFIG_FILE'));
});

test('validateEnvironment: Node version check passes for current', async () => {
    const result = validateEnvironment({
        minNodeVersion: 14,
        logger: silentLogger,
    });
    assert.strictEqual(result.valid, true);
});

test('validateEnvironment: Node version check fails for future', async () => {
    const result = validateEnvironment({
        minNodeVersion: 999,
        logger: silentLogger,
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'UNSUPPORTED_NODE_VERSION'));
});

// ═══════════════════════════════════════════════════════════════
// File Validator Tests
// ═══════════════════════════════════════════════════════════════

test('validateFilePath: existing file passes', async () => {
    // Use this test file itself
    const result = validateFilePath({
        filePath: __filename,
        expectedType: 'file',
    }, silentLogger);
    assert.strictEqual(result.valid, true);
});

test('validateFilePath: non-existent file fails', async () => {
    const result = validateFilePath({
        filePath: '/this/does/not/exist.wasm',
        expectedType: 'file',
        label: 'WASM file',
    }, silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'FILE_NOT_FOUND'));
});

test('validateFilePath: empty path fails', async () => {
    const result = validateFilePath({
        filePath: '',
        label: 'Test file',
    }, silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'EMPTY_PATH'));
});

test('validateFilePath: wrong extension fails', async () => {
    const result = validateFilePath({
        filePath: __filename,
        allowedExtensions: ['.wasm'],
        mustExist: true,
    }, silentLogger);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'INVALID_FILE_EXTENSION'));
});

test('validateFilePaths: multiple files validated', async () => {
    const rules: FileValidationRule[] = [
        { filePath: __filename, expectedType: 'file' },
        { filePath: '/does/not/exist.txt' },
    ];
    const result = validateFilePaths(rules, silentLogger);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, 1); // One missing file
});

// ═══════════════════════════════════════════════════════════════
// Pre-Flight Check Tests
// ═══════════════════════════════════════════════════════════════

test('CommandSyntaxCheck: valid params passes', async () => {
    const check = new CommandSyntaxCheck();
    const result = await check.execute({
        commandSchema: {
            name: 'test',
            flags: [
                { name: '--network', type: 'enum', required: true, enumValues: ['testnet'] },
            ],
        },
        parameters: { '--network': 'testnet' },
        cliPath: 'stellar',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    assert.strictEqual(result.status, 'passed');
});

test('CommandSyntaxCheck: missing required param fails', async () => {
    const check = new CommandSyntaxCheck();
    const result = await check.execute({
        commandSchema: {
            name: 'test',
            flags: [
                { name: '--id', type: 'string', required: true },
            ],
        },
        parameters: {},
        cliPath: 'stellar',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    assert.strictEqual(result.status, 'failed');
});

test('CliAvailabilityCheck: skipped when not required', async () => {
    const check = new CliAvailabilityCheck();
    const result = await check.execute({
        commandSchema: { name: 'test', requiresCli: false },
        parameters: {},
        cliPath: 'stellar',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    assert.strictEqual(result.status, 'skipped');
});

test('CliAvailabilityCheck: non-existent CLI fails', async () => {
    const check = new CliAvailabilityCheck();
    const result = await check.execute({
        commandSchema: { name: 'test', requiresCli: true },
        parameters: {},
        cliPath: 'nonexistent-cli-binary-xyz',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    assert.strictEqual(result.status, 'failed');
    assert.ok(result.message?.includes('not found'));
});

test('EnvironmentCheck: skipped when no requirements', async () => {
    const check = new EnvironmentCheck();
    const result = await check.execute({
        commandSchema: { name: 'test' },
        parameters: {},
        cliPath: 'stellar',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    assert.strictEqual(result.status, 'skipped');
});

test('FileValidationCheck: skipped when no rules', async () => {
    const check = new FileValidationCheck([]);
    const result = await check.execute({
        commandSchema: { name: 'test' },
        parameters: {},
        cliPath: 'stellar',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    assert.strictEqual(result.status, 'skipped');
});

test('FileValidationCheck: valid file passes', async () => {
    const check = new FileValidationCheck([
        { filePath: __filename, expectedType: 'file' },
    ]);
    const result = await check.execute({
        commandSchema: { name: 'test' },
        parameters: {},
        cliPath: 'stellar',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    assert.strictEqual(result.status, 'passed');
});

test('FileValidationCheck: missing file fails', async () => {
    const check = new FileValidationCheck([
        { filePath: '/does/not/exist.wasm', label: 'Contract WASM' },
    ]);
    const result = await check.execute({
        commandSchema: { name: 'test' },
        parameters: {},
        cliPath: 'stellar',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    assert.strictEqual(result.status, 'failed');
});

test('NetworkConnectivityCheck: skipped when not required', async () => {
    const check = new NetworkConnectivityCheck();
    const result = await check.execute({
        commandSchema: { name: 'test', requiresNetwork: false },
        parameters: {},
        cliPath: 'stellar',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    assert.strictEqual(result.status, 'skipped');
});

test('NetworkConnectivityCheck: warns when no RPC URL', async () => {
    const check = new NetworkConnectivityCheck();
    const result = await check.execute({
        commandSchema: { name: 'test', requiresNetwork: true },
        parameters: {},
        cliPath: 'stellar',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    assert.strictEqual(result.status, 'warning');
});

// ═══════════════════════════════════════════════════════════════
// Full Pipeline Tests
// ═══════════════════════════════════════════════════════════════

test('runPreFlightChecks: build command with no CLI passes syntax', async () => {
    const report = await runPreFlightChecks({
        commandSchema: {
            name: 'build',
            requiresCli: false,
            requiresNetwork: false,
        },
        parameters: {},
        cliPath: 'nonexistent',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    // Syntax and environment should pass; CLI and network skipped
    const syntaxCheck = report.checks.find(c => c.checkId === 'command-syntax');
    assert.ok(syntaxCheck);
    assert.strictEqual(syntaxCheck!.status, 'passed');

    const cliCheck = report.checks.find(c => c.checkId === 'cli-availability');
    assert.ok(cliCheck);
    assert.strictEqual(cliCheck!.status, 'skipped');
});

test('runPreFlightChecks: short-circuit stops after failure', async () => {
    const report = await runPreFlightChecks({
        commandSchema: {
            name: 'test',
            requiresCli: true,
            requiresNetwork: true,
            flags: [
                { name: '--id', type: 'string', required: true },
            ],
        },
        parameters: {},  // Missing required --id
        cliPath: 'nonexistent',
        network: 'testnet',
        source: 'dev',
        rpcUrl: 'https://example.com',
        dryRun: false,
        logger: silentLogger,
        shortCircuit: true,
    });

    assert.strictEqual(report.passed, false);
    // First check (syntax) should fail
    assert.strictEqual(report.checks[0].status, 'failed');
    // Subsequent checks should be skipped
    const skippedChecks = report.checks.filter(c => c.status === 'skipped');
    assert.ok(skippedChecks.length > 0);
});

test('runPreFlightChecks: dry-run mode sets flag in report', async () => {
    const report = await runPreFlightChecks({
        commandSchema: {
            name: 'build',
            requiresCli: false,
            requiresNetwork: false,
        },
        parameters: {},
        cliPath: 'stellar',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: true,
        logger: silentLogger,
    });

    assert.strictEqual(report.dryRun, true);
    assert.strictEqual(report.passed, true);
});

// ═══════════════════════════════════════════════════════════════
// CLI Validation Service (Orchestrator) Tests
// ═══════════════════════════════════════════════════════════════

test('validateCommand: unknown command fails', async () => {
    const result = await validateCommand({
        commandName: 'nonexistent-command',
        logger: silentLogger,
        skipCliCheck: true,
        skipNetworkChecks: true,
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.allIssues.some(i => i.code === 'UNKNOWN_COMMAND'));
});

test('validateCommand: build command with no checks passes', async () => {
    const result = await validateCommand({
        commandName: 'build',
        parameters: {},
        logger: silentLogger,
        skipCliCheck: true,
        skipNetworkChecks: true,
    });
    assert.strictEqual(result.valid, true);
});

test('validateCommand: simulate missing contractId fails', async () => {
    const result = await validateCommand({
        commandName: 'simulate',
        parameters: {
            '--network': 'testnet',
            '--source': 'dev',
        },
        logger: silentLogger,
        skipCliCheck: true,
        skipNetworkChecks: true,
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.allIssues.some(i => i.code === 'MISSING_PARAMETER'));
});

test('validateCommand: simulate with valid params passes', async () => {
    const contractId = 'C' + 'A'.repeat(55);
    const result = await validateCommand({
        commandName: 'simulate',
        parameters: {
            contractId,
            functionName: 'increment',
            '--network': 'testnet',
            '--source': 'dev',
        },
        logger: silentLogger,
        skipCliCheck: true,
        skipNetworkChecks: true,
    });
    assert.strictEqual(result.valid, true);
});

test('validateCommand: deploy with invalid network fails', async () => {
    const result = await validateCommand({
        commandName: 'deploy',
        parameters: {
            '--network': 'invalidnet',
        },
        logger: silentLogger,
        skipCliCheck: true,
        skipNetworkChecks: true,
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.allIssues.some(i => i.code === 'INVALID_ENUM_VALUE'));
});

test('validateCommand: dry-run flag correctly propagated', async () => {
    const result = await validateCommand({
        commandName: 'build',
        parameters: {},
        dryRun: true,
        logger: silentLogger,
        skipCliCheck: true,
        skipNetworkChecks: true,
    });
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.valid, true);
});

// ═══════════════════════════════════════════════════════════════
// Formatting Tests
// ═══════════════════════════════════════════════════════════════

test('formatValidationResult: passed output contains checkmark', async () => {
    const result = await validateCommand({
        commandName: 'build',
        parameters: {},
        logger: silentLogger,
        skipCliCheck: true,
        skipNetworkChecks: true,
    });
    const formatted = formatValidationResult(result);
    assert.ok(formatted.includes('✔'));
    assert.ok(formatted.includes('passed'));
});

test('formatValidationResult: failed output contains cross', async () => {
    const result = await validateCommand({
        commandName: 'simulate',
        parameters: {},
        logger: silentLogger,
        skipCliCheck: true,
        skipNetworkChecks: true,
    });
    const formatted = formatValidationResult(result);
    assert.ok(formatted.includes('✘'));
});

test('formatValidationResult: dry-run output shows command', async () => {
    const result = await validateCommand({
        commandName: 'build',
        parameters: {},
        dryRun: true,
        logger: silentLogger,
        skipCliCheck: true,
        skipNetworkChecks: true,
    });
    const formatted = formatValidationResult(result);
    assert.ok(formatted.includes('Dry run'));
});

test('formatPreFlightReport: contains check labels', async () => {
    const report = await runPreFlightChecks({
        commandSchema: {
            name: 'build',
            requiresCli: false,
            requiresNetwork: false,
        },
        parameters: {},
        cliPath: 'stellar',
        network: 'testnet',
        source: 'dev',
        rpcUrl: '',
        dryRun: false,
        logger: silentLogger,
    });
    const formatted = formatPreFlightReport(report);
    assert.ok(formatted.includes('Command Syntax'));
    assert.ok(formatted.includes('CLI Availability'));
});

// ═══════════════════════════════════════════════════════════════
// Command Schema Tests
// ═══════════════════════════════════════════════════════════════

test('COMMAND_SCHEMAS: deploy schema exists and requires network', async () => {
    const schema = COMMAND_SCHEMAS['deploy'];
    assert.ok(schema);
    assert.strictEqual(schema.requiresNetwork, true);
    assert.strictEqual(schema.requiresCli, true);
});

test('COMMAND_SCHEMAS: build schema exists and does not require network', async () => {
    const schema = COMMAND_SCHEMAS['build'];
    assert.ok(schema);
    assert.strictEqual(schema.requiresNetwork, false);
    assert.strictEqual(schema.requiresCli, true);
});

test('COMMAND_SCHEMAS: simulate schema has contract ID validation', async () => {
    const schema = COMMAND_SCHEMAS['simulate'];
    assert.ok(schema);
    const contractArg = schema.positionalArgs?.find(a => a.name === 'contractId');
    assert.ok(contractArg);
    assert.ok(contractArg!.pattern);
});

test('generateUsageString: produces correct format', async () => {
    const schema: CommandSchema = {
        name: 'test',
        flags: [
            { name: '--network', type: 'string', required: true },
            { name: '--verbose', type: 'boolean', required: false },
        ],
        positionalArgs: [
            { name: 'file', type: 'string', required: true },
        ],
    };
    const usage = generateUsageString(schema);
    assert.ok(usage.includes('stellar test'));
    assert.ok(usage.includes('<file>'));
    assert.ok(usage.includes('--network'));
});

test('generateUsageString: uses custom usage when provided', async () => {
    const schema: CommandSchema = {
        name: 'test',
        usage: 'custom usage string',
    };
    const usage = generateUsageString(schema);
    assert.strictEqual(usage, 'custom usage string');
});

// ═══════════════════════════════════════════════════════════════
// Test Runner
// ═══════════════════════════════════════════════════════════════

async function run() {
    let passed = 0;
    let failed = 0;

    console.log('\ncliValidation unit tests');
    console.log('═'.repeat(50));

    for (const { name, fn } of tests) {
        try {
            await fn();
            passed += 1;
            console.log(`  [ok] ${name}`);
        } catch (err) {
            failed += 1;
            console.error(`  [FAIL] ${name}`);
            console.error(`         ${err instanceof Error ? err.message : String(err)}`);
            if (err instanceof Error && err.stack) {
                const stackLines = err.stack.split('\n').slice(1, 4);
                for (const line of stackLines) {
                    console.error(`         ${line.trim()}`);
                }
            }
        }
    }

    console.log('═'.repeat(50));
    console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
