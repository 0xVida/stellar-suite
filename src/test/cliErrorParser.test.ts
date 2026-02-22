declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
import {
    formatCliErrorForDisplay,
    looksLikeCliError,
    parseCliErrorOutput,
} from '../utils/cliErrorParser';

async function testParsesNetworkError() {
    const raw = [
        'error: failed to reach RPC endpoint',
        'Caused by: connection refused (ECONNREFUSED)',
    ].join('\n');

    const parsed = parseCliErrorOutput(raw, {
        command: 'stellar contract invoke',
        network: 'testnet',
    });

    assert.strictEqual(parsed.type, 'network');
    assert.strictEqual(parsed.code, 'ECONNREFUSED');
    assert.ok(parsed.message.toLowerCase().includes('error'));
    assert.ok(parsed.suggestions.length > 0);
    console.log('  [ok] parses network errors');
}

async function testParsesValidationError() {
    const raw = [
        "error: Found argument '--foo' which wasn't expected",
        'USAGE:',
        'stellar contract invoke --id <CONTRACT_ID> -- <FUNCTION>',
    ].join('\n');

    const parsed = parseCliErrorOutput(raw);

    assert.strictEqual(parsed.type, 'validation');
    assert.ok(parsed.message.includes("argument '--foo'"));
    assert.ok(parsed.suggestions.some(s => s.toLowerCase().includes('flags')));
    console.log('  [ok] parses validation errors');
}

async function testParsesExecutionErrorAndHostCode() {
    const raw = [
        'Error: simulation failed',
        'HostError: Error(Contract, #6)',
    ].join('\n');

    const parsed = parseCliErrorOutput(raw);

    assert.strictEqual(parsed.type, 'execution');
    assert.strictEqual(parsed.code, 'HOST_6');
    assert.ok(parsed.details && parsed.details.includes('HostError'));
    console.log('  [ok] parses execution errors and host code');
}

async function testParsesJsonErrorFormat() {
    const raw = JSON.stringify({
        error: {
            code: 'TX_BAD_SEQ',
            message: 'transaction failed',
            details: 'sequence number is too low',
        },
    });

    const parsed = parseCliErrorOutput(raw);

    assert.strictEqual(parsed.format, 'json');
    assert.strictEqual(parsed.code, 'TX_BAD_SEQ');
    assert.strictEqual(parsed.message, 'transaction failed');
    assert.strictEqual(parsed.details, 'sequence number is too low');
    console.log('  [ok] parses JSON error format');
}

async function testHandlesMalformedOutput() {
    const parsed = parseCliErrorOutput('   \n\t');

    assert.strictEqual(parsed.malformed, true);
    assert.ok(parsed.message.toLowerCase().includes('empty'));
    assert.ok(parsed.suggestions.length > 0);
    console.log('  [ok] handles malformed output');
}

async function testFormatsErrorForDisplayWithContextAndSuggestions() {
    const parsed = parseCliErrorOutput(
        'error: invalid contract id',
        {
            command: 'stellar contract invoke',
            contractId: 'CABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE1234567890AB',
            functionName: 'increment',
            network: 'testnet',
        }
    );

    const formatted = formatCliErrorForDisplay(parsed);

    assert.ok(formatted.includes('Stellar CLI'));
    assert.ok(formatted.includes('Context:'));
    assert.ok(formatted.includes('Suggestions:'));
    console.log('  [ok] formats error output with context and suggestions');
}

async function testDetectsErrorLikeOutput() {
    assert.strictEqual(looksLikeCliError('warning: cache miss, retrying'), false);
    assert.strictEqual(looksLikeCliError('Error: failed to execute transaction'), true);
    assert.strictEqual(looksLikeCliError('{"error":{"message":"boom"}}'), true);
    console.log('  [ok] detects error-like output');
}

async function run() {
    const tests: Array<() => Promise<void>> = [
        testParsesNetworkError,
        testParsesValidationError,
        testParsesExecutionErrorAndHostCode,
        testParsesJsonErrorFormat,
        testHandlesMalformedOutput,
        testFormatsErrorForDisplayWithContextAndSuggestions,
        testDetectsErrorLikeOutput,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\ncliErrorParser unit tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (err) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
