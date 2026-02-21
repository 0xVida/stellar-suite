// src/test/abiFormGenerator.test.ts
// Unit tests for the ABI form generation system.
// No vscode dependency — pure TypeScript modules only.

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { parseTypeString, parseParameters, AbiParameter } from '../utils/abiParser';
import { AbiFormGeneratorService } from '../services/abiFormGeneratorService';
import { FormValidationService } from '../services/formValidationService';
import { InputSanitizationService } from '../services/inputSanitizationService';
import { FunctionParameter, ContractFunction } from '../services/contractInspector';

const formGenerator = new AbiFormGeneratorService();
const formValidator = new FormValidationService();
const sanitizer = new InputSanitizationService();

// ── parseTypeString tests ──────────────────────────────────────

async function testParseTypeStringBool() {
    const t = parseTypeString('bool');
    assert.strictEqual(t.kind, 'primitive');
    assert.ok(t.kind === 'primitive' && t.name === 'bool');
    console.log('  [ok] parseTypeString: bool → primitive');
}

async function testParseTypeStringU64() {
    const t = parseTypeString('u64');
    assert.strictEqual(t.kind, 'primitive');
    assert.ok(t.kind === 'primitive' && t.name === 'u64');
    console.log('  [ok] parseTypeString: u64 → primitive');
}

async function testParseTypeStringI128() {
    const t = parseTypeString('i128');
    assert.strictEqual(t.kind, 'primitive');
    assert.ok(t.kind === 'primitive' && t.name === 'i128');
    console.log('  [ok] parseTypeString: i128 → primitive');
}

async function testParseTypeStringAddress() {
    const t = parseTypeString('Address');
    assert.strictEqual(t.kind, 'primitive');
    assert.ok(t.kind === 'primitive' && t.name === 'Address');
    console.log('  [ok] parseTypeString: Address → primitive');
}

async function testParseTypeStringString() {
    const t = parseTypeString('String');
    assert.strictEqual(t.kind, 'primitive');
    assert.ok(t.kind === 'primitive' && t.name === 'String');
    console.log('  [ok] parseTypeString: String → primitive');
}

async function testParseTypeStringBytes() {
    const t = parseTypeString('Bytes');
    assert.strictEqual(t.kind, 'primitive');
    assert.ok(t.kind === 'primitive' && t.name === 'Bytes');
    console.log('  [ok] parseTypeString: Bytes → primitive');
}

async function testParseTypeStringOptionU64() {
    const t = parseTypeString('Option<u64>');
    assert.strictEqual(t.kind, 'option');
    assert.ok(t.kind === 'option' && t.inner.kind === 'primitive');
    assert.ok(t.kind === 'option' && t.inner.kind === 'primitive' && t.inner.name === 'u64');
    console.log('  [ok] parseTypeString: Option<u64> → option with u64 inner');
}

async function testParseTypeStringVecAddress() {
    const t = parseTypeString('Vec<Address>');
    assert.strictEqual(t.kind, 'vec');
    assert.ok(t.kind === 'vec' && t.element.kind === 'primitive');
    assert.ok(t.kind === 'vec' && t.element.kind === 'primitive' && t.element.name === 'Address');
    console.log('  [ok] parseTypeString: Vec<Address> → vec with Address element');
}

async function testParseTypeStringMapU32String() {
    const t = parseTypeString('Map<u32,String>');
    assert.strictEqual(t.kind, 'map');
    assert.ok(t.kind === 'map' && t.key.kind === 'primitive');
    assert.ok(t.kind === 'map' && t.value.kind === 'primitive');
    assert.ok(t.kind === 'map' && t.key.kind === 'primitive' && t.key.name === 'u32');
    assert.ok(t.kind === 'map' && t.value.kind === 'primitive' && t.value.name === 'String');
    console.log('  [ok] parseTypeString: Map<u32,String> → map with correct key/value');
}

async function testParseTypeStringNestedVecInMap() {
    // Map<Vec<u32>,String> — comma is inside nested generic, must not split incorrectly
    const t = parseTypeString('Map<Vec<u32>,String>');
    assert.strictEqual(t.kind, 'map');
    assert.ok(t.kind === 'map' && t.key.kind === 'vec', `expected key.kind=vec, got ${t.kind === 'map' ? t.key.kind : 'n/a'}`);
    assert.ok(t.kind === 'map' && t.value.kind === 'primitive' && t.value.name === 'String');
    console.log('  [ok] parseTypeString: Map<Vec<u32>,String> → nested map parsed correctly');
}

async function testParseTypeStringCustomType() {
    const t = parseTypeString('MyCustomEnum');
    assert.strictEqual(t.kind, 'custom');
    assert.ok(t.kind === 'custom' && t.name === 'MyCustomEnum');
    console.log('  [ok] parseTypeString: MyCustomEnum → custom type');
}

// ── parseParameters tests ─────────────────────────────────────

async function testParseParametersMapsTypes() {
    const rawParams: FunctionParameter[] = [
        { name: 'from', type: 'Address', required: true },
        { name: 'amount', type: 'i128', required: true },
        { name: 'memo', type: 'Option<String>', required: false, description: 'Optional memo' },
    ];
    const abiParams = parseParameters(rawParams);

    assert.strictEqual(abiParams.length, 3);
    assert.strictEqual(abiParams[0].name, 'from');
    assert.ok(abiParams[0].sorobanType.kind === 'primitive');
    assert.strictEqual(abiParams[1].name, 'amount');
    assert.ok(abiParams[1].sorobanType.kind === 'primitive' && abiParams[1].sorobanType.name === 'i128');
    assert.strictEqual(abiParams[2].name, 'memo');
    assert.ok(abiParams[2].sorobanType.kind === 'option');
    assert.strictEqual(abiParams[2].required, false);
    assert.strictEqual(abiParams[2].description, 'Optional memo');
    console.log('  [ok] parseParameters: maps FunctionParameter[] to AbiParameter[] correctly');
}

async function testParseParametersFallbackType() {
    const rawParams: FunctionParameter[] = [
        { name: 'data', required: true }, // no type property
    ];
    const abiParams = parseParameters(rawParams);
    assert.strictEqual(abiParams[0].sorobanType.kind, 'primitive');
    assert.ok(abiParams[0].sorobanType.kind === 'primitive' && abiParams[0].sorobanType.name === 'String');
    console.log('  [ok] parseParameters: missing type defaults to String');
}

// ── AbiFormGeneratorService.generateForm tests ────────────────

function makeContractFunction(name: string, params: FunctionParameter[]): ContractFunction {
    return { name, parameters: params };
}

async function testGenerateFormContainsSelectForBool() {
    const rawParams: FunctionParameter[] = [{ name: 'active', type: 'bool', required: true }];
    const abiParams = parseParameters(rawParams);
    const form = formGenerator.generateForm('CABC123', makeContractFunction('set_active', rawParams), abiParams);

    assert.ok(form.formHtml.includes('<select'), 'bool should produce a <select>');
    assert.ok(form.formHtml.includes('name="active"'), 'input should have correct name attr');
    assert.ok(form.formHtml.includes('<option value="true">'), 'should include true option');
    assert.ok(form.formHtml.includes('<option value="false">'), 'should include false option');
    console.log('  [ok] generateForm: bool type produces <select> with true/false options');
}

async function testGenerateFormContainsNumberForU64() {
    const rawParams: FunctionParameter[] = [{ name: 'amount', type: 'u64', required: true }];
    const abiParams = parseParameters(rawParams);
    const form = formGenerator.generateForm('CABC123', makeContractFunction('mint', rawParams), abiParams);

    assert.ok(form.formHtml.includes('type="number"'), 'u64 should produce type="number" input');
    assert.ok(form.formHtml.includes('min="0"'), 'unsigned integer should have min="0"');
    console.log('  [ok] generateForm: u64 type produces <input type="number" min="0">');
}

async function testGenerateFormContainsPatternForAddress() {
    const rawParams: FunctionParameter[] = [{ name: 'recipient', type: 'Address', required: true }];
    const abiParams = parseParameters(rawParams);
    const form = formGenerator.generateForm('CABC123', makeContractFunction('transfer', rawParams), abiParams);

    assert.ok(form.formHtml.includes('pattern="[CG][A-Z0-9]{55}"'), 'Address should have address pattern');
    assert.ok(form.formHtml.includes('maxlength="56"'), 'Address should have maxlength=56');
    console.log('  [ok] generateForm: Address type produces input with address pattern and maxlength');
}

async function testGenerateFormContainsTextareaForVec() {
    const rawParams: FunctionParameter[] = [{ name: 'recipients', type: 'Vec<Address>', required: true }];
    const abiParams = parseParameters(rawParams);
    const form = formGenerator.generateForm('CABC123', makeContractFunction('batch_transfer', rawParams), abiParams);

    assert.ok(form.formHtml.includes('<textarea'), 'Vec type should produce <textarea>');
    assert.ok(form.formHtml.includes('["item1", "item2"]'), 'Vec textarea should have array placeholder');
    console.log('  [ok] generateForm: Vec<T> type produces <textarea> with JSON array placeholder');
}

async function testGenerateFormContainsNoneCheckboxForOption() {
    const rawParams: FunctionParameter[] = [{ name: 'memo', type: 'Option<String>', required: false }];
    const abiParams = parseParameters(rawParams);
    const form = formGenerator.generateForm('CABC123', makeContractFunction('transfer', rawParams), abiParams);

    assert.ok(form.formHtml.includes('none-toggle'), 'Option type should include None checkbox class');
    assert.ok(form.formHtml.includes('None (omit this parameter)'), 'should have None label text');
    console.log('  [ok] generateForm: Option<T> includes None checkbox control');
}

async function testGenerateFormMetadata() {
    const rawParams: FunctionParameter[] = [{ name: 'from', type: 'Address', required: true }];
    const abiParams = parseParameters(rawParams);
    const form = formGenerator.generateForm('CONTRACT_ID_123', makeContractFunction('transfer', rawParams), abiParams);

    assert.strictEqual(form.functionName, 'transfer');
    assert.strictEqual(form.contractId, 'CONTRACT_ID_123');
    assert.strictEqual(form.fields.length, 1);
    assert.strictEqual(form.fields[0].paramName, 'from');
    assert.strictEqual(form.fields[0].required, true);
    console.log('  [ok] generateForm: returns correct metadata in GeneratedForm');
}

async function testGenerateFormNoParams() {
    const form = formGenerator.generateForm('CABC123', makeContractFunction('get_balance', []), []);
    assert.ok(form.formHtml.includes('no-params') || form.formHtml.includes('no parameters'), 'should indicate no parameters');
    assert.strictEqual(form.fields.length, 0);
    console.log('  [ok] generateForm: zero-parameter function shows no-params message');
}

// ── FormValidationService.validate tests ─────────────────────

async function testValidateValidData() {
    const abiParams = parseParameters([
        { name: 'from', type: 'Address', required: true },
        { name: 'amount', type: 'u32', required: true },
    ]);
    const formData = {
        from: 'GABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
        amount: '100',
    };
    const result = formValidator.validate(formData, abiParams, sanitizer);

    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, {});
    assert.strictEqual(result.sanitizedArgs['amount'], 100);
    console.log('  [ok] validate: valid data passes and sanitizes types');
}

async function testValidateMissingRequiredField() {
    const abiParams = parseParameters([
        { name: 'from', type: 'Address', required: true },
        { name: 'to', type: 'Address', required: true },
    ]);
    const formData = {
        from: 'GABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
        to: '',
    };
    const result = formValidator.validate(formData, abiParams, sanitizer);

    assert.strictEqual(result.valid, false);
    assert.ok('to' in result.errors, 'should report error for missing required "to"');
    console.log('  [ok] validate: missing required field produces error');
}

async function testValidateTypeMismatchBool() {
    const abiParams = parseParameters([
        { name: 'active', type: 'bool', required: true },
    ]);
    const formData = { active: 'yes' }; // not 'true' or 'false'
    const result = formValidator.validate(formData, abiParams, sanitizer);

    assert.strictEqual(result.valid, false);
    assert.ok('active' in result.errors, 'should report error for invalid bool value');
    console.log('  [ok] validate: invalid bool value produces error');
}

async function testValidateOptionalFieldOmitted() {
    const abiParams = parseParameters([
        { name: 'memo', type: 'Option<String>', required: false },
    ]);
    const formData = { memo: '' }; // empty = None
    const result = formValidator.validate(formData, abiParams, sanitizer);

    assert.strictEqual(result.valid, true);
    assert.ok(!('memo' in result.sanitizedArgs), 'empty optional should be omitted from sanitizedArgs');
    console.log('  [ok] validate: empty optional field is omitted from sanitizedArgs');
}

async function testValidateOptionalFieldWithValue() {
    const abiParams = parseParameters([
        { name: 'memo', type: 'Option<String>', required: false },
    ]);
    const formData = { memo: 'hello world' };
    const result = formValidator.validate(formData, abiParams, sanitizer);

    assert.strictEqual(result.valid, true);
    assert.ok('memo' in result.sanitizedArgs);
    assert.strictEqual(result.sanitizedArgs['memo'], 'hello world');
    console.log('  [ok] validate: optional field with value is included in sanitizedArgs');
}

async function testValidateJsonFieldVec() {
    const abiParams = parseParameters([
        { name: 'items', type: 'Vec<u32>', required: true },
    ]);
    const formData = { items: '[1, 2, 3]' };
    const result = formValidator.validate(formData, abiParams, sanitizer);

    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.sanitizedArgs['items'], [1, 2, 3]);
    console.log('  [ok] validate: Vec<T> JSON array is parsed into sanitizedArgs');
}

async function testValidateInvalidJsonField() {
    const abiParams = parseParameters([
        { name: 'config', type: 'Map<String,u32>', required: true },
    ]);
    const formData = { config: 'not valid json {{{' };
    const result = formValidator.validate(formData, abiParams, sanitizer);

    assert.strictEqual(result.valid, false);
    assert.ok('config' in result.errors, 'should report error for invalid JSON');
    console.log('  [ok] validate: invalid JSON for Map field produces error');
}

async function testValidateBoolCoercedToBoolean() {
    const abiParams = parseParameters([
        { name: 'flag', type: 'bool', required: true },
    ]);
    const result = formValidator.validate({ flag: 'true' }, abiParams, sanitizer);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.sanitizedArgs['flag'], true);
    assert.strictEqual(typeof result.sanitizedArgs['flag'], 'boolean');
    console.log('  [ok] validate: bool "true" is coerced to boolean true');
}

async function testValidateAddressContractPrefix() {
    const abiParams = parseParameters([
        { name: 'target', type: 'Address', required: true },
    ]);
    // Contract address (C prefix)
    const result = formValidator.validate(
        { target: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1' },
        abiParams,
        sanitizer
    );
    assert.strictEqual(result.valid, true);
    console.log('  [ok] validate: C... contract address is accepted');
}

async function testValidateU32OutOfRange() {
    const abiParams = parseParameters([
        { name: 'amount', type: 'u32', required: true },
    ]);
    const result = formValidator.validate({ amount: '99999999999' }, abiParams, sanitizer);
    assert.strictEqual(result.valid, false);
    assert.ok('amount' in result.errors);
    console.log('  [ok] validate: u32 value out of range produces error');
}

// ── Test Runner ───────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        testParseTypeStringBool,
        testParseTypeStringU64,
        testParseTypeStringI128,
        testParseTypeStringAddress,
        testParseTypeStringString,
        testParseTypeStringBytes,
        testParseTypeStringOptionU64,
        testParseTypeStringVecAddress,
        testParseTypeStringMapU32String,
        testParseTypeStringNestedVecInMap,
        testParseTypeStringCustomType,
        testParseParametersMapsTypes,
        testParseParametersFallbackType,
        testGenerateFormContainsSelectForBool,
        testGenerateFormContainsNumberForU64,
        testGenerateFormContainsPatternForAddress,
        testGenerateFormContainsTextareaForVec,
        testGenerateFormContainsNoneCheckboxForOption,
        testGenerateFormMetadata,
        testGenerateFormNoParams,
        testValidateValidData,
        testValidateMissingRequiredField,
        testValidateTypeMismatchBool,
        testValidateOptionalFieldOmitted,
        testValidateOptionalFieldWithValue,
        testValidateJsonFieldVec,
        testValidateInvalidJsonField,
        testValidateBoolCoercedToBoolean,
        testValidateAddressContractPrefix,
        testValidateU32OutOfRange,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nabiFormGenerator unit tests');
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
