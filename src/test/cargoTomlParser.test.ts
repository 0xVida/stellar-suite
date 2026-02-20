// ============================================================
// src/test/cargoTomlParser.test.ts
// Unit tests for cargoTomlParser utilities and the
// ContractMetadataService cache / watcher logic.
//
// Run with:  node out/test/cargoTomlParser.test.js
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');

import {
    parseCargoToml,
    extractContractDependencies,
    getContractName,
    parseTomlStringArray,
} from '../utils/cargoTomlParser';
import { ContractMetadataService } from '../services/contractMetadataService';

// ── Fixtures ──────────────────────────────────────────────────

const BASIC_PACKAGE = `
[package]
name = "hello-world"
version = "0.1.0"
edition = "2021"
authors = ["Alice Smith <alice@example.com>", "Bob Jones <bob@example.com>"]
description = "A simple Soroban contract"
license = "MIT"
repository = "https://github.com/example/hello-world"
`;

const FULL_DEPENDENCIES = `
[package]
name = "my-contract"
version = "0.2.1"
edition = "2021"

[dependencies]
soroban-sdk = "22.0.0"
serde = { version = "1.0", features = ["derive"], optional = false }
my-lib = { path = "../my-lib" }
git-dep = { git = "https://github.com/example/dep", branch = "main" }
workspace-dep = { workspace = true }

[dev-dependencies]
soroban-sdk = { version = "22.0.0", features = ["testutils"] }
pretty_assertions = "1.4"

[build-dependencies]
build-script-helper = "0.1"
`;

const WORKSPACE_CARGO = `
[workspace]
members = ["contracts/hello", "contracts/world", "shared/*"]
default-members = ["contracts/hello"]
exclude = ["contracts/experimental"]

[workspace.package]
version = "1.0.0"
edition = "2021"
license = "Apache-2.0"
authors = ["Workspace Author"]

[workspace.dependencies]
soroban-sdk = "22.0.0"
serde = { version = "1.0", features = ["derive"] }
`;

const EMPTY_CONTENT = ``;

const MALFORMED_CONTENT = `
[package]
name = "broken"
# missing version
description = "This package is missing its version field"

[dependencies
broken-entry = abc_no_quotes

`;

const SINGLE_QUOTED_STRINGS = `
[package]
name = 'single-quoted-contract'
version = '0.3.0'
description = 'Uses single quotes throughout'
license = 'MIT'
authors = ['Carol <carol@example.com>']
`;

const WORKSPACE_AND_PACKAGE = `
[workspace]
members = ["crates/*"]

[package]
name = "root-crate"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = "1.0"
`;

// ── parseCargoToml tests ──────────────────────────────────────

async function testParsesBasicPackage() {
    const result = parseCargoToml(BASIC_PACKAGE, '/project/Cargo.toml');

    assert.ok(result.package, 'should have a package field');
    assert.strictEqual(result.package!.name,    'hello-world');
    assert.strictEqual(result.package!.version, '0.1.0');
    assert.strictEqual(result.package!.edition, '2021');
    assert.strictEqual(result.package!.description, 'A simple Soroban contract');
    assert.strictEqual(result.package!.license, 'MIT');
    assert.strictEqual(result.package!.repository, 'https://github.com/example/hello-world');
    assert.deepStrictEqual(result.package!.authors, [
        'Alice Smith <alice@example.com>',
        'Bob Jones <bob@example.com>',
    ]);
    assert.strictEqual(result.parseWarnings.length, 0, 'no parse warnings expected');
    console.log('  [ok] parses basic [package] section');
}

async function testParsesFullDependencies() {
    const result = parseCargoToml(FULL_DEPENDENCIES, '/project/Cargo.toml');

    // Runtime dependencies
    assert.ok(result.dependencies['soroban-sdk'], 'should have soroban-sdk dep');
    assert.strictEqual(result.dependencies['soroban-sdk'].version, '22.0.0');

    const serde = result.dependencies['serde'];
    assert.ok(serde, 'should have serde dep');
    assert.strictEqual(serde.version, '1.0');
    assert.deepStrictEqual(serde.features, ['derive']);
    assert.strictEqual(serde.optional, false);

    const myLib = result.dependencies['my-lib'];
    assert.ok(myLib, 'should have my-lib path dep');
    assert.strictEqual(myLib.path, '../my-lib');

    const gitDep = result.dependencies['git-dep'];
    assert.ok(gitDep, 'should have git-dep');
    assert.strictEqual(gitDep.git,    'https://github.com/example/dep');
    assert.strictEqual(gitDep.branch, 'main');

    const wsDep = result.dependencies['workspace-dep'];
    assert.ok(wsDep, 'should have workspace-dep');
    assert.strictEqual(wsDep.workspace, true);

    // Dev dependencies
    const sorobanDev = result.devDependencies['soroban-sdk'];
    assert.ok(sorobanDev, 'should have soroban-sdk dev dep');
    assert.deepStrictEqual(sorobanDev.features, ['testutils']);

    assert.ok(result.devDependencies['pretty_assertions'], 'should have pretty_assertions dev dep');

    // Build dependencies
    assert.ok(result.buildDependencies['build-script-helper'], 'should have build dep');
    assert.strictEqual(result.buildDependencies['build-script-helper'].version, '0.1');

    console.log('  [ok] parses [dependencies], [dev-dependencies], [build-dependencies]');
}

async function testParsesWorkspaceRoot() {
    const result = parseCargoToml(WORKSPACE_CARGO, '/workspace/Cargo.toml');

    assert.strictEqual(result.isWorkspaceRoot, true, 'should be a workspace root');
    assert.ok(result.workspace, 'should have workspace field');

    const ws = result.workspace!;
    assert.deepStrictEqual(ws.members, ['contracts/hello', 'contracts/world', 'shared/*']);
    assert.deepStrictEqual(ws.defaultMembers, ['contracts/hello']);
    assert.deepStrictEqual(ws.exclude, ['contracts/experimental']);

    // [workspace.package] defaults
    const defaults = ws.packageDefaults;
    assert.ok(defaults, 'should have packageDefaults');
    assert.strictEqual(defaults!.version, '1.0.0');
    assert.strictEqual(defaults!.license, 'Apache-2.0');
    assert.deepStrictEqual(defaults!.authors, ['Workspace Author']);

    // [workspace.dependencies]
    assert.ok(ws.dependencies, 'should have workspace.dependencies');
    assert.ok(ws.dependencies!['soroban-sdk'], 'should have soroban-sdk workspace dep');
    assert.strictEqual(ws.dependencies!['soroban-sdk'].version, '22.0.0');
    assert.deepStrictEqual(ws.dependencies!['serde'].features, ['derive']);

    console.log('  [ok] parses [workspace], [workspace.package], [workspace.dependencies]');
}

async function testHandlesEmptyContent() {
    const result = parseCargoToml(EMPTY_CONTENT, '/project/Cargo.toml');

    assert.strictEqual(result.package, undefined, 'no package for empty content');
    assert.strictEqual(result.isWorkspaceRoot, false);
    assert.ok(result.parseWarnings.length > 0, 'should emit a warning for empty content');
    console.log('  [ok] handles empty Cargo.toml content gracefully');
}

async function testHandlesMalformedContent() {
    const result = parseCargoToml(MALFORMED_CONTENT, '/project/Cargo.toml');

    // [package] section has name but no version → no package object, a warning
    assert.strictEqual(result.package, undefined, 'malformed package should not parse fully');
    assert.ok(
        result.parseWarnings.some(w => w.includes('name') || w.includes('version')),
        'should warn about missing name/version'
    );
    console.log('  [ok] handles malformed Cargo.toml with missing required fields');
}

async function testSingleQuotedStrings() {
    const result = parseCargoToml(SINGLE_QUOTED_STRINGS, '/project/Cargo.toml');

    assert.ok(result.package, 'should parse package with single-quoted strings');
    assert.strictEqual(result.package!.name,        'single-quoted-contract');
    assert.strictEqual(result.package!.version,     '0.3.0');
    assert.strictEqual(result.package!.description, 'Uses single quotes throughout');
    assert.strictEqual(result.package!.license,     'MIT');
    assert.deepStrictEqual(result.package!.authors, ['Carol <carol@example.com>']);
    console.log('  [ok] handles single-quoted string values');
}

async function testWorkspaceAndPackageCoexist() {
    const result = parseCargoToml(WORKSPACE_AND_PACKAGE, '/project/Cargo.toml');

    assert.strictEqual(result.isWorkspaceRoot, true, 'should be workspace root');
    assert.ok(result.package, 'should still have [package] section');
    assert.strictEqual(result.package!.name, 'root-crate');
    assert.ok(result.workspace, 'should have workspace');
    assert.deepStrictEqual(result.workspace!.members, ['crates/*']);
    assert.ok(result.dependencies['serde'], 'should have serde dep');
    console.log('  [ok] handles Cargo.toml with both [workspace] and [package]');
}

// ── extractContractDependencies tests ─────────────────────────

async function testExtractContractDependencies() {
    const result = parseCargoToml(FULL_DEPENDENCIES, '/project/Cargo.toml');
    const contractDeps = extractContractDependencies(result);

    // soroban-sdk should be filtered out by default
    assert.ok(
        !contractDeps.some(d => d.name === 'soroban-sdk'),
        'soroban-sdk should be filtered out as SDK crate'
    );

    // User-defined deps should remain
    assert.ok(contractDeps.some(d => d.name === 'my-lib'),  'my-lib should be present');
    assert.ok(contractDeps.some(d => d.name === 'git-dep'), 'git-dep should be present');
    assert.ok(contractDeps.some(d => d.name === 'workspace-dep'), 'workspace-dep should be present');

    console.log('  [ok] extractContractDependencies filters SDK crates and returns user deps');
}

async function testExtractContractDependenciesCustomSkip() {
    const result = parseCargoToml(FULL_DEPENDENCIES, '/project/Cargo.toml');
    // Only skip serde
    const contractDeps = extractContractDependencies(result, ['serde']);

    assert.ok(contractDeps.some(d => d.name === 'soroban-sdk'), 'soroban-sdk should NOT be filtered');
    assert.ok(!contractDeps.some(d => d.name === 'serde'), 'serde should be filtered');
    console.log('  [ok] extractContractDependencies respects custom skip list');
}

// ── getContractName tests ─────────────────────────────────────

async function testGetContractNameFromPackage() {
    const result = parseCargoToml(BASIC_PACKAGE, '/project/Cargo.toml');
    assert.strictEqual(getContractName(result), 'hello-world');
    console.log('  [ok] getContractName returns package.name when present');
}

async function testGetContractNameFallsBackToDir() {
    const result = parseCargoToml('', '/project/contracts/my-contract/Cargo.toml');
    assert.strictEqual(getContractName(result), 'my-contract');
    console.log('  [ok] getContractName falls back to directory name');
}

async function testGetContractNameUnknownFallback() {
    const result = parseCargoToml('', 'Cargo.toml');
    assert.strictEqual(getContractName(result), 'unknown-contract');
    console.log('  [ok] getContractName returns "unknown-contract" for path-less file');
}

// ── parseTomlStringArray tests ────────────────────────────────

async function testParseTomlStringArray() {
    assert.deepStrictEqual(
        parseTomlStringArray('["a", "b", "c"]'),
        ['a', 'b', 'c'],
        'parses simple array'
    );

    assert.deepStrictEqual(
        parseTomlStringArray(`['single', 'quoted']`),
        ['single', 'quoted'],
        'parses single-quoted array'
    );

    assert.deepStrictEqual(
        parseTomlStringArray('["Alice Smith <alice@example.com>"]'),
        ['Alice Smith <alice@example.com>'],
        'preserves special characters in strings'
    );

    assert.deepStrictEqual(
        parseTomlStringArray('[]'),
        [],
        'empty array returns empty list'
    );

    assert.deepStrictEqual(
        parseTomlStringArray('not-an-array'),
        [],
        'non-array input returns empty list'
    );

    console.log('  [ok] parseTomlStringArray handles various array formats');
}

async function testNestedFeaturesArray() {
    const toml = `
[package]
name = "dep-test"
version = "0.1.0"

[dependencies]
tokio = { version = "1.0", features = ["full", "macros", "rt-multi-thread"], optional = true }
`;
    const result = parseCargoToml(toml, '/project/Cargo.toml');
    const tokio  = result.dependencies['tokio'];

    assert.ok(tokio, 'tokio dep should exist');
    assert.strictEqual(tokio.version, '1.0');
    assert.strictEqual(tokio.optional, true);
    assert.deepStrictEqual(tokio.features, ['full', 'macros', 'rt-multi-thread']);
    console.log('  [ok] inline table with multi-value features array parses correctly');
}

// ── ContractMetadataService tests ─────────────────────────────

async function testServiceCachesMetadata() {
    // Build a minimal in-memory workspace stub
    const fakeFiles: Record<string, string> = {
        '/project/Cargo.toml': BASIC_PACKAGE,
    };

    const fakeWorkspace = makeFakeWorkspace(fakeFiles);
    const svc = new ContractMetadataService(fakeWorkspace as any);

    const meta1 = await svc.getMetadata('/project/Cargo.toml');
    const meta2 = await svc.getMetadata('/project/Cargo.toml');

    assert.strictEqual(meta1, meta2, 'should return same cached object on second call');
    assert.strictEqual(meta1.contractName, 'hello-world');
    console.log('  [ok] ContractMetadataService caches metadata by path');
}

async function testServiceInvalidatesCacheEntry() {
    const fakeFiles: Record<string, string> = {
        '/project/Cargo.toml': BASIC_PACKAGE,
    };

    const fakeWorkspace = makeFakeWorkspace(fakeFiles);
    const svc = new ContractMetadataService(fakeWorkspace as any);

    const meta1 = await svc.getMetadata('/project/Cargo.toml');
    svc.invalidate('/project/Cargo.toml');

    // Update file content before re-parsing
    fakeFiles['/project/Cargo.toml'] = `
[package]
name = "hello-world-v2"
version = "0.2.0"
`;
    const meta2 = await svc.getMetadata('/project/Cargo.toml');

    assert.notStrictEqual(meta1, meta2, 'should return a new object after invalidation');
    assert.strictEqual(meta2.contractName, 'hello-world-v2');
    console.log('  [ok] ContractMetadataService invalidates individual cache entries');
}

async function testServiceInvalidatesAll() {
    const fakeFiles: Record<string, string> = {
        '/project/a/Cargo.toml': '[package]\nname = "a"\nversion = "0.1.0"',
        '/project/b/Cargo.toml': '[package]\nname = "b"\nversion = "0.1.0"',
    };

    const fakeWorkspace = makeFakeWorkspace(fakeFiles);
    const svc = new ContractMetadataService(fakeWorkspace as any);

    await svc.getMetadata('/project/a/Cargo.toml');
    await svc.getMetadata('/project/b/Cargo.toml');
    assert.strictEqual(svc.getCachedMetadata().length, 2, 'cache should have 2 entries');

    svc.invalidate();
    assert.strictEqual(svc.getCachedMetadata().length, 0, 'cache should be empty after full invalidate');
    console.log('  [ok] ContractMetadataService.invalidate() clears entire cache');
}

async function testServiceScanWorkspace() {
    const fakeFiles: Record<string, string> = {
        '/project/contracts/hello/Cargo.toml':
            '[package]\nname = "hello"\nversion = "0.1.0"',
        '/project/contracts/world/Cargo.toml':
            '[package]\nname = "world"\nversion = "0.1.0"',
        '/project/Cargo.toml': WORKSPACE_CARGO,
    };

    const fakeWorkspace = makeFakeWorkspace(fakeFiles);
    const svc = new ContractMetadataService(fakeWorkspace as any);
    const result = await svc.scanWorkspace();

    assert.strictEqual(result.contracts.length, 3, 'should find 3 Cargo.toml files');
    assert.strictEqual(result.workspaceRoots.length, 1, 'should find 1 workspace root');
    assert.strictEqual(result.errors.length, 0, 'should have no errors');
    console.log('  [ok] ContractMetadataService.scanWorkspace() discovers all Cargo.toml files');
}

async function testServiceFindByContractName() {
    const fakeFiles: Record<string, string> = {
        '/project/a/Cargo.toml': '[package]\nname = "alpha-contract"\nversion = "0.1.0"',
        '/project/b/Cargo.toml': '[package]\nname = "beta-contract"\nversion = "0.1.0"',
    };

    const svc = new ContractMetadataService(makeFakeWorkspace(fakeFiles) as any);
    await svc.scanWorkspace();

    const found = svc.findByContractName('alpha-contract');
    assert.ok(found, 'should find alpha-contract by name');
    assert.strictEqual(found!.contractName, 'alpha-contract');

    const notFound = svc.findByContractName('nonexistent');
    assert.strictEqual(notFound, undefined, 'should return undefined for unknown name');
    console.log('  [ok] ContractMetadataService.findByContractName() works correctly');
}

async function testServiceFindByDependency() {
    const cargoWithSerde = `
[package]
name = "uses-serde"
version = "0.1.0"

[dependencies]
serde = "1.0"
`;
    const cargoWithoutSerde = `
[package]
name = "no-serde"
version = "0.1.0"
`;
    const fakeFiles: Record<string, string> = {
        '/project/a/Cargo.toml': cargoWithSerde,
        '/project/b/Cargo.toml': cargoWithoutSerde,
    };

    const svc = new ContractMetadataService(makeFakeWorkspace(fakeFiles) as any);
    await svc.scanWorkspace();

    const found = svc.findContractsByDependency('serde');
    assert.strictEqual(found.length, 1,          'should find 1 contract with serde');
    assert.strictEqual(found[0].contractName, 'uses-serde');

    const notFound = svc.findContractsByDependency('tokio');
    assert.strictEqual(notFound.length, 0, 'should find 0 contracts with tokio');
    console.log('  [ok] ContractMetadataService.findContractsByDependency() works correctly');
}

async function testServiceHandlesMissingFile() {
    const fakeWorkspace = makeFakeWorkspace({});
    const svc = new ContractMetadataService(fakeWorkspace as any);

    try {
        await svc.getMetadata('/nonexistent/Cargo.toml');
        assert.fail('should have thrown an error for missing file');
    } catch (err) {
        assert.ok(err instanceof Error, 'should throw an Error');
        assert.ok((err as Error).message.includes('Cannot read'), 'error message should mention read failure');
    }
    console.log('  [ok] ContractMetadataService throws when file cannot be read');
}

async function testServiceWatcherCallsInvalidate() {
    const fakeFiles: Record<string, string> = {
        '/project/Cargo.toml': BASIC_PACKAGE,
    };

    const watcher = makeFakeWatcher();
    const fakeWorkspace = {
        ...makeFakeWorkspace(fakeFiles),
        createFileSystemWatcher: () => watcher,
    };

    const svc = new ContractMetadataService(fakeWorkspace as any);
    // Prime the cache
    await svc.getMetadata('/project/Cargo.toml');
    assert.strictEqual(svc.getCachedMetadata().length, 1, 'cache should have 1 entry before change');

    // Start watching
    svc.startWatching();

    // Simulate a file-change event
    watcher.triggerChange({ fsPath: '/project/Cargo.toml' });

    assert.strictEqual(svc.getCachedMetadata().length, 0, 'cache should be empty after change event');

    svc.dispose();
    console.log('  [ok] File watcher correctly invalidates cache on Cargo.toml changes');
}

async function testServiceDisposeStopsWatcher() {
    const watcher  = makeFakeWatcher();
    const fakeWorkspace = {
        ...makeFakeWorkspace({}),
        createFileSystemWatcher: () => watcher,
    };

    const svc = new ContractMetadataService(fakeWorkspace as any);
    svc.startWatching();
    assert.strictEqual(watcher.disposed, false, 'watcher should not be disposed yet');

    svc.dispose();
    assert.strictEqual(watcher.disposed, true, 'watcher should be disposed after service.dispose()');
    console.log('  [ok] ContractMetadataService.dispose() tears down the file watcher');
}

async function testServiceStartWatchingIdempotent() {
    let watcherCount = 0;
    const fakeWorkspace = {
        ...makeFakeWorkspace({}),
        createFileSystemWatcher: () => {
            watcherCount++;
            return makeFakeWatcher();
        },
    };

    const svc = new ContractMetadataService(fakeWorkspace as any);
    svc.startWatching();
    svc.startWatching(); // second call should be a no-op
    assert.strictEqual(watcherCount, 1, 'createFileSystemWatcher should only be called once');

    svc.dispose();
    console.log('  [ok] startWatching() is idempotent (does not create duplicate watchers)');
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Builds a minimal fake workspace that reads from an in-memory dictionary.
 * The `findFiles` method returns the keys that end in 'Cargo.toml'.
 * The `readFileSync` calls are intercepted by monkey-patching `fs`.
 */
function makeFakeWorkspace(files: Record<string, string>) {
    // Monkey-patch `fs.readFileSync` locally so ContractMetadataService
    // can call it without touching the real file system.
    const origReadFileSync = (require('fs') as typeof import('fs')).readFileSync;
    (require('fs') as any).readFileSync = (p: string, enc: string) => {
        const normalised = p.replace(/\\/g, '/');
        if (files[normalised] !== undefined) { return files[normalised]; }
        throw Object.assign(new Error(`ENOENT: no such file or directory '${p}'`), { code: 'ENOENT' });
    };

    // Return a restore function and the workspace stub together.
    return {
        findFiles: async (_include: string, _exclude?: string, _max?: number) => {
            return Object.keys(files)
                .filter(k => k.endsWith('Cargo.toml'))
                .map(k => ({ fsPath: k }));
        },
        createFileSystemWatcher: (_: string) => makeFakeWatcher(),
        _restore: () => {
            (require('fs') as any).readFileSync = origReadFileSync;
        },
    };
}

/**
 * A controllable fake FileSystemWatcher.
 */
function makeFakeWatcher() {
    type Listener = (uri: { fsPath: string }) => void;
    const changeListeners: Listener[]  = [];
    const createListeners: Listener[]  = [];
    const deleteListeners: Listener[]  = [];
    const disposables: Array<{ dispose: () => void }> = [];
    let disposed = false;

    return {
        get disposed() { return disposed; },
        onDidChange(l: Listener) {
            changeListeners.push(l);
            const d = { dispose: () => { changeListeners.splice(changeListeners.indexOf(l), 1); } };
            disposables.push(d);
            return d;
        },
        onDidCreate(l: Listener) {
            createListeners.push(l);
            const d = { dispose: () => { createListeners.splice(createListeners.indexOf(l), 1); } };
            disposables.push(d);
            return d;
        },
        onDidDelete(l: Listener) {
            deleteListeners.push(l);
            const d = { dispose: () => { deleteListeners.splice(deleteListeners.indexOf(l), 1); } };
            disposables.push(d);
            return d;
        },
        triggerChange(uri: { fsPath: string })  { changeListeners.forEach(l => l(uri)); },
        triggerCreate(uri: { fsPath: string })  { createListeners.forEach(l => l(uri)); },
        triggerDelete(uri: { fsPath: string })  { deleteListeners.forEach(l => l(uri)); },
        dispose() {
            disposables.forEach(d => { try { d.dispose(); } catch { /* ignore */ } });
            disposed = true;
        },
    };
}

// ── Test runner ───────────────────────────────────────────────

const tests: Array<[string, () => Promise<void>]> = [
    // cargoTomlParser unit tests
    ['parses basic package section',          testParsesBasicPackage],
    ['parses full dependency tables',         testParsesFullDependencies],
    ['parses workspace-root Cargo.toml',      testParsesWorkspaceRoot],
    ['handles empty content gracefully',      testHandlesEmptyContent],
    ['handles malformed content gracefully',  testHandlesMalformedContent],
    ['handles single-quoted strings',         testSingleQuotedStrings],
    ['workspace and package coexist',         testWorkspaceAndPackageCoexist],
    ['extracts contract dependencies',        testExtractContractDependencies],
    ['respects custom dep skip list',         testExtractContractDependenciesCustomSkip],
    ['getContractName from package.name',     testGetContractNameFromPackage],
    ['getContractName falls back to dir',     testGetContractNameFallsBackToDir],
    ['getContractName unknown fallback',      testGetContractNameUnknownFallback],
    ['parseTomlStringArray variants',         testParseTomlStringArray],
    ['nested features array in inline table', testNestedFeaturesArray],
    // ContractMetadataService tests
    ['service caches metadata objects',       testServiceCachesMetadata],
    ['service invalidates cache entries',     testServiceInvalidatesCacheEntry],
    ['service invalidates entire cache',      testServiceInvalidatesAll],
    ['service scans workspace for manifests', testServiceScanWorkspace],
    ['service finds contract by name',        testServiceFindByContractName],
    ['service finds contracts by dependency', testServiceFindByDependency],
    ['service handles missing file',          testServiceHandlesMissingFile],
    ['watcher invalidates cache on change',   testServiceWatcherCallsInvalidate],
    ['dispose() tears down watcher',          testServiceDisposeStopsWatcher],
    ['startWatching() is idempotent',         testServiceStartWatchingIdempotent],
];

(async () => {
    console.log('\nRunning cargoTomlParser.test.ts…\n');
    let passed = 0;
    let failed = 0;

    for (const [name, fn] of tests) {
        try {
            await fn();
            passed++;
        } catch (err) {
            failed++;
            console.error(`  [FAIL] ${name}`);
            console.error(`         ${err instanceof Error ? err.message : String(err)}`);
            if (err instanceof Error && err.stack) {
                console.error(`         ${err.stack.split('\n').slice(1, 3).join('\n         ')}`);
            }
            process.exitCode = 1;
        }
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Passed: ${passed}  |  Failed: ${failed}  |  Total: ${tests.length}`);
    console.log('─'.repeat(50) + '\n');
})();
