declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { TestableContractInspector } from './mocks/testableContractInspector';
import { parseJson, parseFunctionArgs } from '../utils/jsonParser';
import {
    SIMPLE_HELP_OUTPUT,
    HELP_OUTPUT_WITH_SUBCOMMANDS,
    HELP_OUTPUT_USAGE_FORMAT,
    EMPTY_HELP_OUTPUT,
    HELP_OUTPUT_NO_FUNCTIONS,
    FUNCTION_HELP_TRANSFER,
    FUNCTION_HELP_OPTIONAL_PARAMS,
    FUNCTION_HELP_NO_PARAMS,
    FUNCTION_HELP_MIXED_REQUIRED
} from './fixtures/formGenerationFixtures';

const inspector = new TestableContractInspector();

// ── ABI parsing: parseHelpOutput ──────────────────────────────

async function testParseCommandsSection() {
    const functions = inspector.parseHelpOutput(SIMPLE_HELP_OUTPUT);

    assert.strictEqual(functions.length, 3);
    assert.strictEqual(functions[0].name, 'hello');
    assert.strictEqual(functions[0].description, 'Say hello to someone');
    assert.strictEqual(functions[1].name, 'get_count');
    assert.strictEqual(functions[2].name, 'increment');
    console.log('  [ok] parses functions from Commands section');
}

async function testParseSubcommandsSection() {
    const functions = inspector.parseHelpOutput(HELP_OUTPUT_WITH_SUBCOMMANDS);

    assert.strictEqual(functions.length, 5);
    const names = functions.map((f: any) => f.name);
    assert.ok(names.includes('transfer'));
    assert.ok(names.includes('balance'));
    assert.ok(names.includes('approve'));
    assert.ok(names.includes('mint'));
    assert.ok(names.includes('burn'));
    console.log('  [ok] parses functions from Subcommands section');
}

async function testParseFunctionDescriptions() {
    const functions = inspector.parseHelpOutput(HELP_OUTPUT_WITH_SUBCOMMANDS);

    const transfer = functions.find((f: any) => f.name === 'transfer');
    assert.ok(transfer);
    assert.strictEqual(transfer!.description, 'Transfer tokens between accounts');

    const balance = functions.find((f: any) => f.name === 'balance');
    assert.strictEqual(balance!.description, 'Get token balance for an address');
    console.log('  [ok] preserves function descriptions');
}

async function testParseUsageFallback() {
    const functions = inspector.parseHelpOutput(HELP_OUTPUT_USAGE_FORMAT);

    assert.strictEqual(functions.length, 2);
    const names = functions.map((f: any) => f.name);
    assert.ok(names.includes('deposit'));
    assert.ok(names.includes('withdraw'));
    console.log('  [ok] falls back to Usage pattern when no Commands section');
}

async function testParseEmptyHelp() {
    const functions = inspector.parseHelpOutput(EMPTY_HELP_OUTPUT);
    assert.strictEqual(functions.length, 0);
    console.log('  [ok] returns empty array for empty help output');
}

async function testParseNoFunctions() {
    const functions = inspector.parseHelpOutput(HELP_OUTPUT_NO_FUNCTIONS);
    assert.strictEqual(functions.length, 0);
    console.log('  [ok] returns empty array when no functions found');
}

async function testNoDuplicateFunctions() {
    const duplicateHelp = `Commands:
  hello          Say hello
  hello          Duplicate entry
  world          Say world
`;
    const functions = inspector.parseHelpOutput(duplicateHelp);
    assert.strictEqual(functions.length, 2);
    assert.strictEqual(functions[0].name, 'hello');
    assert.strictEqual(functions[1].name, 'world');
    console.log('  [ok] deduplicates function names');
}

async function testStopsAtOptionsSection() {
    const helpWithOptions = `Commands:
  func_a         First function
  func_b         Second function

Options:
  --help         Not a function
  --version      Also not a function
`;
    const functions = inspector.parseHelpOutput(helpWithOptions);
    assert.strictEqual(functions.length, 2);
    assert.ok(!functions.some((f: any) => f.name === 'help'));
    assert.ok(!functions.some((f: any) => f.name === 'version'));
    console.log('  [ok] stops parsing at Options section');
}

async function testStopsAtGlobalOptions() {
    const functions = inspector.parseHelpOutput(HELP_OUTPUT_WITH_SUBCOMMANDS);
    assert.ok(!functions.some((f: any) => f.name === 'help'));
    console.log('  [ok] stops parsing at Global Options section');
}

async function testInitializesEmptyParameters() {
    const functions = inspector.parseHelpOutput(SIMPLE_HELP_OUTPUT);
    for (const fn of functions) {
        assert.ok(Array.isArray(fn.parameters));
        assert.strictEqual(fn.parameters.length, 0);
    }
    console.log('  [ok] initializes parameters as empty arrays');
}

// ── ABI parsing: parseFunctionHelp (field generation) ─────────

async function testParseRequiredParameters() {
    const fn = inspector.parseFunctionHelp('transfer', FUNCTION_HELP_TRANSFER);

    assert.strictEqual(fn.name, 'transfer');
    assert.strictEqual(fn.parameters.length, 3);

    const from = fn.parameters.find(p => p.name === 'from');
    assert.ok(from);
    assert.strictEqual(from!.type, 'Address');
    assert.strictEqual(from!.required, true);
    assert.ok(from!.description!.length > 0);

    const amount = fn.parameters.find(p => p.name === 'amount');
    assert.ok(amount);
    assert.strictEqual(amount!.type, 'i128');
    assert.strictEqual(amount!.required, true);
    console.log('  [ok] parses required parameters with types');
}

async function testParseOptionalParameters() {
    const fn = inspector.parseFunctionHelp('initialize', FUNCTION_HELP_OPTIONAL_PARAMS);

    assert.strictEqual(fn.parameters.length, 4);

    const admin = fn.parameters.find(p => p.name === 'admin');
    assert.strictEqual(admin!.required, true);

    const name = fn.parameters.find(p => p.name === 'name');
    assert.strictEqual(name!.required, false);

    const symbol = fn.parameters.find(p => p.name === 'symbol');
    assert.strictEqual(symbol!.required, false);

    const decimals = fn.parameters.find(p => p.name === 'decimals');
    assert.strictEqual(decimals!.required, false);
    console.log('  [ok] identifies optional parameters');
}

async function testParseParameterTypes() {
    const fn = inspector.parseFunctionHelp('transfer', FUNCTION_HELP_TRANSFER);

    const types = fn.parameters.map(p => p.type);
    assert.deepStrictEqual(types, ['Address', 'Address', 'i128']);
    console.log('  [ok] extracts parameter types correctly');
}

async function testParseParameterDescriptions() {
    const fn = inspector.parseFunctionHelp('transfer', FUNCTION_HELP_TRANSFER);

    const from = fn.parameters.find(p => p.name === 'from');
    assert.strictEqual(from!.description, 'The sender account address');

    const to = fn.parameters.find(p => p.name === 'to');
    assert.strictEqual(to!.description, 'The recipient account address');
    console.log('  [ok] extracts parameter descriptions');
}

async function testParseFunctionWithNoParams() {
    const fn = inspector.parseFunctionHelp('get_count', FUNCTION_HELP_NO_PARAMS);

    assert.strictEqual(fn.name, 'get_count');
    assert.strictEqual(fn.parameters.length, 0);
    console.log('  [ok] handles functions with no parameters');
}

async function testParseMixedRequiredOptional() {
    const fn = inspector.parseFunctionHelp('swap', FUNCTION_HELP_MIXED_REQUIRED);

    assert.strictEqual(fn.parameters.length, 6);

    const required = fn.parameters.filter(p => p.required);
    const optional = fn.parameters.filter(p => !p.required);

    assert.strictEqual(required.length, 4);
    assert.strictEqual(optional.length, 2);

    assert.ok(required.some(p => p.name === 'token_a'));
    assert.ok(required.some(p => p.name === 'amount_a'));
    assert.ok(optional.some(p => p.name === 'deadline'));
    assert.ok(optional.some(p => p.name === 'recipient'));
    console.log('  [ok] separates required and optional parameters');
}

async function testParseEmptyFunctionHelp() {
    const fn = inspector.parseFunctionHelp('empty', '');
    assert.strictEqual(fn.name, 'empty');
    assert.strictEqual(fn.parameters.length, 0);
    console.log('  [ok] handles empty function help text');
}

async function testParseArgumentsSection() {
    const fn = inspector.parseFunctionHelp('transfer', FUNCTION_HELP_TRANSFER);
    assert.ok(fn.parameters.length > 0);
    console.log('  [ok] parses Arguments section header');
}

async function testParseParametersSection() {
    const fn = inspector.parseFunctionHelp('initialize', FUNCTION_HELP_OPTIONAL_PARAMS);
    assert.ok(fn.parameters.length > 0);
    console.log('  [ok] parses Parameters section header');
}

async function testDefaultMarkerDetection() {
    const fn = inspector.parseFunctionHelp('initialize', FUNCTION_HELP_OPTIONAL_PARAMS);
    const symbol = fn.parameters.find(p => p.name === 'symbol');
    assert.strictEqual(symbol!.required, false);
    console.log('  [ok] treats parameters with default: as optional');
}

// ── Form state: JSON parsing ──────────────────────────────────

async function testParseJsonValid() {
    const result = parseJson('{"name": "world"}');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, { name: 'world' });
    console.log('  [ok] parses valid JSON object');
}

async function testParseJsonArray() {
    const result = parseJson('[1, 2, 3]');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, [1, 2, 3]);
    console.log('  [ok] parses valid JSON array');
}

async function testParseJsonPrimitive() {
    const result = parseJson('"hello"');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data, 'hello');
    console.log('  [ok] parses JSON primitive string');
}

async function testParseJsonNumber() {
    const result = parseJson('42');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data, 42);
    console.log('  [ok] parses JSON number');
}

async function testParseJsonEmpty() {
    const result = parseJson('');
    assert.strictEqual(result.success, false);
    assert.ok(result.error!.includes('empty'));
    console.log('  [ok] rejects empty string');
}

async function testParseJsonWhitespace() {
    const result = parseJson('   ');
    assert.strictEqual(result.success, false);
    console.log('  [ok] rejects whitespace-only string');
}

async function testParseJsonInvalid() {
    const result = parseJson('{invalid json}');
    assert.strictEqual(result.success, false);
    assert.ok(result.error!.includes('Invalid JSON'));
    console.log('  [ok] returns error for invalid JSON');
}

async function testParseJsonNestedObject() {
    const result = parseJson('{"outer": {"inner": true}}');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, { outer: { inner: true } });
    console.log('  [ok] parses nested JSON objects');
}

async function testParseJsonWithWhitespace() {
    const result = parseJson('  { "name" : "value" }  ');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, { name: 'value' });
    console.log('  [ok] trims whitespace before parsing');
}

// ── Form state: parseFunctionArgs ─────────────────────────────

async function testParseFunctionArgsObject() {
    const result = parseFunctionArgs('{"from": "GA...", "to": "CA...", "amount": 100}');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, ['GA...', 'CA...', 100]);
    console.log('  [ok] converts object values to array');
}

async function testParseFunctionArgsArray() {
    const result = parseFunctionArgs('[1, 2, 3]');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, [1, 2, 3]);
    console.log('  [ok] preserves array arguments as-is');
}

async function testParseFunctionArgsSingleValue() {
    const result = parseFunctionArgs('42');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, [42]);
    console.log('  [ok] wraps single value in array');
}

async function testParseFunctionArgsString() {
    const result = parseFunctionArgs('"hello"');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, ['hello']);
    console.log('  [ok] wraps single string in array');
}

async function testParseFunctionArgsEmptyObject() {
    const result = parseFunctionArgs('{}');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, []);
    console.log('  [ok] converts empty object to empty array');
}

async function testParseFunctionArgsEmptyArray() {
    const result = parseFunctionArgs('[]');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, []);
    console.log('  [ok] preserves empty array');
}

async function testParseFunctionArgsInvalid() {
    const result = parseFunctionArgs('{bad}');
    assert.strictEqual(result.success, false);
    assert.ok(result.error!.includes('Invalid JSON'));
    console.log('  [ok] returns error for invalid arguments');
}

async function testParseFunctionArgsEmpty() {
    const result = parseFunctionArgs('');
    assert.strictEqual(result.success, false);
    console.log('  [ok] returns error for empty arguments');
}

async function testParseFunctionArgsBoolean() {
    const result = parseFunctionArgs('true');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, [true]);
    console.log('  [ok] wraps boolean in array');
}

async function testParseFunctionArgsNull() {
    const result = parseFunctionArgs('null');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, [null]);
    console.log('  [ok] wraps null in array');
}

async function testParseFunctionArgsNestedObject() {
    const result = parseFunctionArgs('{"config": {"admin": "GA...", "fee": 10}}');
    assert.strictEqual(result.success, true);
    assert.ok(Array.isArray(result.data));
    assert.strictEqual(result.data!.length, 1);
    assert.deepStrictEqual(result.data![0], { admin: 'GA...', fee: 10 });
    console.log('  [ok] converts nested object values to array');
}

// ── Edge cases ────────────────────────────────────────────────

async function testParseHelpWithIndentedFunctions() {
    const indentedHelp = `Commands:
    hello          Say hello
    world          Say world
`;
    const functions = inspector.parseHelpOutput(indentedHelp);
    assert.strictEqual(functions.length, 2);
    assert.strictEqual(functions[0].name, 'hello');
    assert.strictEqual(functions[1].name, 'world');
    console.log('  [ok] handles indented function names');
}

async function testParseHelpWithUnderscoreNames() {
    const underscoreHelp = `Commands:
  get_balance          Get the balance
  set_admin_role       Set admin role
  calculate_fee_v2     Calculate fee version 2
`;
    const functions = inspector.parseHelpOutput(underscoreHelp);
    assert.strictEqual(functions.length, 3);
    assert.strictEqual(functions[0].name, 'get_balance');
    assert.strictEqual(functions[1].name, 'set_admin_role');
    assert.strictEqual(functions[2].name, 'calculate_fee_v2');
    console.log('  [ok] handles underscore-separated function names');
}

async function testParseFunctionHelpWithSingleDashParam() {
    const singleDashHelp = `Parameters:
  -v <u32>  The version number
  -n <String>  The name
`;
    const fn = inspector.parseFunctionHelp('test', singleDashHelp);
    assert.strictEqual(fn.parameters.length, 0);
    console.log('  [ok] single-dash params are not captured by parser');
}

async function testParseFunctionHelpWithoutType() {
    const noTypeHelp = `Arguments:
  --verbose    Enable verbose output
  --dry_run    Run without executing
`;
    const fn = inspector.parseFunctionHelp('test', noTypeHelp);
    assert.strictEqual(fn.parameters.length, 2);
    assert.strictEqual(fn.parameters[0].type, undefined);
    assert.strictEqual(fn.parameters[1].type, undefined);
    console.log('  [ok] handles parameters without type annotations');
}

async function testParseFunctionHelpPreservesOrder() {
    const fn = inspector.parseFunctionHelp('swap', FUNCTION_HELP_MIXED_REQUIRED);
    const names = fn.parameters.map(p => p.name);
    assert.deepStrictEqual(names, ['token_a', 'token_b', 'amount_a', 'min_b', 'deadline', 'recipient']);
    console.log('  [ok] preserves parameter order');
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        // ABI parsing: parseHelpOutput
        testParseCommandsSection,
        testParseSubcommandsSection,
        testParseFunctionDescriptions,
        testParseUsageFallback,
        testParseEmptyHelp,
        testParseNoFunctions,
        testNoDuplicateFunctions,
        testStopsAtOptionsSection,
        testStopsAtGlobalOptions,
        testInitializesEmptyParameters,
        // ABI parsing: parseFunctionHelp (field generation)
        testParseRequiredParameters,
        testParseOptionalParameters,
        testParseParameterTypes,
        testParseParameterDescriptions,
        testParseFunctionWithNoParams,
        testParseMixedRequiredOptional,
        testParseEmptyFunctionHelp,
        testParseArgumentsSection,
        testParseParametersSection,
        testDefaultMarkerDetection,
        // Form state: JSON parsing
        testParseJsonValid,
        testParseJsonArray,
        testParseJsonPrimitive,
        testParseJsonNumber,
        testParseJsonEmpty,
        testParseJsonWhitespace,
        testParseJsonInvalid,
        testParseJsonNestedObject,
        testParseJsonWithWhitespace,
        // Form state: parseFunctionArgs
        testParseFunctionArgsObject,
        testParseFunctionArgsArray,
        testParseFunctionArgsSingleValue,
        testParseFunctionArgsString,
        testParseFunctionArgsEmptyObject,
        testParseFunctionArgsEmptyArray,
        testParseFunctionArgsInvalid,
        testParseFunctionArgsEmpty,
        testParseFunctionArgsBoolean,
        testParseFunctionArgsNull,
        testParseFunctionArgsNestedObject,
        // Edge cases
        testParseHelpWithIndentedFunctions,
        testParseHelpWithUnderscoreNames,
        testParseFunctionHelpWithSingleDashParam,
        testParseFunctionHelpWithoutType,
        testParseFunctionHelpPreservesOrder
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nformGenerator unit tests');
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
