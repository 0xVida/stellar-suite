// src/test/rustSourceParser.test.ts
// Unit tests for Rust source code parsing, signature caching,
// and source inspector integration.

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import { parseRustSource, parseParameterList, hashContent } from '../utils/rustSourceParser';
import { SignatureCacheService } from '../services/signatureCacheService';
import { SourceInspectorService } from '../services/sourceInspectorService';
import { ParsedRustFile } from '../types/rustParser';

// ── Test helpers ──────────────────────────────────────────────

function createMockContext() {
    const store: Record<string, unknown> = {};
    return {
        workspaceState: {
            get<T>(key: string, defaultValue: T): T {
                return (store[key] as T) ?? defaultValue;
            },
            update(key: string, value: unknown): Promise<void> {
                store[key] = value;
                return Promise.resolve();
            },
        },
    };
}

const logs: string[] = [];
function createMockOutput() {
    return { appendLine: (msg: string) => { logs.push(msg); } };
}

// ── Sample Rust sources ───────────────────────────────────────

const SIMPLE_CONTRACT = `
#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct MyContract;

#[contractimpl]
impl MyContract {
    /// Initialize the contract.
    pub fn initialize(env: Env, admin: Address) {
        // body
    }

    /// Transfer tokens from one account to another.
    ///
    /// # Arguments
    /// * \`from\` - Source account
    /// * \`to\` - Destination account
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> bool {
        true
    }

    pub fn balance(env: Env, account: Address) -> u128 {
        0
    }

    fn internal_helper(env: &Env) {
        // private, should not appear as contract function
    }
}
`;

const MULTILINE_CONTRACT = `
#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create a new escrow.
    pub fn deposit(
        env: Env,
        payer: Address,
        payee: Address,
        arbiter: Address,
        amount: u128,
        release_after: u64,
        required_approvals: u32,
    ) -> u64 {
        0
    }
}
`;

const RESULT_RETURN_TYPE = `
#[contract]
pub struct MultisigWallet;

#[contractimpl]
impl MultisigWallet {
    pub fn initialize(
        env: Env,
        signers: Vec<Address>,
        threshold: u32,
    ) -> Result<(), MultisigError> {
        Ok(())
    }

    pub fn get_signers(env: Env) -> Result<Vec<Address>, MultisigError> {
        Ok(Vec::new(&env))
    }
}
`;

const TUPLE_AND_OPTION = `
#[contract]
pub struct VotingContract;

#[contractimpl]
impl VotingContract {
    pub fn get_vote_count(env: Env, proposal_id: u64) -> (u128, u128, u128) {
        (0, 0, 0)
    }

    pub fn get_delegate(env: Env, delegator: Address) -> Option<Address> {
        None
    }

    pub fn get_voting_power(env: &Env, voter: &Address) -> u128 {
        0
    }
}
`;

const NO_CONTRACT_IMPL = `
pub fn standalone_function(x: u32) -> u32 {
    x + 1
}

impl RegularStruct {
    pub fn method(value: i64) -> bool {
        true
    }
}
`;

const EMPTY_FILE = ``;

const PUB_CRATE_FNS = `
#[contract]
pub struct TestContract;

#[contractimpl]
impl TestContract {
    pub fn public_fn(env: Env) {}
    pub(crate) fn crate_fn(env: Env) {}
    fn private_fn(env: Env) {}
}
`;

// ── Test: parseRustSource basic ──────────────────────────────

async function testParseSimpleContract() {
    const result = parseRustSource(SIMPLE_CONTRACT);

    assert.strictEqual(result.contractName, 'MyContract');
    // We expect 4 functions total (3 pub + 1 private)
    assert.strictEqual(result.functions.length, 4);
    assert.strictEqual(result.errors.length, 0);

    const pubFns = result.functions.filter(f => f.isContractImpl && f.visibility === 'pub');
    assert.strictEqual(pubFns.length, 3);

    const names = pubFns.map(f => f.name);
    assert.ok(names.includes('initialize'));
    assert.ok(names.includes('transfer'));
    assert.ok(names.includes('balance'));

    console.log('  [ok] parseRustSource: parses simple contract correctly');
}

async function testParseDocComments() {
    const result = parseRustSource(SIMPLE_CONTRACT);
    const initFn = result.functions.find(f => f.name === 'initialize')!;
    assert.ok(initFn.docComments.length > 0);
    assert.ok(initFn.docComments[0].includes('Initialize'));

    const transferFn = result.functions.find(f => f.name === 'transfer')!;
    assert.ok(transferFn.docComments.length >= 2);
    assert.ok(transferFn.docComments[0].includes('Transfer tokens'));

    console.log('  [ok] parseRustSource: extracts doc comments');
}

async function testParseReturnTypes() {
    const result = parseRustSource(SIMPLE_CONTRACT);
    const transferFn = result.functions.find(f => f.name === 'transfer')!;
    assert.strictEqual(transferFn.returnType, 'bool');

    const balanceFn = result.functions.find(f => f.name === 'balance')!;
    assert.strictEqual(balanceFn.returnType, 'u128');

    const initFn = result.functions.find(f => f.name === 'initialize')!;
    assert.strictEqual(initFn.returnType, undefined);

    console.log('  [ok] parseRustSource: extracts return types correctly');
}

async function testParseParameters() {
    const result = parseRustSource(SIMPLE_CONTRACT);
    const transferFn = result.functions.find(f => f.name === 'transfer')!;

    // Should include env, from, to, amount
    assert.strictEqual(transferFn.parameters.length, 4);

    const fromParam = transferFn.parameters.find(p => p.name === 'from')!;
    assert.strictEqual(fromParam.typeStr, 'Address');
    assert.strictEqual(fromParam.isReference, false);

    const amountParam = transferFn.parameters.find(p => p.name === 'amount')!;
    assert.strictEqual(amountParam.typeStr, 'i128');

    console.log('  [ok] parseRustSource: extracts parameters correctly');
}

async function testParsePrivateFunction() {
    const result = parseRustSource(SIMPLE_CONTRACT);
    const privateFn = result.functions.find(f => f.name === 'internal_helper')!;

    assert.strictEqual(privateFn.visibility, 'private');
    assert.strictEqual(privateFn.isContractImpl, true);

    console.log('  [ok] parseRustSource: identifies private functions');
}

// ── Test: Multi-line signatures ───────────────────────────────

async function testParseMultilineSignature() {
    const result = parseRustSource(MULTILINE_CONTRACT);

    assert.strictEqual(result.contractName, 'EscrowContract');
    const depositFn = result.functions.find(f => f.name === 'deposit')!;
    assert.ok(depositFn);
    assert.strictEqual(depositFn.returnType, 'u64');

    // env + 6 params = 7 total
    assert.strictEqual(depositFn.parameters.length, 7);

    const payerParam = depositFn.parameters.find(p => p.name === 'payer')!;
    assert.strictEqual(payerParam.typeStr, 'Address');

    console.log('  [ok] parseRustSource: handles multi-line signatures');
}

// ── Test: Result<T, E> return types ───────────────────────────

async function testParseResultReturnType() {
    const result = parseRustSource(RESULT_RETURN_TYPE);

    const initFn = result.functions.find(f => f.name === 'initialize')!;
    assert.ok(initFn.returnType);
    assert.ok(initFn.returnType!.includes('Result'));

    const getSignersFn = result.functions.find(f => f.name === 'get_signers')!;
    assert.ok(getSignersFn.returnType);
    assert.ok(getSignersFn.returnType!.includes('Vec<Address>'));

    console.log('  [ok] parseRustSource: handles Result<T, E> return types');
}

// ── Test: Tuple and Option return types ───────────────────────

async function testParseTupleAndOption() {
    const result = parseRustSource(TUPLE_AND_OPTION);

    const voteFn = result.functions.find(f => f.name === 'get_vote_count')!;
    assert.ok(voteFn.returnType);
    assert.ok(voteFn.returnType!.includes('u128'));

    const delegateFn = result.functions.find(f => f.name === 'get_delegate')!;
    assert.ok(delegateFn.returnType);
    assert.ok(delegateFn.returnType!.includes('Option'));

    console.log('  [ok] parseRustSource: handles tuple and Option return types');
}

// ── Test: Reference parameters ────────────────────────────────

async function testParseReferenceParams() {
    const result = parseRustSource(TUPLE_AND_OPTION);

    const powerFn = result.functions.find(f => f.name === 'get_voting_power')!;
    const envParam = powerFn.parameters.find(p => p.name === 'env')!;
    assert.strictEqual(envParam.isReference, true);
    assert.strictEqual(envParam.typeStr, 'Env');

    const voterParam = powerFn.parameters.find(p => p.name === 'voter')!;
    assert.strictEqual(voterParam.isReference, true);
    assert.strictEqual(voterParam.typeStr, 'Address');

    console.log('  [ok] parseRustSource: detects reference parameters');
}

// ── Test: No #[contractimpl] ──────────────────────────────────

async function testParseNoContractImpl() {
    const result = parseRustSource(NO_CONTRACT_IMPL);

    assert.strictEqual(result.contractName, undefined);
    const implFns = result.functions.filter(f => f.isContractImpl);
    assert.strictEqual(implFns.length, 0);

    // Should still parse standalone functions
    assert.ok(result.functions.length > 0);

    console.log('  [ok] parseRustSource: handles files without #[contractimpl]');
}

// ── Test: Empty file ──────────────────────────────────────────

async function testParseEmptyFile() {
    const result = parseRustSource(EMPTY_FILE);

    assert.strictEqual(result.functions.length, 0);
    assert.strictEqual(result.contractName, undefined);
    assert.strictEqual(result.errors.length, 0);

    console.log('  [ok] parseRustSource: handles empty files');
}

// ── Test: Visibility ──────────────────────────────────────────

async function testParseVisibility() {
    const result = parseRustSource(PUB_CRATE_FNS);

    const pubFn = result.functions.find(f => f.name === 'public_fn')!;
    assert.strictEqual(pubFn.visibility, 'pub');

    const crateFn = result.functions.find(f => f.name === 'crate_fn')!;
    assert.strictEqual(crateFn.visibility, 'pub_crate');

    const privateFn = result.functions.find(f => f.name === 'private_fn')!;
    assert.strictEqual(privateFn.visibility, 'private');

    console.log('  [ok] parseRustSource: detects visibility modifiers');
}

// ── Test: parseParameterList utility ──────────────────────────

async function testParseParameterListBasic() {
    const params = parseParameterList('env: Env, from: Address, amount: i128');
    assert.strictEqual(params.length, 3);
    assert.strictEqual(params[0].name, 'env');
    assert.strictEqual(params[1].typeStr, 'Address');
    assert.strictEqual(params[2].typeStr, 'i128');

    console.log('  [ok] parseParameterList: parses basic parameters');
}

async function testParseParameterListGeneric() {
    const params = parseParameterList('signers: Vec<Address>, threshold: u32');
    assert.strictEqual(params.length, 2);
    assert.strictEqual(params[0].typeStr, 'Vec<Address>');
    assert.strictEqual(params[1].typeStr, 'u32');

    console.log('  [ok] parseParameterList: handles generic types');
}

async function testParseParameterListEmpty() {
    const params = parseParameterList('');
    assert.strictEqual(params.length, 0);

    console.log('  [ok] parseParameterList: handles empty string');
}

async function testParseParameterListSelfSkip() {
    const params = parseParameterList('&self, x: u32');
    assert.strictEqual(params.length, 1);
    assert.strictEqual(params[0].name, 'x');

    console.log('  [ok] parseParameterList: skips &self');
}

// ── Test: hashContent ─────────────────────────────────────────

async function testHashContentConsistency() {
    const hash1 = hashContent('hello world');
    const hash2 = hashContent('hello world');
    assert.strictEqual(hash1, hash2);

    const hash3 = hashContent('hello world!');
    assert.notStrictEqual(hash1, hash3);

    console.log('  [ok] hashContent: consistent hashing');
}

// ── Test: SignatureCacheService ────────────────────────────────

async function testCacheStoreAndRetrieve() {
    const ctx = createMockContext();
    const svc = new SignatureCacheService(ctx, createMockOutput());
    const source = SIMPLE_CONTRACT;
    const parsed = parseRustSource(source);

    await svc.cacheSignatures('/test/lib.rs', parsed, source);
    const cached = svc.getCachedSignatures('/test/lib.rs');

    assert.ok(cached);
    assert.strictEqual(cached!.functions.length, parsed.functions.length);

    console.log('  [ok] SignatureCacheService: store and retrieve');
}

async function testCacheStalenessDetection() {
    const ctx = createMockContext();
    const svc = new SignatureCacheService(ctx, createMockOutput());
    const source = SIMPLE_CONTRACT;
    const parsed = parseRustSource(source);

    await svc.cacheSignatures('/test/lib.rs', parsed, source);

    assert.strictEqual(svc.isStale('/test/lib.rs', source), false);
    assert.strictEqual(svc.isStale('/test/lib.rs', source + '\n// modified'), true);
    assert.strictEqual(svc.isStale('/nonexistent.rs', source), true);

    console.log('  [ok] SignatureCacheService: staleness detection');
}

async function testCacheInvalidation() {
    const ctx = createMockContext();
    const svc = new SignatureCacheService(ctx, createMockOutput());
    const parsed = parseRustSource(SIMPLE_CONTRACT);

    await svc.cacheSignatures('/test/lib.rs', parsed, SIMPLE_CONTRACT);
    const removed = await svc.invalidate('/test/lib.rs');
    assert.strictEqual(removed, true);
    assert.strictEqual(svc.getCachedSignatures('/test/lib.rs'), undefined);

    const removedAgain = await svc.invalidate('/test/lib.rs');
    assert.strictEqual(removedAgain, false);

    console.log('  [ok] SignatureCacheService: invalidation');
}

async function testCacheClearAll() {
    const ctx = createMockContext();
    const svc = new SignatureCacheService(ctx, createMockOutput());

    await svc.cacheSignatures('/a.rs', parseRustSource(''), '');
    await svc.cacheSignatures('/b.rs', parseRustSource(''), '');
    await svc.clearAll();

    assert.strictEqual(svc.getCachedFilePaths().length, 0);

    console.log('  [ok] SignatureCacheService: clear all');
}

// ── Test: SourceInspectorService ──────────────────────────────

async function testSourceInspectorGetContractFunctions() {
    const ctx = createMockContext();
    const cache = new SignatureCacheService(ctx, createMockOutput());
    const fs = {
        readFile: async (_path: string) => SIMPLE_CONTRACT,
        findFiles: async (_dir: string, _pattern: string) => ['/test/lib.rs'],
    };
    const inspector = new SourceInspectorService(cache, fs, createMockOutput());

    const functions = await inspector.getContractFunctions('/test/lib.rs');

    // Should only return pub functions from #[contractimpl], excluding env params
    assert.ok(functions.length > 0);

    const transferFn = functions.find(f => f.name === 'transfer')!;
    assert.ok(transferFn);
    // env is filtered out, so 3 params: from, to, amount
    assert.strictEqual(transferFn.parameters.length, 3);
    assert.strictEqual(transferFn.parameters[0].name, 'from');

    // internal_helper should not be included (it's private)
    const privateFn = functions.find(f => f.name === 'internal_helper');
    assert.strictEqual(privateFn, undefined);

    console.log('  [ok] SourceInspectorService: getContractFunctions filters correctly');
}

async function testSourceInspectorDocCommentToDescription() {
    const ctx = createMockContext();
    const cache = new SignatureCacheService(ctx, createMockOutput());
    const fs = {
        readFile: async (_path: string) => SIMPLE_CONTRACT,
        findFiles: async (_dir: string, _pattern: string) => [],
    };
    const inspector = new SourceInspectorService(cache, fs, createMockOutput());

    const functions = await inspector.getContractFunctions('/test/lib.rs');
    const initFn = functions.find(f => f.name === 'initialize')!;

    assert.ok(initFn.description);
    assert.ok(initFn.description!.includes('Initialize'));

    console.log('  [ok] SourceInspectorService: doc comments become descriptions');
}

async function testSourceInspectorCacheReuse() {
    const ctx = createMockContext();
    const cache = new SignatureCacheService(ctx, createMockOutput());
    let readCount = 0;
    const fs = {
        readFile: async (_path: string) => { readCount++; return SIMPLE_CONTRACT; },
        findFiles: async (_dir: string, _pattern: string) => [],
    };
    const inspector = new SourceInspectorService(cache, fs, createMockOutput());

    // First call — reads and caches
    await inspector.getContractFunctions('/test/lib.rs');
    assert.strictEqual(readCount, 1);

    // Second call — should still read (to check hash) but use cached parse
    await inspector.getContractFunctions('/test/lib.rs');
    assert.strictEqual(readCount, 2);

    console.log('  [ok] SourceInspectorService: uses cache on second call');
}

async function testSourceInspectorDirectory() {
    const ctx = createMockContext();
    const cache = new SignatureCacheService(ctx, createMockOutput());
    const fs = {
        readFile: async (path: string) => {
            if (path.includes('lib')) return SIMPLE_CONTRACT;
            return MULTILINE_CONTRACT;
        },
        findFiles: async (_dir: string, _pattern: string) => ['/src/lib.rs', '/src/escrow.rs'],
    };
    const inspector = new SourceInspectorService(cache, fs, createMockOutput());

    const results = await inspector.inspectContractDirectory('/project');
    assert.strictEqual(results.length, 2);

    console.log('  [ok] SourceInspectorService: inspects entire directory');
}

// ── Test: Real-world escrow template ──────────────────────────

async function testParseEscrowTemplate() {
    // Simulate a realistic escrow contract
    const source = `
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Vec};

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowCase {
    pub id: u64,
    pub payer: Address,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create a new escrow case and deposit funds into it.
    ///
    /// # Arguments
    /// * \`payer\` - Account providing escrowed funds
    /// * \`payee\` - Account receiving funds on release
    pub fn deposit(
        env: Env,
        payer: Address,
        payee: Address,
        amount: u128,
    ) -> u64 {
        0
    }

    /// Approve and execute release to payee.
    pub fn release(env: Env, escrow_id: u64, approver: Address) {
    }

    /// Get full escrow case details by ID.
    pub fn get_escrow(env: Env, escrow_id: u64) -> EscrowCase {
        panic!("not implemented")
    }

    fn internal_fn(env: &Env) {}
}
`;

    const result = parseRustSource(source);

    assert.strictEqual(result.contractName, 'EscrowContract');

    const pubContractFns = result.functions.filter(f => f.isContractImpl && f.visibility === 'pub');
    assert.strictEqual(pubContractFns.length, 3);

    const depositFn = pubContractFns.find(f => f.name === 'deposit')!;
    assert.ok(depositFn.docComments.length >= 2);
    assert.strictEqual(depositFn.returnType, 'u64');
    // env + 3 params = 4
    assert.strictEqual(depositFn.parameters.length, 4);

    const releaseFn = pubContractFns.find(f => f.name === 'release')!;
    assert.strictEqual(releaseFn.returnType, undefined);

    const getEscrowFn = pubContractFns.find(f => f.name === 'get_escrow')!;
    assert.strictEqual(getEscrowFn.returnType, 'EscrowCase');

    // Private function should exist but not be pub
    const internalFn = result.functions.find(f => f.name === 'internal_fn')!;
    assert.strictEqual(internalFn.visibility, 'private');
    assert.strictEqual(internalFn.isContractImpl, true);

    console.log('  [ok] parseRustSource: parses realistic escrow template');
}

// ── Test: Line numbers ────────────────────────────────────────

async function testFunctionLineNumbers() {
    const result = parseRustSource(SIMPLE_CONTRACT);

    for (const fn of result.functions) {
        assert.ok(fn.startLine > 0, `${fn.name}: startLine should be > 0`);
        assert.ok(fn.endLine >= fn.startLine, `${fn.name}: endLine >= startLine`);
    }

    console.log('  [ok] parseRustSource: provides valid line numbers');
}

// ── Test Runner ───────────────────────────────────────────────

async function run() {
    const tests: Array<() => Promise<void>> = [
        testParseSimpleContract,
        testParseDocComments,
        testParseReturnTypes,
        testParseParameters,
        testParsePrivateFunction,
        testParseMultilineSignature,
        testParseResultReturnType,
        testParseTupleAndOption,
        testParseReferenceParams,
        testParseNoContractImpl,
        testParseEmptyFile,
        testParseVisibility,
        testParseParameterListBasic,
        testParseParameterListGeneric,
        testParseParameterListEmpty,
        testParseParameterListSelfSkip,
        testHashContentConsistency,
        testCacheStoreAndRetrieve,
        testCacheStalenessDetection,
        testCacheInvalidation,
        testCacheClearAll,
        testSourceInspectorGetContractFunctions,
        testSourceInspectorDocCommentToDescription,
        testSourceInspectorCacheReuse,
        testSourceInspectorDirectory,
        testParseEscrowTemplate,
        testFunctionLineNumbers,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nrustSourceParser unit tests');
    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (err) {
            failed++;
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
