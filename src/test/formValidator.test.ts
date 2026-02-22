declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { SimulationValidationService } from '../services/simulationValidationService';
import { ContractFunction } from '../services/contractInspector';
import {
    VALID_CONTRACT_ID,
    VALID_ACCOUNT_ID,
    makeTransferFunction,
    makeMintFunction,
    makeBalanceFunction,
    makeInitializeFunction,
    makeNoParamFunction,
    makeComplexFunction,
    makeAllTypeParamsFunction,
    makeTokenContractFunctions,
    makeFunction
} from './fixtures/formGenerationFixtures';

const service = new SimulationValidationService();

// ── Contract ID validation ────────────────────────────────────

async function testValidContractIdPasses() {
    const fn = makeNoParamFunction();
    const report = service.validateSimulation(VALID_CONTRACT_ID, 'get_count', [{}], fn, [fn]);
    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.errors.length, 0);
    console.log('  [ok] valid contract ID passes');
}

async function testEmptyContractIdFails() {
    const fn = makeNoParamFunction();
    const report = service.validateSimulation('', 'get_count', [{}], fn, [fn]);
    assert.strictEqual(report.valid, false);
    assert.ok(report.errors.some(e => e.includes('Invalid contract ID')));
    console.log('  [ok] empty contract ID fails');
}

async function testShortContractIdFails() {
    const fn = makeNoParamFunction();
    const report = service.validateSimulation('CABC123', 'get_count', [{}], fn, [fn]);
    assert.strictEqual(report.valid, false);
    assert.ok(report.errors.some(e => e.includes('Invalid contract ID')));
    console.log('  [ok] short contract ID fails');
}

async function testContractIdWrongPrefixFails() {
    const fn = makeNoParamFunction();
    const report = service.validateSimulation(
        'GABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
        'get_count', [{}], fn, [fn]
    );
    assert.strictEqual(report.valid, false);
    console.log('  [ok] contract ID with wrong prefix fails');
}

async function testContractIdLowerCaseFails() {
    const fn = makeNoParamFunction();
    const report = service.validateSimulation(
        'cabcdefghijklmnopqrstuvwxy1234567890abcdefghijklmnopqrst',
        'get_count', [{}], fn, [fn]
    );
    assert.strictEqual(report.valid, false);
    console.log('  [ok] lowercase contract ID fails');
}

// ── Function name validation ──────────────────────────────────

async function testEmptyFunctionNameFails() {
    const fn = makeNoParamFunction();
    const report = service.validateSimulation(VALID_CONTRACT_ID, '', [{}], fn, [fn]);
    assert.strictEqual(report.valid, false);
    assert.ok(report.errors.some(e => e.includes('Function name is required')));
    console.log('  [ok] empty function name fails');
}

async function testWhitespaceFunctionNameFails() {
    const fn = makeNoParamFunction();
    const report = service.validateSimulation(VALID_CONTRACT_ID, '   ', [{}], fn, [fn]);
    assert.strictEqual(report.valid, false);
    console.log('  [ok] whitespace-only function name fails');
}

// ── Arguments validation ──────────────────────────────────────

async function testNonArrayArgsFails() {
    const fn = makeNoParamFunction();
    const report = service.validateSimulation(VALID_CONTRACT_ID, 'get_count', 'not_array' as any, fn, [fn]);
    assert.strictEqual(report.valid, false);
    assert.ok(report.errors.some(e => e.includes('array')));
    console.log('  [ok] non-array arguments fail');
}

async function testMultipleArgsSuggestion() {
    const fn = makeNoParamFunction();
    const report = service.validateSimulation(VALID_CONTRACT_ID, 'get_count', [{}, {}], fn, [fn]);
    assert.ok(report.suggestions.some(s => s.includes('Additional positional')));
    console.log('  [ok] multiple args trigger suggestion');
}

// ── Required parameter validation ─────────────────────────────

async function testAllRequiredParamsPresent() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{ from: VALID_ACCOUNT_ID, to: VALID_CONTRACT_ID, amount: 100 }],
        fn, [fn]
    );
    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.errors.length, 0);
    console.log('  [ok] passes when all required params present');
}

async function testMissingSingleRequiredParam() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{ from: VALID_ACCOUNT_ID, to: VALID_CONTRACT_ID }],
        fn, [fn]
    );
    assert.strictEqual(report.valid, false);
    assert.ok(report.errors.some(e => e.includes('Missing required parameter: amount')));
    console.log('  [ok] fails when one required param is missing');
}

async function testMissingMultipleRequiredParams() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{ from: VALID_ACCOUNT_ID }],
        fn, [fn]
    );
    assert.strictEqual(report.valid, false);
    assert.ok(report.errors.some(e => e.includes('Missing required parameter: to')));
    assert.ok(report.errors.some(e => e.includes('Missing required parameter: amount')));
    console.log('  [ok] fails when multiple required params are missing');
}

async function testMissingAllRequiredParams() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{}],
        fn, [fn]
    );
    assert.strictEqual(report.valid, false);
    assert.ok(report.errors.length >= 3);
    console.log('  [ok] fails when all required params are missing');
}

async function testEmptyArgsForRequiredParams() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [],
        fn, [fn]
    );
    assert.strictEqual(report.valid, false);
    console.log('  [ok] fails with empty args when function has required params');
}

// ── Type validation ───────────────────────────────────────────

async function testTypeMismatchBoolWarning() {
    const fn = makeAllTypeParamsFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'test_types',
        [{ flag: 'not_bool', label: 'ok', count: 1, signed_count: -1, items: [], metadata: {}, addr: VALID_ACCOUNT_ID }],
        fn, [fn]
    );
    assert.ok(report.warnings.some(w => w.includes('Type mismatch') && w.includes('flag')));
    console.log('  [ok] warns on bool type mismatch');
}

async function testTypeMismatchIntWarning() {
    const fn = makeAllTypeParamsFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'test_types',
        [{ flag: true, label: 'ok', count: 'not_int', signed_count: -1, items: [], metadata: {}, addr: VALID_ACCOUNT_ID }],
        fn, [fn]
    );
    assert.ok(report.warnings.some(w => w.includes('Type mismatch') && w.includes('count')));
    console.log('  [ok] warns on integer type mismatch');
}

async function testTypeMismatchVecWarning() {
    const fn = makeAllTypeParamsFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'test_types',
        [{ flag: true, label: 'ok', count: 1, signed_count: -1, items: 'not_array', metadata: {}, addr: VALID_ACCOUNT_ID }],
        fn, [fn]
    );
    assert.ok(report.warnings.some(w => w.includes('Type mismatch') && w.includes('items')));
    console.log('  [ok] warns on Vec type mismatch');
}

async function testTypeMismatchMapWarning() {
    const fn = makeAllTypeParamsFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'test_types',
        [{ flag: true, label: 'ok', count: 1, signed_count: -1, items: [], metadata: 'not_map', addr: VALID_ACCOUNT_ID }],
        fn, [fn]
    );
    assert.ok(report.warnings.some(w => w.includes('Type mismatch') && w.includes('metadata')));
    console.log('  [ok] warns on Map type mismatch');
}

async function testStringNumberPassesIntType() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{ from: VALID_ACCOUNT_ID, to: VALID_CONTRACT_ID, amount: '100' }],
        fn, [fn]
    );
    assert.ok(!report.warnings.some(w => w.includes('amount')));
    console.log('  [ok] string numbers pass integer type check');
}

// ── Unknown parameter detection ───────────────────────────────

async function testUnknownParameterWarning() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{ from: VALID_ACCOUNT_ID, to: VALID_CONTRACT_ID, amount: 100, memo: 'extra' }],
        fn, [fn]
    );
    assert.ok(report.warnings.some(w => w.includes('Unknown parameter') && w.includes('memo')));
    console.log('  [ok] warns on unknown parameters');
}

async function testMultipleUnknownParameters() {
    const fn = makeBalanceFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'balance',
        [{ id: VALID_ACCOUNT_ID, extra1: 'a', extra2: 'b' }],
        fn, [fn]
    );
    const unknownWarnings = report.warnings.filter(w => w.includes('Unknown parameter'));
    assert.strictEqual(unknownWarnings.length, 2);
    console.log('  [ok] detects multiple unknown parameters');
}

// ── Function existence prediction ─────────────────────────────

async function testFunctionNotExportedPrediction() {
    const functions = makeTokenContractFunctions();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'nonexistent',
        [{}],
        null,
        functions
    );
    assert.ok(report.predictedErrors.some(p => p.code === 'FUNCTION_NOT_EXPORTED'));
    console.log('  [ok] predicts function not exported');
}

async function testFunctionExistsNoPrediction() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{ from: VALID_ACCOUNT_ID, to: VALID_CONTRACT_ID, amount: 100 }],
        fn, [fn]
    );
    assert.ok(!report.predictedErrors.some(p => p.code === 'FUNCTION_NOT_EXPORTED'));
    console.log('  [ok] no prediction when function exists');
}

async function testEmptyAvailableFunctionsWarning() {
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{ from: VALID_ACCOUNT_ID }],
        null,
        []
    );
    assert.ok(report.warnings.some(w => w.includes('could not be discovered')));
    console.log('  [ok] warns when contract functions not discovered');
}

// ── Address validation prediction ─────────────────────────────

async function testInvalidAddressPrediction() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{ from: 'BAD_ADDRESS', to: VALID_CONTRACT_ID, amount: 100 }],
        fn, [fn]
    );
    assert.ok(report.predictedErrors.some(p => p.code === 'INVALID_ADDRESS_SHAPE'));
    console.log('  [ok] predicts invalid address shape');
}

async function testValidAddressNoPrediction() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{ from: VALID_ACCOUNT_ID, to: VALID_CONTRACT_ID, amount: 100 }],
        fn, [fn]
    );
    assert.ok(!report.predictedErrors.some(p => p.code === 'INVALID_ADDRESS_SHAPE'));
    console.log('  [ok] no prediction for valid addresses');
}

// ── Placeholder contract ID prediction ────────────────────────

async function testPlaceholderContractIdPrediction() {
    const fn = makeNoParamFunction();
    const placeholderId = 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCAAAAAAAAAAAAAAAAA';
    const report = service.validateSimulation(
        placeholderId, 'get_count', [{}], fn, [fn]
    );
    assert.ok(report.predictedErrors.some(p => p.code === 'LIKELY_NOT_FOUND'));
    console.log('  [ok] predicts placeholder contract ID');
}

// ── State-changing function prediction ────────────────────────

async function testStateChangingNoArgsPrediction() {
    const fn = makeFunction('set_value', [{ name: 'value', type: 'u32', required: true }]);
    const functions = [fn];
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'set_value',
        [{}],
        fn,
        functions
    );
    assert.ok(report.predictedErrors.some(p => p.code === 'MISSING_STATE_ARGUMENTS'));
    console.log('  [ok] predicts missing args for state-changing function');
}

async function testStateChangingWithArgsSafe() {
    const fn = makeMintFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'mint',
        [{ to: VALID_ACCOUNT_ID, amount: 100 }],
        fn, [fn]
    );
    assert.ok(!report.predictedErrors.some(p => p.code === 'MISSING_STATE_ARGUMENTS'));
    console.log('  [ok] no state warning when args are provided');
}

// ── Validation report structure ───────────────────────────────

async function testReportStructureValid() {
    const fn = makeNoParamFunction();
    const report = service.validateSimulation(VALID_CONTRACT_ID, 'get_count', [{}], fn, [fn]);
    assert.strictEqual(typeof report.valid, 'boolean');
    assert.ok(Array.isArray(report.errors));
    assert.ok(Array.isArray(report.warnings));
    assert.ok(Array.isArray(report.suggestions));
    assert.ok(Array.isArray(report.predictedErrors));
    console.log('  [ok] report has correct structure');
}

async function testReportDeduplicatesEntries() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{ from: 'BAD1', to: 'BAD2', amount: 100 }],
        fn, [fn]
    );
    const errorSet = new Set(report.errors);
    assert.strictEqual(report.errors.length, errorSet.size);
    const warningSet = new Set(report.warnings);
    assert.strictEqual(report.warnings.length, warningSet.size);
    console.log('  [ok] report deduplicates errors and warnings');
}

async function testSuggestionsProvidedForErrors() {
    const fn = makeTransferFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{}],
        fn, [fn]
    );
    assert.strictEqual(report.valid, false);
    assert.ok(report.suggestions.length > 0);
    console.log('  [ok] suggestions are provided alongside errors');
}

// ── Complex function validation ───────────────────────────────

async function testComplexFunctionAllOptionalMissing() {
    const fn = makeComplexFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'swap',
        [{ token_a: VALID_CONTRACT_ID, token_b: VALID_CONTRACT_ID, amount_a: 100, min_b: 50 }],
        fn, [fn]
    );
    assert.strictEqual(report.valid, true);
    console.log('  [ok] passes when optional params are omitted');
}

async function testComplexFunctionWithOptionals() {
    const fn = makeComplexFunction();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'swap',
        [{
            token_a: VALID_CONTRACT_ID,
            token_b: VALID_CONTRACT_ID,
            amount_a: 100,
            min_b: 50,
            deadline: 999999,
            recipient: VALID_ACCOUNT_ID
        }],
        fn, [fn]
    );
    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.errors.length, 0);
    console.log('  [ok] passes with all params including optionals');
}

// ── No selected function fallback ─────────────────────────────

async function testNullSelectedFunctionWithMatch() {
    const functions = makeTokenContractFunctions();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'transfer',
        [{ from: VALID_ACCOUNT_ID, to: VALID_CONTRACT_ID, amount: 100 }],
        null,
        functions
    );
    assert.ok(!report.errors.some(e => e.includes('was not found')));
    console.log('  [ok] finds function from available list when selected is null');
}

async function testNullSelectedFunctionNoMatch() {
    const functions = makeTokenContractFunctions();
    const report = service.validateSimulation(
        VALID_CONTRACT_ID, 'does_not_exist',
        [{}],
        null,
        functions
    );
    assert.ok(report.errors.some(e => e.includes('was not found')));
    console.log('  [ok] reports missing function when not in available list');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        // Contract ID validation
        testValidContractIdPasses,
        testEmptyContractIdFails,
        testShortContractIdFails,
        testContractIdWrongPrefixFails,
        testContractIdLowerCaseFails,
        // Function name validation
        testEmptyFunctionNameFails,
        testWhitespaceFunctionNameFails,
        // Arguments validation
        testNonArrayArgsFails,
        testMultipleArgsSuggestion,
        // Required parameter validation
        testAllRequiredParamsPresent,
        testMissingSingleRequiredParam,
        testMissingMultipleRequiredParams,
        testMissingAllRequiredParams,
        testEmptyArgsForRequiredParams,
        // Type validation
        testTypeMismatchBoolWarning,
        testTypeMismatchIntWarning,
        testTypeMismatchVecWarning,
        testTypeMismatchMapWarning,
        testStringNumberPassesIntType,
        // Unknown parameter detection
        testUnknownParameterWarning,
        testMultipleUnknownParameters,
        // Function existence prediction
        testFunctionNotExportedPrediction,
        testFunctionExistsNoPrediction,
        testEmptyAvailableFunctionsWarning,
        // Address validation prediction
        testInvalidAddressPrediction,
        testValidAddressNoPrediction,
        // Placeholder contract ID
        testPlaceholderContractIdPrediction,
        // State-changing function prediction
        testStateChangingNoArgsPrediction,
        testStateChangingWithArgsSafe,
        // Report structure
        testReportStructureValid,
        testReportDeduplicatesEntries,
        testSuggestionsProvidedForErrors,
        // Complex function validation
        testComplexFunctionAllOptionalMissing,
        testComplexFunctionWithOptionals,
        // Null selected function fallback
        testNullSelectedFunctionWithMatch,
        testNullSelectedFunctionNoMatch
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nformValidator unit tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (error) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${error instanceof Error ? error.stack || error.message : String(error)}`);
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch(error => {
    console.error('Test runner error:', error);
    process.exitCode = 1;
});
