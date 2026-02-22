// ============================================================
// src/test/inputSanitizationService.test.ts
// Unit tests for InputSanitizationService.
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import {
    InputSanitizationService,
    SanitizationRule,
    SanitizationLogger,
} from '../services/inputSanitizationService';

// ── Silent logger for tests ───────────────────────────────────

class SilentLogger implements SanitizationLogger {
    info(_msg: string): void { /* noop */ }
    warn(_msg: string): void { /* noop */ }
    error(_msg: string): void { /* noop */ }
}

function makeSanitizer(): InputSanitizationService {
    return new InputSanitizationService(new SilentLogger());
}

// ══════════════════════════════════════════════════════════
// sanitizeString
// ══════════════════════════════════════════════════════════

function testSanitizeStringNullInput() {
    const s = makeSanitizer();
    const r = s.sanitizeString(null);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.sanitizedValue, '');
    assert.strictEqual(r.wasModified, true);
    console.log('  [ok] sanitizeString: returns empty string for null input');
}

function testSanitizeStringUndefinedInput() {
    const s = makeSanitizer();
    const r = s.sanitizeString(undefined);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.sanitizedValue, '');
    console.log('  [ok] sanitizeString: returns empty string for undefined input');
}

function testSanitizeStringTrimsWhitespace() {
    const s = makeSanitizer();
    const r = s.sanitizeString('  hello  ');
    assert.strictEqual(r.sanitizedValue, 'hello');
    assert.strictEqual(r.wasModified, true);
    console.log('  [ok] sanitizeString: trims whitespace by default');
}

function testSanitizeStringNoTrim() {
    const s = makeSanitizer();
    const r = s.sanitizeString('  hello  ', { trim: false });
    assert.strictEqual(r.sanitizedValue, '  hello  ');
    assert.strictEqual(r.wasModified, false);
    console.log('  [ok] sanitizeString: does not trim when trim=false');
}

function testSanitizeStringStripsNullBytes() {
    const s = makeSanitizer();
    const r = s.sanitizeString('hel\0lo');
    assert.strictEqual(r.sanitizedValue, 'hello');
    assert.strictEqual(r.wasModified, true);
    console.log('  [ok] sanitizeString: strips null bytes');
}

function testSanitizeStringStripsControlChars() {
    const s = makeSanitizer();
    const r = s.sanitizeString('hel\x01lo');
    assert.strictEqual(r.sanitizedValue, 'hello');
    console.log('  [ok] sanitizeString: strips control characters');
}

function testSanitizeStringPreservesNewlines() {
    const s = makeSanitizer();
    const r = s.sanitizeString('line1\nline2', { allowNewlines: true });
    assert.strictEqual(r.sanitizedValue, 'line1\nline2');
    console.log('  [ok] sanitizeString: preserves newlines when allowNewlines=true');
}

function testSanitizeStringStripsNewlines() {
    const s = makeSanitizer();
    const r = s.sanitizeString('line1\nline2');
    assert.strictEqual(r.sanitizedValue, 'line1line2');
    console.log('  [ok] sanitizeString: strips newlines when allowNewlines=false (default)');
}

function testSanitizeStringMaxLength() {
    const s = makeSanitizer();
    const r = s.sanitizeString('abcdef', { maxLength: 3 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some((e: string) => e.includes('too long')));
    console.log('  [ok] sanitizeString: enforces maxLength');
}

function testSanitizeStringMinLength() {
    const s = makeSanitizer();
    const r = s.sanitizeString('ab', { minLength: 5 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some((e: string) => e.includes('too short')));
    console.log('  [ok] sanitizeString: enforces minLength');
}

function testSanitizeStringValid() {
    const s = makeSanitizer();
    const r = s.sanitizeString('hello world');
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.errors.length, 0);
    console.log('  [ok] sanitizeString: valid string passes all checks');
}

function testSanitizeStringCustomRule() {
    const s = makeSanitizer();
    const upperRule: SanitizationRule = {
        id: 'uppercase',
        description: 'Convert to uppercase',
        apply: (v: string) => v.toUpperCase(),
    };
    const r = s.sanitizeString('hello', { customRules: [upperRule] });
    assert.strictEqual(r.sanitizedValue, 'HELLO');
    console.log('  [ok] sanitizeString: applies custom rules');
}

function testSanitizeStringCustomRuleError() {
    const s = makeSanitizer();
    const rejectRule: SanitizationRule = {
        id: 'reject-all',
        description: 'Reject everything',
        apply: () => { throw new Error('Not allowed'); },
    };
    const r = s.sanitizeString('hello', { customRules: [rejectRule] });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some((e: string) => e.includes('Not allowed')));
    console.log('  [ok] sanitizeString: custom rule error marks result invalid');
}

function testSanitizeStringProducesLogs() {
    const s = makeSanitizer();
    const r = s.sanitizeString('  hello\0  ');
    assert.ok(r.logs.length > 0);
    console.log('  [ok] sanitizeString: produces log entries');
}

// ══════════════════════════════════════════════════════════
// sanitizeContractId
// ══════════════════════════════════════════════════════════

const VALID_CONTRACT_ID = 'C' + 'A'.repeat(55);

function testContractIdValid() {
    const s = makeSanitizer();
    const r = s.sanitizeContractId(VALID_CONTRACT_ID);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.sanitizedValue, VALID_CONTRACT_ID);
    console.log('  [ok] sanitizeContractId: accepts a valid contract ID');
}

function testContractIdNormalizesUppercase() {
    const s = makeSanitizer();
    const lower = 'c' + 'a'.repeat(55);
    const r = s.sanitizeContractId(lower);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.sanitizedValue, VALID_CONTRACT_ID);
    console.log('  [ok] sanitizeContractId: normalizes to uppercase');
}

function testContractIdTooShort() {
    const s = makeSanitizer();
    const r = s.sanitizeContractId('CABC');
    assert.strictEqual(r.valid, false);
    console.log('  [ok] sanitizeContractId: rejects ID that is too short');
}

function testContractIdWrongPrefix() {
    const s = makeSanitizer();
    const r = s.sanitizeContractId('G' + 'A'.repeat(55));
    assert.strictEqual(r.valid, false);
    console.log('  [ok] sanitizeContractId: rejects ID that does not start with C');
}

function testContractIdInvalidChars() {
    const s = makeSanitizer();
    const r = s.sanitizeContractId('C' + 'A'.repeat(54) + '!');
    assert.strictEqual(r.valid, false);
    console.log('  [ok] sanitizeContractId: rejects ID with invalid characters');
}

function testContractIdEmpty() {
    const s = makeSanitizer();
    const r = s.sanitizeContractId('');
    assert.strictEqual(r.valid, false);
    console.log('  [ok] sanitizeContractId: rejects empty string');
}

function testContractIdNull() {
    const s = makeSanitizer();
    const r = s.sanitizeContractId(null);
    assert.strictEqual(r.valid, false);
    console.log('  [ok] sanitizeContractId: rejects null');
}

// ══════════════════════════════════════════════════════════
// sanitizeNetworkName
// ══════════════════════════════════════════════════════════

function testNetworkTestnet() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeNetworkName('testnet').valid, true);
    console.log('  [ok] sanitizeNetworkName: accepts testnet');
}

function testNetworkMainnet() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeNetworkName('mainnet').valid, true);
    console.log('  [ok] sanitizeNetworkName: accepts mainnet');
}

function testNetworkNormalizesLowercase() {
    const s = makeSanitizer();
    const r = s.sanitizeNetworkName('TESTNET');
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.sanitizedValue, 'testnet');
    console.log('  [ok] sanitizeNetworkName: normalizes to lowercase');
}

function testNetworkUnknown() {
    const s = makeSanitizer();
    const r = s.sanitizeNetworkName('devnet');
    assert.strictEqual(r.valid, false);
    console.log('  [ok] sanitizeNetworkName: rejects unknown network');
}

function testNetworkCustomAllowed() {
    const s = makeSanitizer();
    const r = s.sanitizeNetworkName('devnet', { allowedNetworks: ['devnet', 'testnet'] });
    assert.strictEqual(r.valid, true);
    console.log('  [ok] sanitizeNetworkName: accepts custom allowed networks');
}

// ══════════════════════════════════════════════════════════
// sanitizePath
// ══════════════════════════════════════════════════════════

function testPathRelative() {
    const s = makeSanitizer();
    const r = s.sanitizePath('contracts/my_contract.wasm');
    assert.strictEqual(r.valid, true);
    console.log('  [ok] sanitizePath: accepts a normal relative path');
}

function testPathTraversalRejected() {
    const s = makeSanitizer();
    const r = s.sanitizePath('../etc/passwd');
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some((e: string) => e.includes('traversal')));
    console.log('  [ok] sanitizePath: rejects path traversal by default');
}

function testPathTraversalAllowed() {
    const s = makeSanitizer();
    const r = s.sanitizePath('../sibling/file.txt', { allowTraversal: true });
    assert.strictEqual(r.valid, true);
    console.log('  [ok] sanitizePath: allows path traversal when explicitly permitted');
}

function testPathAbsoluteWarning() {
    const s = makeSanitizer();
    const r = s.sanitizePath('/etc/passwd', { allowAbsolute: false });
    assert.ok(r.warnings.some((w: string) => w.includes('Absolute')));
    console.log('  [ok] sanitizePath: warns on absolute path when not allowed');
}

function testPathAbsoluteDefault() {
    const s = makeSanitizer();
    const r = s.sanitizePath('/home/user/contracts/my.wasm');
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.warnings.length, 0);
    console.log('  [ok] sanitizePath: accepts absolute path by default');
}

// ══════════════════════════════════════════════════════════
// sanitizeJson
// ══════════════════════════════════════════════════════════

function testJsonValidObject() {
    const s = makeSanitizer();
    const r = s.sanitizeJson('{"name":"world"}');
    assert.strictEqual(r.valid, true);
    console.log('  [ok] sanitizeJson: accepts valid JSON object');
}

function testJsonValidArray() {
    const s = makeSanitizer();
    const r = s.sanitizeJson('[1,2,3]');
    assert.strictEqual(r.valid, true);
    console.log('  [ok] sanitizeJson: accepts valid JSON array');
}

function testJsonInvalid() {
    const s = makeSanitizer();
    const r = s.sanitizeJson('{not valid json}');
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some((e: string) => e.includes('Invalid JSON')));
    console.log('  [ok] sanitizeJson: rejects invalid JSON');
}

function testJsonTooDeep() {
    const s = makeSanitizer();
    let nested: unknown = 'leaf';
    for (let i = 0; i < 12; i++) {
        nested = { child: nested };
    }
    const r = s.sanitizeJson(JSON.stringify(nested), { maxDepth: 5 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some((e: string) => e.includes('depth')));
    console.log('  [ok] sanitizeJson: rejects deeply nested JSON');
}

function testJsonTooManyKeys() {
    const s = makeSanitizer();
    const obj: Record<string, number> = {};
    for (let i = 0; i < 10; i++) { obj[`key${i}`] = i; }
    const r = s.sanitizeJson(JSON.stringify(obj), { maxKeys: 5 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some((e: string) => e.includes('keys')));
    console.log('  [ok] sanitizeJson: rejects JSON with too many keys');
}

function testJsonCanonicalForm() {
    const s = makeSanitizer();
    const r = s.sanitizeJson('  {  "a" :  1  }  ');
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.sanitizedValue, '{"a":1}');
    console.log('  [ok] sanitizeJson: re-serializes to canonical form');
}

// ══════════════════════════════════════════════════════════
// sanitizeFunctionName
// ══════════════════════════════════════════════════════════

function testFunctionNameValid() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeFunctionName('transfer').valid, true);
    console.log('  [ok] sanitizeFunctionName: accepts valid function name');
}

function testFunctionNameWithUnderscores() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeFunctionName('get_balance').valid, true);
    console.log('  [ok] sanitizeFunctionName: accepts function name with underscores');
}

function testFunctionNameStartsWithUnderscore() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeFunctionName('_internal').valid, true);
    console.log('  [ok] sanitizeFunctionName: accepts function name starting with underscore');
}

function testFunctionNameStartsWithDigit() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeFunctionName('1transfer').valid, false);
    console.log('  [ok] sanitizeFunctionName: rejects function name starting with digit');
}

function testFunctionNameWithSpaces() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeFunctionName('my function').valid, false);
    console.log('  [ok] sanitizeFunctionName: rejects function name with spaces');
}

function testFunctionNameWithSpecialChars() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeFunctionName('transfer!').valid, false);
    console.log('  [ok] sanitizeFunctionName: rejects function name with special characters');
}

function testFunctionNameEmpty() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeFunctionName('').valid, false);
    console.log('  [ok] sanitizeFunctionName: rejects empty string');
}

// ══════════════════════════════════════════════════════════
// sanitizeEnvVarName
// ══════════════════════════════════════════════════════════

function testEnvVarNameValid() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeEnvVarName('MY_API_KEY').valid, true);
    console.log('  [ok] sanitizeEnvVarName: accepts valid env var name');
}

function testEnvVarNameNormalizesUppercase() {
    const s = makeSanitizer();
    const r = s.sanitizeEnvVarName('my_api_key');
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.sanitizedValue, 'MY_API_KEY');
    console.log('  [ok] sanitizeEnvVarName: normalizes to uppercase');
}

function testEnvVarNameStartsWithDigit() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeEnvVarName('1KEY').valid, false);
    console.log('  [ok] sanitizeEnvVarName: rejects name starting with digit');
}

function testEnvVarNameWithSpaces() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeEnvVarName('MY KEY').valid, false);
    console.log('  [ok] sanitizeEnvVarName: rejects name with spaces');
}

function testEnvVarNameWithHyphens() {
    const s = makeSanitizer();
    assert.strictEqual(s.sanitizeEnvVarName('MY-KEY').valid, false);
    console.log('  [ok] sanitizeEnvVarName: rejects name with hyphens');
}

// ══════════════════════════════════════════════════════════
// sanitizeEnvVarValue
// ══════════════════════════════════════════════════════════

function testEnvVarValuePlain() {
    const s = makeSanitizer();
    const r = s.sanitizeEnvVarValue('hello world');
    assert.strictEqual(r.valid, true);
    console.log('  [ok] sanitizeEnvVarValue: accepts plain value');
}

function testEnvVarValueMetacharWarning() {
    const s = makeSanitizer();
    const r = s.sanitizeEnvVarValue('$(rm -rf /)');
    assert.strictEqual(r.valid, true); // still valid, just warned
    assert.ok(r.warnings.some((w: string) => w.includes('metacharacters')));
    console.log('  [ok] sanitizeEnvVarValue: warns on shell metacharacters');
}

function testEnvVarValueStripsNullBytes() {
    const s = makeSanitizer();
    const r = s.sanitizeEnvVarValue('val\0ue');
    assert.strictEqual(r.sanitizedValue, 'value');
    console.log('  [ok] sanitizeEnvVarValue: strips null bytes');
}

// ══════════════════════════════════════════════════════════
// sanitizeFormFields
// ══════════════════════════════════════════════════════════

function testFormFieldsSanitizesAll() {
    const s = makeSanitizer();
    const results = s.sanitizeFormFields({
        name: '  Alice  ',
        age: '25',
    });
    assert.strictEqual(results['name'].sanitizedValue, 'Alice');
    assert.strictEqual(results['age'].sanitizedValue, '25');
    console.log('  [ok] sanitizeFormFields: sanitizes all fields');
}

function testFormFieldsAllValid() {
    const s = makeSanitizer();
    const results = s.sanitizeFormFields({ a: 'hello', b: 'world' });
    assert.strictEqual(InputSanitizationService.allValid(results), true);
    console.log('  [ok] sanitizeFormFields: allValid returns true when all fields are valid');
}

function testFormFieldsAllValidFalse() {
    const s = makeSanitizer();
    const results = s.sanitizeFormFields(
        { a: 'hello', b: 'toolong' },
        { b: { maxLength: 3 } },
    );
    assert.strictEqual(InputSanitizationService.allValid(results), false);
    console.log('  [ok] sanitizeFormFields: allValid returns false when any field is invalid');
}

function testFormFieldsCollectErrors() {
    const s = makeSanitizer();
    const results = s.sanitizeFormFields(
        { myField: 'x'.repeat(10) },
        { myField: { maxLength: 5 } },
    );
    const errors = InputSanitizationService.collectErrors(results);
    assert.ok(errors.some((e: string) => e.startsWith('[myField]')));
    console.log('  [ok] sanitizeFormFields: collectErrors returns prefixed error messages');
}

// ══════════════════════════════════════════════════════════
// Test runner
// ══════════════════════════════════════════════════════════

async function runAll() {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  InputSanitizationService Tests');
    console.log('══════════════════════════════════════════════════════════\n');

    const tests = [
        // sanitizeString
        testSanitizeStringNullInput,
        testSanitizeStringUndefinedInput,
        testSanitizeStringTrimsWhitespace,
        testSanitizeStringNoTrim,
        testSanitizeStringStripsNullBytes,
        testSanitizeStringStripsControlChars,
        testSanitizeStringPreservesNewlines,
        testSanitizeStringStripsNewlines,
        testSanitizeStringMaxLength,
        testSanitizeStringMinLength,
        testSanitizeStringValid,
        testSanitizeStringCustomRule,
        testSanitizeStringCustomRuleError,
        testSanitizeStringProducesLogs,
        // sanitizeContractId
        testContractIdValid,
        testContractIdNormalizesUppercase,
        testContractIdTooShort,
        testContractIdWrongPrefix,
        testContractIdInvalidChars,
        testContractIdEmpty,
        testContractIdNull,
        // sanitizeNetworkName
        testNetworkTestnet,
        testNetworkMainnet,
        testNetworkNormalizesLowercase,
        testNetworkUnknown,
        testNetworkCustomAllowed,
        // sanitizePath
        testPathRelative,
        testPathTraversalRejected,
        testPathTraversalAllowed,
        testPathAbsoluteWarning,
        testPathAbsoluteDefault,
        // sanitizeJson
        testJsonValidObject,
        testJsonValidArray,
        testJsonInvalid,
        testJsonTooDeep,
        testJsonTooManyKeys,
        testJsonCanonicalForm,
        // sanitizeFunctionName
        testFunctionNameValid,
        testFunctionNameWithUnderscores,
        testFunctionNameStartsWithUnderscore,
        testFunctionNameStartsWithDigit,
        testFunctionNameWithSpaces,
        testFunctionNameWithSpecialChars,
        testFunctionNameEmpty,
        // sanitizeEnvVarName
        testEnvVarNameValid,
        testEnvVarNameNormalizesUppercase,
        testEnvVarNameStartsWithDigit,
        testEnvVarNameWithSpaces,
        testEnvVarNameWithHyphens,
        // sanitizeEnvVarValue
        testEnvVarValuePlain,
        testEnvVarValueMetacharWarning,
        testEnvVarValueStripsNullBytes,
        // sanitizeFormFields
        testFormFieldsSanitizesAll,
        testFormFieldsAllValid,
        testFormFieldsAllValidFalse,
        testFormFieldsCollectErrors,
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (err) {
            failed++;
            console.error(`  [FAIL] ${test.name}: ${err instanceof Error ? err.message : String(err)}`);
            if (process) { process.exitCode = 1; }
        }
    }

    console.log(`\n  Results: ${passed} passed, ${failed} failed out of ${tests.length} tests\n`);
}

runAll().catch(err => {
    console.error('Test runner error:', err);
    if (process) { process.exitCode = 1; }
});
