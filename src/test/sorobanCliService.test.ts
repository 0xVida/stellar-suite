declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
import { SimulationValidationService } from '../services/simulationValidationService';
import { ContractFunction } from '../services/contractInspector';

const service = new SimulationValidationService();

function sampleFunction(): ContractFunction {
    return {
        name: 'transfer',
        parameters: [
            { name: 'from', type: 'Address', required: true },
            { name: 'to', type: 'Address', required: true },
            { name: 'amount', type: 'i128', required: true },
        ],
    };
}

async function testValidRequestPasses() {
    const fn = sampleFunction();
    const report = service.validateSimulation(
        'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
        'transfer',
        [{
            from: 'GABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
            to: 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
            amount: 10,
        }],
        fn,
        [fn]
    );

    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.errors.length, 0);
    console.log('  [ok] passes valid simulation input');
}

async function testMissingRequiredParameterFails() {
    const fn = sampleFunction();
    const report = service.validateSimulation(
        'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
        'transfer',
        [{ from: 'GABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST' }],
        fn,
        [fn]
    );

    assert.strictEqual(report.valid, false);
    assert.ok(report.errors.some((error: string) => error.includes('Missing required parameter: to')));
    assert.ok(report.suggestions.length > 0);
    console.log('  [ok] fails when required parameter is missing');
}

async function testFunctionSignaturePrediction() {
    const fn = sampleFunction();
    const report = service.validateSimulation(
        'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
        'mint',
        [{}],
        null,
        [fn]
    );

    assert.strictEqual(report.valid, false);
    assert.ok(report.predictedErrors.some(prediction => prediction.code === 'FUNCTION_NOT_EXPORTED'));
    console.log('  [ok] predicts missing function export');
}

async function testTypeWarningAndUnknownParameter() {
    const fn = sampleFunction();
    const report = service.validateSimulation(
        'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
        'transfer',
        [{
            from: 'BAD_ADDRESS',
            to: 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
            amount: 'abc',
            memo: 'hello',
        }],
        fn,
        [fn]
    );

    assert.ok(report.warnings.some((warning: string) => warning.includes('Type mismatch for parameter "amount"')));
    assert.ok(report.warnings.some((warning: string) => warning.includes('Unknown parameter provided: memo')));
    assert.ok(report.predictedErrors.some(prediction => prediction.code === 'INVALID_ADDRESS_SHAPE'));
    console.log('  [ok] warns on type mismatch and unknown parameter');
}

async function run() {
    const tests: Array<() => Promise<void>> = [
        testValidRequestPasses,
        testMissingRequiredParameterFails,
        testFunctionSignaturePrediction,
        testTypeWarningAndUnknownParameter,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nsimulationValidationService unit tests');
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
