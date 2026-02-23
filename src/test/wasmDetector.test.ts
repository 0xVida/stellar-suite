// ============================================================
// src/test/wasmDetector.test.ts
// Unit tests for WasmDetector contract detection utilities.
//
// Run with: node out-test/test/wasmDetector.test.js
// ============================================================

const assert = require('assert');
const path = require('path');
const Module = require('module');

// ── Types ─────────────────────────────────────────────────────

interface MockFileEntry {
    isDirectory: boolean;
    mtime: Date;
    content?: string;
}

interface MockWorkspaceFolder {
    uri: { fsPath: string };
    name: string;
}

// ── Mock State ────────────────────────────────────────────────

let mockFiles: Map<string, MockFileEntry> = new Map();
let mockWorkspaceFolders: MockWorkspaceFolder[] = [];
let activeEditor: { document: { fileName: string } } | null = null;

// ── File System Mock (must be defined before module interception) ──

const mockFs = {
    existsSync: (filepath: string): boolean => {
        const normalized = path.normalize(filepath);
        return mockFiles.has(normalized) || 
               Array.from(mockFiles.keys()).some(k => k.startsWith(normalized + path.sep));
    },
    statSync: (filepath: string): { mtime: Date; isFile: () => boolean; isDirectory: () => boolean } => {
        const normalized = path.normalize(filepath);
        const entry = mockFiles.get(normalized);
        if (entry) {
            return {
                mtime: entry.mtime,
                isFile: () => !entry.isDirectory,
                isDirectory: () => entry.isDirectory
            };
        }
        throw new Error(`ENOENT: no such file or directory, stat '${filepath}'`);
    },
    readdirSync: (dirpath: string): string[] => {
        const normalized = path.normalize(dirpath);
        const files: string[] = [];
        const seen = new Set<string>();
        
        for (const [filePath] of mockFiles) {
            if (filePath.startsWith(normalized + path.sep) || filePath === normalized) {
                const relative = path.relative(normalized, filePath);
                if (relative && !relative.includes(path.sep)) {
                    if (!seen.has(relative)) {
                        seen.add(relative);
                        files.push(relative);
                    }
                }
            }
        }
        return files;
    },
    readFileSync: (filepath: string, encoding?: string): string | Buffer => {
        const normalized = path.normalize(filepath);
        const entry = mockFiles.get(normalized);
        if (entry && !entry.isDirectory && entry.content !== undefined) {
            return encoding ? entry.content : Buffer.from(entry.content);
        }
        throw new Error(`ENOENT: no such file or directory, open '${filepath}'`);
    }
};

// ── VS Code Mock Setup ───────────────────────────────────────

const mockVscode = {
    workspace: {
        get workspaceFolders() {
            return mockWorkspaceFolders.length > 0 ? mockWorkspaceFolders : null;
        },
        findFiles: async (
            pattern: { pattern: string; base?: string } | string,
            _exclude?: string,
            maxResults?: number
        ): Promise<Array<{ fsPath: string }>> => {
            const patternObj = typeof pattern === 'string' ? { pattern, base: '' } : pattern;
            const patternStr = patternObj.pattern;
            const basePath = patternObj.base || '';
            const results: Array<{ fsPath: string }> = [];
            
            for (const [filePath, entry] of mockFiles) {
                if (!entry.isDirectory) {
                    // Normalize file path to use forward slashes for matching
                    const normalizedFilePath = filePath.replace(/\\/g, '/');
                    // Check if file matches pattern relative to base
                    const relativePath = basePath ? normalizedFilePath.replace(basePath.replace(/\\/g, '/'), '').replace(/^\//, '') : normalizedFilePath;
                    const fullPattern = basePath ? path.join(basePath, patternStr).replace(/\\/g, '/') : patternStr;
                    const regex = patternToRegex(fullPattern);
                    
                    const matches = regex.test(normalizedFilePath) || regex.test(relativePath);
                    
                    if (matches) {
                        results.push({ fsPath: filePath });
                        if (maxResults && results.length >= maxResults) {
                            break;
                        }
                    }
                }
            }
            return results;
        },
        createFileSystemWatcher: () => ({
            onDidCreate: () => ({ dispose: () => {} }),
            onDidChange: () => ({ dispose: () => {} }),
            onDidDelete: () => ({ dispose: () => {} }),
            dispose: () => {}
        })
    },
    window: {
        get activeTextEditor() {
            return activeEditor;
        }
    },
    RelativePattern: class RelativePattern {
        base: string;
        pattern: string;
        constructor(base: { fsPath: string } | string, pattern: string) {
            this.base = typeof base === 'string' ? base : base.fsPath;
            this.pattern = pattern;
        }
    }
};

// Replace vscode module in cache before requiring the module under test
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
    if (request === 'vscode') {
        return '__vscode_mock__';
    }
    if (request === 'fs') {
        return '__fs_mock__';
    }
    return originalResolve.call(this, request, parent, isMain, options);
};
require.cache['__vscode_mock__'] = {
    id: '__vscode_mock__',
    filename: '__vscode_mock__',
    loaded: true,
    exports: mockVscode,
} as any;

// Set up fs mock cache entry (mockFs is already defined above)
require.cache['__fs_mock__'] = {
    id: '__fs_mock__',
    filename: '__fs_mock__',
    loaded: true,
    exports: mockFs,
} as any;

// Now require the module under test - it will get the mocked modules
const { WasmDetector } = require('../utils/wasmDetector');

// ── Helpers ───────────────────────────────────────────────────

function patternToRegex(pattern: string): RegExp {
    // Normalize pattern to use forward slashes
    const normalizedPattern = pattern.replace(/\\/g, '/');
    
    // Convert glob pattern to regex
    let regexStr = normalizedPattern
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.')
        .replace(/\{\{GLOBSTAR\}\}/g, '.*')
        .replace(/\./g, '\\.');
    
    // Handle **/ prefix patterns
    if (normalizedPattern.startsWith('**/')) {
        regexStr = regexStr.replace(/^\.\*\//, '(?:.*\/)?');
    }
    
    return new RegExp(regexStr, 'i');
}

function setupMockFileSystem(files: Record<string, { content?: string; mtime?: Date; isDirectory?: boolean }>) {
    mockFiles.clear();
    const now = new Date();
    
    for (const [filePath, info] of Object.entries(files)) {
        mockFiles.set(path.normalize(filePath), {
            isDirectory: info.isDirectory || false,
            mtime: info.mtime || now,
            content: info.content
        });
    }
}

function setupMockWorkspace(folders: string[]) {
    mockWorkspaceFolders = folders.map((folder, index) => ({
        uri: { fsPath: path.normalize(folder) },
        name: `workspace-${index}`
    }));
}

function setupActiveEditor(filePath: string | null) {
    activeEditor = filePath ? { document: { fileName: path.normalize(filePath) } } : null;
}

function clearMocks() {
    mockFiles.clear();
    mockWorkspaceFolders = [];
    activeEditor = null;
}

// ── Test Fixtures ─────────────────────────────────────────────

const FIXTURES = {
    // Single contract workspace
    singleContract: {
        files: {
            '/workspace/contracts/hello/Cargo.toml': {
                content: '[package]\nname = "hello"\nversion = "0.1.0"'
            },
            '/workspace/contracts/hello/src/lib.rs': {
                content: '#[contract]\npub struct HelloContract;'
            },
            '/workspace/contracts/hello/target/wasm32v1-none/release/hello.wasm': {
                content: 'wasm-binary-data',
                mtime: new Date('2024-01-15')
            }
        },
        folders: ['/workspace']
    },
    
    // Multiple contracts workspace
    multiContract: {
        files: {
            '/workspace/contracts/token/Cargo.toml': {
                content: '[package]\nname = "token"\nversion = "0.1.0"'
            },
            '/workspace/contracts/token/src/lib.rs': { content: 'contract code' },
            '/workspace/contracts/token/target/wasm32v1-none/release/token.wasm': {
                content: 'token-wasm',
                mtime: new Date('2024-01-10')
            },
            '/workspace/contracts/nft/Cargo.toml': {
                content: '[package]\nname = "nft"\nversion = "0.1.0"'
            },
            '/workspace/contracts/nft/src/lib.rs': { content: 'contract code' },
            '/workspace/contracts/nft/target/wasm32-unknown-unknown/release/nft.wasm': {
                content: 'nft-wasm',
                mtime: new Date('2024-01-20')
            }
        },
        folders: ['/workspace']
    },
    
    // No workspace folders
    noWorkspace: {
        files: {},
        folders: []
    },
    
    // No contracts
    noContracts: {
        files: {
            '/workspace/README.md': { content: '# Project' },
            '/workspace/src/main.rs': { content: 'fn main() {}' }
        },
        folders: ['/workspace']
    },
    
    // Multiple WASM targets
    multiWasmTarget: {
        files: {
            '/workspace/contracts/my-contract/Cargo.toml': {
                content: '[package]\nname = "my-contract"\nversion = "0.1.0"'
            },
            '/workspace/contracts/my-contract/src/lib.rs': { content: 'contract code' },
            '/workspace/contracts/my-contract/target/wasm32v1-none/release/my_contract.wasm': {
                content: 'v1-wasm',
                mtime: new Date('2024-01-10')
            },
            '/workspace/contracts/my-contract/target/wasm32-unknown-unknown/release/my_contract.wasm': {
                content: 'unknown-wasm',
                mtime: new Date('2024-01-15')
            }
        },
        folders: ['/workspace']
    }
};

// ── Tests ─────────────────────────────────────────────────────

async function testFindWasmFilesNoWorkspace() {
    clearMocks();
    setupMockWorkspace([]);
    
    const result = await WasmDetector.findWasmFiles();
    assert.deepStrictEqual(result, [], 'should return empty array when no workspace');
    console.log('  [ok] findWasmFiles returns empty array when no workspace');
}

async function testFindWasmFilesNoWasm() {
    clearMocks();
    setupMockFileSystem(FIXTURES.noContracts.files);
    setupMockWorkspace(FIXTURES.noContracts.folders);
    
    const result = await WasmDetector.findWasmFiles();
    assert.deepStrictEqual(result, [], 'should return empty array when no WASM files');
    console.log('  [ok] findWasmFiles returns empty array when no WASM files');
}

async function testFindWasmFilesSingleContract() {
    clearMocks();
    setupMockFileSystem(FIXTURES.singleContract.files);
    setupMockWorkspace(FIXTURES.singleContract.folders);
    
    const result = await WasmDetector.findWasmFiles();
    assert.strictEqual(result.length, 1, 'should find 1 WASM file');
    assert.ok(result[0].includes('hello.wasm'), 'should find hello.wasm');
    assert.ok(result[0].includes('target'), 'should be in target directory');
    console.log('  [ok] findWasmFiles finds WASM in target directory');
}

async function testFindWasmFilesMultipleContracts() {
    clearMocks();
    setupMockFileSystem(FIXTURES.multiContract.files);
    setupMockWorkspace(FIXTURES.multiContract.folders);
    
    const result = await WasmDetector.findWasmFiles();
    assert.strictEqual(result.length, 2, 'should find 2 WASM files');
    
    const paths = result.map(p => p.toLowerCase());
    assert.ok(paths.some(p => p.includes('token.wasm')), 'should find token.wasm');
    assert.ok(paths.some(p => p.includes('nft.wasm')), 'should find nft.wasm');
    console.log('  [ok] findWasmFiles finds multiple WASM files');
}

async function testFindWasmFilesFiltersByPath() {
    clearMocks();
    const files = {
        ...FIXTURES.singleContract.files,
        '/workspace/random/file.wasm': { content: 'not-in-target' },
        '/workspace/node_modules/pkg/file.wasm': { content: 'in-node-modules' }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(FIXTURES.singleContract.folders);
    
    const result = await WasmDetector.findWasmFiles();
    // Should only include WASM files in target or wasm32 directories
    assert.strictEqual(result.length, 1, 'should filter non-target WASM files');
    assert.ok(result[0].includes('target'), 'should only include target WASM files');
    console.log('  [ok] findWasmFiles filters WASM files by target directory');
}

async function testFindLatestWasm() {
    clearMocks();
    setupMockFileSystem(FIXTURES.multiContract.files);
    setupMockWorkspace(FIXTURES.multiContract.folders);
    
    const result = await WasmDetector.findLatestWasm();
    assert.ok(result, 'should return a WASM path');
    assert.ok(result!.includes('nft.wasm'), 'should return the most recent WASM (nft)');
    console.log('  [ok] findLatestWasm returns most recently modified WASM file');
}

async function testFindLatestWasmNoFiles() {
    clearMocks();
    setupMockFileSystem(FIXTURES.noContracts.files);
    setupMockWorkspace(FIXTURES.noContracts.folders);
    
    const result = await WasmDetector.findLatestWasm();
    assert.strictEqual(result, null, 'should return null when no WASM files');
    console.log('  [ok] findLatestWasm returns null when no WASM files');
}

async function testFindContractDirectories() {
    clearMocks();
    setupMockFileSystem(FIXTURES.multiContract.files);
    setupMockWorkspace(FIXTURES.multiContract.folders);
    
    const result = await WasmDetector.findContractDirectories();
    assert.strictEqual(result.length, 2, 'should find 2 contract directories');
    
    const dirs = result.map(d => path.basename(d));
    assert.ok(dirs.includes('token'), 'should include token directory');
    assert.ok(dirs.includes('nft'), 'should include nft directory');
    console.log('  [ok] findContractDirectories finds contract directories');
}

async function testFindContractDirectoriesNoSrc() {
    clearMocks();
    // Create Cargo.toml without src/lib.rs
    const files = {
        '/workspace/contracts/incomplete/Cargo.toml': {
            content: '[package]\nname = "incomplete"\nversion = "0.1.0"'
        }
        // No src/lib.rs
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const result = await WasmDetector.findContractDirectories();
    assert.strictEqual(result.length, 0, 'should not include directories without src/lib.rs');
    console.log('  [ok] findContractDirectories excludes directories without src/lib.rs');
}

async function testFindContractDirectoriesNoWorkspace() {
    clearMocks();
    setupMockWorkspace([]);
    
    const result = await WasmDetector.findContractDirectories();
    assert.deepStrictEqual(result, [], 'should return empty array when no workspace');
    console.log('  [ok] findContractDirectories returns empty array when no workspace');
}

async function testGetActiveContractDirectory() {
    clearMocks();
    setupMockFileSystem(FIXTURES.singleContract.files);
    setupActiveEditor('/workspace/contracts/hello/src/lib.rs');
    
    const result = WasmDetector.getActiveContractDirectory();
    assert.ok(result, 'should find active contract directory');
    assert.ok(result!.includes('hello'), 'should be the hello contract directory');
    assert.ok(result!.endsWith('hello') || result!.endsWith('hello' + path.sep), 
        'should end with hello directory');
    console.log('  [ok] getActiveContractDirectory finds contract from active editor');
}

async function testGetActiveContractDirectoryNoEditor() {
    clearMocks();
    setupActiveEditor(null);
    
    const result = WasmDetector.getActiveContractDirectory();
    assert.strictEqual(result, null, 'should return null when no active editor');
    console.log('  [ok] getActiveContractDirectory returns null when no active editor');
}

async function testGetActiveContractDirectoryDeepFile() {
    clearMocks();
    setupMockFileSystem(FIXTURES.singleContract.files);
    setupActiveEditor('/workspace/contracts/hello/src/submodule/deep/file.rs');
    
    const result = WasmDetector.getActiveContractDirectory();
    assert.ok(result, 'should find contract directory from deep file path');
    assert.ok(result!.includes('hello'), 'should traverse up to find Cargo.toml');
    console.log('  [ok] getActiveContractDirectory traverses directory tree');
}

async function testGetActiveContractDirectoryNoCargo() {
    clearMocks();
    setupActiveEditor('/random/path/file.rs');
    
    const result = WasmDetector.getActiveContractDirectory();
    assert.strictEqual(result, null, 'should return null when no Cargo.toml found');
    console.log('  [ok] getActiveContractDirectory returns null when no Cargo.toml in path');
}

async function testGetExpectedWasmPathV1Target() {
    clearMocks();
    setupMockFileSystem(FIXTURES.singleContract.files);
    
    const contractDir = '/workspace/contracts/hello';
    const result = WasmDetector.getExpectedWasmPath(contractDir);
    
    assert.ok(result, 'should return a WASM path');
    assert.ok(result!.includes('wasm32v1-none'), 'should find wasm32v1-none target');
    assert.ok(result!.includes('hello.wasm') || result!.includes('hello_contract.wasm'), 
        'should find the WASM file');
    console.log('  [ok] getExpectedWasmPath finds WASM in wasm32v1-none target');
}

async function testGetExpectedWasmPathUnknownTarget() {
    clearMocks();
    // Only wasm32-unknown-unknown target exists
    const files = {
        '/workspace/contracts/my-contract/Cargo.toml': { content: '' },
        '/workspace/contracts/my-contract/target/wasm32-unknown-unknown/release/my_contract.wasm': {
            content: 'wasm'
        }
    };
    setupMockFileSystem(files);
    
    const contractDir = '/workspace/contracts/my-contract';
    const result = WasmDetector.getExpectedWasmPath(contractDir);
    
    assert.ok(result, 'should return a WASM path');
    assert.ok(result!.includes('wasm32-unknown-unknown'), 'should find wasm32-unknown-unknown target');
    console.log('  [ok] getExpectedWasmPath finds WASM in wasm32-unknown-unknown target');
}

async function testGetExpectedWasmPathNoWasm() {
    clearMocks();
    setupMockFileSystem({
        '/workspace/contracts/empty/Cargo.toml': { content: '' },
        '/workspace/contracts/empty/target/wasm32v1-none/release/': { isDirectory: true }
    });
    
    const contractDir = '/workspace/contracts/empty';
    const result = WasmDetector.getExpectedWasmPath(contractDir);
    
    assert.strictEqual(result, null, 'should return null when no WASM files');
    console.log('  [ok] getExpectedWasmPath returns null when no WASM files');
}

async function testGetExpectedWasmPathMultipleWasm() {
    clearMocks();
    // Multiple WASM files with different names
    const files = {
        '/workspace/contracts/my-contract/Cargo.toml': { content: '' },
        '/workspace/contracts/my-contract/target/wasm32v1-none/release/my_contract.wasm': {
            content: 'primary',
            mtime: new Date('2024-01-10')
        },
        '/workspace/contracts/my-contract/target/wasm32v1-none/release/other.wasm': {
            content: 'other',
            mtime: new Date('2024-01-05')
        }
    };
    setupMockFileSystem(files);
    
    const contractDir = '/workspace/contracts/my-contract';
    const result = WasmDetector.getExpectedWasmPath(contractDir);
    
    assert.ok(result, 'should return a WASM path');
    // Should prefer the one matching contract name
    assert.ok(result!.includes('my_contract'), 'should prefer WASM matching contract name');
    console.log('  [ok] getExpectedWasmPath prefers WASM file matching contract name');
}

// ── Edge Cases ────────────────────────────────────────────────

async function testHandlesPermissionErrors() {
    clearMocks();
    setupMockWorkspace(['/workspace']);
    // Don't set up any files - will cause read errors that should be handled
    
    try {
        const result = await WasmDetector.findWasmFiles();
        // Should handle gracefully and return empty array
        assert.ok(Array.isArray(result), 'should return array even with errors');
        console.log('  [ok] findWasmFiles handles missing files gracefully');
    } catch (err) {
        // Should not throw
        assert.fail('should not throw on file system errors');
    }
}

async function testHandlesVeryLongPaths() {
    clearMocks();
    const deepPath = '/workspace' + '/very/deep/nested/directory/structure'.repeat(10) + '/Cargo.toml';
    const files: Record<string, { content?: string; isDirectory?: boolean }> = {};
    files[deepPath] = { content: '[package]\nname = "deep"\nversion = "0.1.0"' };
    files[deepPath.replace('Cargo.toml', 'src/lib.rs')] = { content: 'contract' };
    
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    setupActiveEditor(deepPath.replace('Cargo.toml', 'src/lib.rs'));
    
    const result = WasmDetector.getActiveContractDirectory();
    // Should handle deep paths without stack overflow
    assert.ok(result !== undefined, 'should handle very long paths');
    console.log('  [ok] getActiveContractDirectory handles very long paths');
}

async function testHandlesMultipleWorkspaceFolders() {
    clearMocks();
    const files = {
        '/workspace1/contracts/one/Cargo.toml': { content: '[package]\nname = "one"\nversion = "0.1.0"' },
        '/workspace1/contracts/one/src/lib.rs': { content: 'contract' },
        '/workspace1/contracts/one/target/wasm32v1-none/release/one.wasm': { content: 'wasm1' },
        '/workspace2/contracts/two/Cargo.toml': { content: '[package]\nname = "two"\nversion = "0.1.0"' },
        '/workspace2/contracts/two/src/lib.rs': { content: 'contract' },
        '/workspace2/contracts/two/target/wasm32v1-none/release/two.wasm': { content: 'wasm2' }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace1', '/workspace2']);
    
    const wasmResult = await WasmDetector.findWasmFiles();
    assert.strictEqual(wasmResult.length, 2, 'should find WASM files from both workspaces');
    
    const dirResult = await WasmDetector.findContractDirectories();
    assert.strictEqual(dirResult.length, 2, 'should find contracts from both workspaces');
    console.log('  [ok] findWasmFiles and findContractDirectories handle multiple workspace folders');
}

async function testHandlesWindowsPaths() {
    clearMocks();
    // Simulate Windows-style paths
    const winFiles: Record<string, { content?: string; isDirectory?: boolean }> = {};
    winFiles['C:\\Users\\dev\\project\\contracts\\test\\Cargo.toml'] = {
        content: '[package]\nname = "test"\nversion = "0.1.0"'
    };
    winFiles['C:\\Users\\dev\\project\\contracts\\test\\src\\lib.rs'] = { content: 'contract' };
    winFiles['C:\\Users\\dev\\project\\contracts\\test\\target\\wasm32v1-none\\release\\test.wasm'] = {
        content: 'wasm'
    };
    
    setupMockFileSystem(winFiles);
    setupMockWorkspace(['C:\\Users\\dev\\project']);
    setupActiveEditor('C:\\Users\\dev\\project\\contracts\\test\\src\\lib.rs');
    
    const dirResult = await WasmDetector.findContractDirectories();
    assert.strictEqual(dirResult.length, 1, 'should handle Windows paths');
    
    const wasmResult = await WasmDetector.findWasmFiles();
    assert.strictEqual(wasmResult.length, 1, 'should find WASM with Windows paths');
    
    const activeResult = WasmDetector.getActiveContractDirectory();
    assert.ok(activeResult, 'should find active directory with Windows paths');
    console.log('  [ok] WasmDetector handles Windows-style paths');
}

async function testPerformanceWithManyContracts() {
    clearMocks();
    const files: Record<string, { content?: string; isDirectory?: boolean }> = {};
    
    // Create 100 contracts
    for (let i = 0; i < 100; i++) {
        files[`/workspace/contracts/contract-${i}/Cargo.toml`] = {
            content: `[package]\nname = "contract-${i}"\nversion = "0.1.0"`
        };
        files[`/workspace/contracts/contract-${i}/src/lib.rs`] = { content: 'contract' };
        files[`/workspace/contracts/contract-${i}/target/wasm32v1-none/release/contract_${i}.wasm`] = {
            content: 'wasm'
        };
    }
    
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const startTime = Date.now();
    const dirResult = await WasmDetector.findContractDirectories();
    const wasmResult = await WasmDetector.findWasmFiles();
    const endTime = Date.now();
    
    assert.strictEqual(dirResult.length, 100, 'should find all 100 contracts');
    assert.strictEqual(wasmResult.length, 100, 'should find all 100 WASM files');
    assert.ok(endTime - startTime < 5000, 'should complete within 5 seconds');
    console.log(`  [ok] Performance test: ${endTime - startTime}ms for 100 contracts`);
}

// ── Test Runner ───────────────────────────────────────────────

const tests: Array<[string, () => Promise<void>]> = [
    // findWasmFiles tests
    ['findWasmFiles - no workspace', testFindWasmFilesNoWorkspace],
    ['findWasmFiles - no WASM files', testFindWasmFilesNoWasm],
    ['findWasmFiles - single contract', testFindWasmFilesSingleContract],
    ['findWasmFiles - multiple contracts', testFindWasmFilesMultipleContracts],
    ['findWasmFiles - filters by path', testFindWasmFilesFiltersByPath],
    
    // findLatestWasm tests
    ['findLatestWasm - finds most recent', testFindLatestWasm],
    ['findLatestWasm - no files returns null', testFindLatestWasmNoFiles],
    
    // findContractDirectories tests
    ['findContractDirectories - finds contracts', testFindContractDirectories],
    ['findContractDirectories - no src/lib.rs excluded', testFindContractDirectoriesNoSrc],
    ['findContractDirectories - no workspace', testFindContractDirectoriesNoWorkspace],
    
    // getActiveContractDirectory tests
    ['getActiveContractDirectory - active editor', testGetActiveContractDirectory],
    ['getActiveContractDirectory - no editor', testGetActiveContractDirectoryNoEditor],
    ['getActiveContractDirectory - deep file', testGetActiveContractDirectoryDeepFile],
    ['getActiveContractDirectory - no Cargo.toml', testGetActiveContractDirectoryNoCargo],
    
    // getExpectedWasmPath tests
    ['getExpectedWasmPath - wasm32v1-none target', testGetExpectedWasmPathV1Target],
    ['getExpectedWasmPath - wasm32-unknown-unknown target', testGetExpectedWasmPathUnknownTarget],
    ['getExpectedWasmPath - no WASM returns null', testGetExpectedWasmPathNoWasm],
    ['getExpectedWasmPath - multiple WASM files', testGetExpectedWasmPathMultipleWasm],
    
    // Edge cases
    ['handles permission errors gracefully', testHandlesPermissionErrors],
    ['handles very long paths', testHandlesVeryLongPaths],
    ['handles multiple workspace folders', testHandlesMultipleWorkspaceFolders],
    ['handles Windows-style paths', testHandlesWindowsPaths],
    ['performance with many contracts', testPerformanceWithManyContracts],
];

(async () => {
    console.log('\nRunning wasmDetector.test.ts…\n');
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
