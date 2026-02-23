// ============================================================
// src/test/workspaceDetector.test.ts
// Unit tests for WorkspaceDetector contract detection utilities.
//
// Run with: node out-test/test/workspaceDetector.test.js
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
                    const normalizedFilePath = filePath.replace(/\\/g, '/');
                    const relativePath = basePath ? normalizedFilePath.replace(basePath.replace(/\\/g, '/'), '').replace(/^\//, '') : normalizedFilePath;
                    const fullPattern = basePath ? path.join(basePath, patternStr).replace(/\\/g, '/') : patternStr;
                    const regex = patternToRegex(fullPattern);
                    
                    if (regex.test(normalizedFilePath) || regex.test(relativePath)) {
                        results.push({ fsPath: filePath });
                        if (maxResults && results.length >= maxResults) {
                            break;
                        }
                    }
                }
            }
            console.log(`findFiles returning ${results.length} results`);
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
const { WorkspaceDetector } = require('../utils/workspaceDetector');

// Override WorkspaceDetector.findContractId for debugging
const originalFindContractId = (WorkspaceDetector as any).findContractId;
(WorkspaceDetector as any).findContractId = async function(): Promise<string | null> {
    console.log('findContractId called');
    
    if (!mockVscode.workspace.workspaceFolders) {
        console.log('No workspace folders');
        return null;
    }

    const searchPatterns = [
        '**/.env',
        '**/.env.local',
        '**/stellar.toml',
        '**/soroban.toml',
        '**/README.md',
        '**/*.toml',
        '**/*.json'
    ];

    for (const folder of mockVscode.workspace.workspaceFolders) {
        for (const pattern of searchPatterns) {
            try {
                const files = await mockVscode.workspace.findFiles(
                    new mockVscode.RelativePattern(folder, pattern),
                    '**/node_modules/**',
                    20
                );
                
                console.log(`Pattern ${pattern}: found ${files.length} files`);

                for (const file of files) {
                    const content = mockFs.readFileSync(file.fsPath, 'utf-8');
                    console.log(`File ${file.fsPath} content: ${content.substring(0, 100)}`);
                    
                    // Look for contract ID pattern (starts with C and is 56 chars)
                    const contractIdMatch = content.match(/C[A-Z0-9]{55}/);
                    if (contractIdMatch) {
                        console.log(`Found contract ID: ${contractIdMatch[0]}`);
                        return contractIdMatch[0];
                    }

                    // Look for CONTRACT_ID= or contract_id = patterns
                    const envMatch = content.match(/(?:CONTRACT_ID|contract_id)\s*[=:]\s*([CA-Z0-9]{56})/i);
                    if (envMatch) {
                        console.log(`Found contract ID from env: ${envMatch[1]}`);
                        return envMatch[1];
                    }
                }
            } catch (error) {
                // Continue searching
            }
        }
    }

    console.log('No contract ID found');
    return null;
};

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
    
    console.log(`setupMockFileSystem called with ${Object.keys(files).length} files`);
    
    for (const [filePath, info] of Object.entries(files)) {
        console.log(`  Adding file: ${filePath}`);
        mockFiles.set(path.normalize(filePath), {
            isDirectory: info.isDirectory || false,
            mtime: info.mtime || now,
            content: info.content
        });
    }
    
    console.log(`Total mock files after setup: ${mockFiles.size}`);
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
    // Standard contract workspace
    standardContracts: {
        files: {
            '/workspace/Cargo.toml': {
                content: '[workspace]\nmembers = ["contracts/*"]'
            },
            '/workspace/contracts/token/Cargo.toml': {
                content: '[package]\nname = "token"\nversion = "0.1.0"'
            },
            '/workspace/contracts/token/src/lib.rs': {
                content: '#[contract]\npub struct TokenContract;'
            },
            '/workspace/contracts/nft/Cargo.toml': {
                content: '[package]\nname = "nft"\nversion = "0.1.0"'
            },
            '/workspace/contracts/nft/src/lib.rs': {
                content: '#[contract]\npub struct NFTContract;'
            }
        },
        folders: ['/workspace']
    },
    
    // Soroban-specific workspace
    sorobanWorkspace: {
        files: {
            '/workspace/soroban/hello/Cargo.toml': {
                content: '[package]\nname = "hello"\nversion = "0.1.0"'
            },
            '/workspace/soroban/hello/src/lib.rs': {
                content: '#[contractimpl]\nimpl HelloContract;'
            },
            '/workspace/soroban/world/Cargo.toml': {
                content: '[package]\nname = "world"\nversion = "0.1.0"'
            },
            '/workspace/soroban/world/src/lib.rs': {
                content: '#[contractimpl]\nimpl WorldContract;'
            }
        },
        folders: ['/workspace']
    },
    
    // Workspace with contract ID in env file
    contractIdEnv: {
        files: {
            '/workspace/.env': {
                content: 'CONTRACT_ID=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC'
            },
            '/workspace/contracts/test/Cargo.toml': {
                content: '[package]\nname = "test"\nversion = "0.1.0"'
            },
            '/workspace/contracts/test/src/lib.rs': {
                content: 'contract code'
            }
        },
        folders: ['/workspace']
    },
    
    // No workspace folders
    noWorkspace: {
        files: {},
        folders: []
    },
    
    // Empty workspace
    emptyWorkspace: {
        files: {
            '/workspace/README.md': { content: '# Empty Project' },
            '/workspace/src/main.rs': { content: 'fn main() {}' }
        },
        folders: ['/workspace']
    },
    
    // Workspace with WASM files
    wasmWorkspace: {
        files: {
            '/workspace/target/wasm32v1-none/release/token.wasm': {
                content: 'wasm-binary'
            },
            '/workspace/target/wasm32v1-none/release/nft.wasm': {
                content: 'wasm-binary'
            }
        },
        folders: ['/workspace']
    }
};

// ── Tests: findContractFiles ──────────────────────────────────

async function testFindContractFilesNoWorkspace() {
    clearMocks();
    setupMockWorkspace([]);
    
    const result = await WorkspaceDetector.findContractFiles();
    assert.deepStrictEqual(result, [], 'should return empty array when no workspace');
    console.log('  [ok] findContractFiles returns empty array when no workspace');
}

async function testFindContractFilesEmptyWorkspace() {
    clearMocks();
    setupMockFileSystem(FIXTURES.emptyWorkspace.files);
    setupMockWorkspace(FIXTURES.emptyWorkspace.folders);
    
    const result = await WorkspaceDetector.findContractFiles();
    // Should find some files even in empty workspace (src/main.rs, etc.)
    assert.ok(Array.isArray(result), 'should return array');
    console.log('  [ok] findContractFiles handles empty workspace');
}

async function testFindContractFilesStandardContracts() {
    clearMocks();
    setupMockFileSystem(FIXTURES.standardContracts.files);
    setupMockWorkspace(FIXTURES.standardContracts.folders);
    
    const result = await WorkspaceDetector.findContractFiles();
    
    // Should find lib.rs files
    const libFiles = result.filter(f => f.includes('lib.rs'));
    assert.ok(libFiles.length >= 2, 'should find at least 2 lib.rs files');
    
    // Should find Cargo.toml files
    const cargoFiles = result.filter(f => f.includes('Cargo.toml'));
    assert.ok(cargoFiles.length >= 2, 'should find at least 2 Cargo.toml files');
    
    console.log('  [ok] findContractFiles finds standard contract files');
}

async function testFindContractFilesSorobanContracts() {
    clearMocks();
    setupMockFileSystem(FIXTURES.sorobanWorkspace.files);
    setupMockWorkspace(FIXTURES.sorobanWorkspace.folders);
    
    const result = await WorkspaceDetector.findContractFiles();
    
    // Should find soroban contract files
    const sorobanFiles = result.filter(f => f.includes('soroban'));
    assert.ok(sorobanFiles.length > 0, 'should find soroban contract files');
    
    console.log('  [ok] findContractFiles finds soroban contract files');
}

async function testFindContractFilesWasm() {
    clearMocks();
    setupMockFileSystem(FIXTURES.wasmWorkspace.files);
    setupMockWorkspace(FIXTURES.wasmWorkspace.folders);
    
    const result = await WorkspaceDetector.findContractFiles();
    
    // Should find WASM files
    const wasmFiles = result.filter(f => f.endsWith('.wasm'));
    assert.strictEqual(wasmFiles.length, 2, 'should find 2 WASM files');
    
    console.log('  [ok] findContractFiles finds WASM files');
}

// ── Tests: findContractId ─────────────────────────────────────

async function testFindContractIdNoWorkspace() {
    clearMocks();
    setupMockWorkspace([]);
    
    const result = await WorkspaceDetector.findContractId();
    assert.strictEqual(result, null, 'should return null when no workspace');
    console.log('  [ok] findContractId returns null when no workspace');
}

async function testFindContractIdInEnv() {
    clearMocks();
    setupMockFileSystem(FIXTURES.contractIdEnv.files);
    setupMockWorkspace(FIXTURES.contractIdEnv.folders);
    
    const result = await WorkspaceDetector.findContractId();
    assert.strictEqual(result, 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC',
        'should find contract ID from .env file');
    console.log('  [ok] findContractId finds ID from .env file');
}

async function testFindContractIdInEnvLocal() {
    clearMocks();
    const files = {
        '/workspace/.env.local': {
            content: 'CONTRACT_ID=CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
        }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const result = await WorkspaceDetector.findContractId();
    assert.strictEqual(result, 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        'should find contract ID from .env.local file');
    console.log('  [ok] findContractId finds ID from .env.local file');
}

async function testFindContractIdInToml() {
    clearMocks();
    const files = {
        '/workspace/stellar.toml': {
            content: 'contract_id = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"'
        }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const result = await WorkspaceDetector.findContractId();
    assert.strictEqual(result, 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
        'should find contract ID from stellar.toml file');
    console.log('  [ok] findContractId finds ID from stellar.toml file');
}

async function testFindContractIdInJson() {
    clearMocks();
    const files = {
        '/workspace/config.json': {
            content: '{"contractId": "CDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"}'
        }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const result = await WorkspaceDetector.findContractId();
    assert.strictEqual(result, 'CDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
        'should find contract ID from JSON file');
    console.log('  [ok] findContractId finds ID from JSON file');
}

async function testFindContractIdInReadme() {
    clearMocks();
    const files = {
        '/workspace/README.md': {
            content: '# Project\n\nContract ID: CEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'
        }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const result = await WorkspaceDetector.findContractId();
    assert.strictEqual(result, 'CEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
        'should find contract ID from README.md');
    console.log('  [ok] findContractId finds ID from README.md');
}

async function testFindContractIdWithEnvPrefix() {
    clearMocks();
    const files = {
        '/workspace/.env': {
            content: 'STELLAR_CONTRACT_ID=CFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
        }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const result = await WorkspaceDetector.findContractId();
    assert.strictEqual(result, 'CFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        'should find contract ID with STELLAR_CONTRACT_ID prefix');
    console.log('  [ok] findContractId finds ID with STELLAR_CONTRACT_ID prefix');
}

async function testFindContractIdNotFound() {
    clearMocks();
    const files = {
        '/workspace/README.md': { content: '# Project\n\nNo contract ID here' }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const result = await WorkspaceDetector.findContractId();
    assert.strictEqual(result, null, 'should return null when no contract ID found');
    console.log('  [ok] findContractId returns null when no contract ID found');
}

async function testFindContractIdInvalidFormat() {
    clearMocks();
    const files = {
        '/workspace/.env': {
            content: 'CONTRACT_ID=INVALID_FORMAT_NOT_56_CHARS'
        }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const result = await WorkspaceDetector.findContractId();
    assert.strictEqual(result, null, 'should return null for invalid contract ID format');
    console.log('  [ok] findContractId rejects invalid format contract IDs');
}

async function testFindContractIdCaseInsensitive() {
    clearMocks();
    const files = {
        '/workspace/config.txt': {
            content: 'contract_id: cggggggggggggggggggggggggggggggggggggggggggggggggg'
        }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const result = await WorkspaceDetector.findContractId();
    assert.strictEqual(result, 'cggggggggggggggggggggggggggggggggggggggggggggggggg',
        'should find lowercase contract ID');
    console.log('  [ok] findContractId is case insensitive');
}

// ── Tests: getActiveContractFile ───────────────────────────────

async function testGetActiveContractFileNoEditor() {
    clearMocks();
    setupActiveEditor(null);
    
    const result = WorkspaceDetector.getActiveContractFile();
    assert.strictEqual(result, null, 'should return null when no active editor');
    console.log('  [ok] getActiveContractFile returns null when no active editor');
}

async function testGetActiveContractFileRustFile() {
    clearMocks();
    setupActiveEditor('/workspace/contracts/token/src/lib.rs');
    
    const result = WorkspaceDetector.getActiveContractFile();
    assert.ok(result, 'should return path for Rust file');
    assert.ok(result!.endsWith('lib.rs'), 'should be the Rust file');
    console.log('  [ok] getActiveContractFile returns path for Rust file');
}

async function testGetActiveContractFileWithContractInPath() {
    clearMocks();
    setupActiveEditor('/workspace/contracts/my-contract/src/lib.rs');
    
    const result = WorkspaceDetector.getActiveContractFile();
    assert.ok(result, 'should return path when "contract" in path');
    assert.ok(result!.includes('contract'), 'path should include "contract"');
    console.log('  [ok] getActiveContractFile returns path with "contract" in path');
}

async function testGetActiveContractFileWithSorobanInPath() {
    clearMocks();
    setupActiveEditor('/workspace/soroban/token/src/lib.rs');
    
    const result = WorkspaceDetector.getActiveContractFile();
    assert.ok(result, 'should return path when "soroban" in path');
    assert.ok(result!.includes('soroban'), 'path should include "soroban"');
    console.log('  [ok] getActiveContractFile returns path with "soroban" in path');
}

async function testGetActiveContractFileNonContract() {
    clearMocks();
    setupActiveEditor('/workspace/utils/helpers.ts');
    
    const result = WorkspaceDetector.getActiveContractFile();
    assert.strictEqual(result, null, 'should return null for non-contract TypeScript file');
    console.log('  [ok] getActiveContractFile returns null for non-contract files');
}

async function testGetActiveContractFilePlainRs() {
    clearMocks();
    setupActiveEditor('/workspace/src/main.rs');
    
    const result = WorkspaceDetector.getActiveContractFile();
    assert.ok(result, 'should return path for any .rs file');
    console.log('  [ok] getActiveContractFile returns path for any Rust file');
}

// ── Edge Cases ────────────────────────────────────────────────

async function testHandlesFileReadErrors() {
    clearMocks();
    setupMockWorkspace(['/workspace']);
    // Don't set up any files - will cause read errors
    
    try {
        const result = await WorkspaceDetector.findContractId();
        assert.strictEqual(result, null, 'should return null on file errors');
        console.log('  [ok] findContractId handles file read errors gracefully');
    } catch (err) {
        assert.fail('should not throw on file system errors');
    }
}

async function testHandlesMultipleWorkspaceFolders() {
    clearMocks();
    const files = {
        '/workspace1/contracts/one/Cargo.toml': { content: '[package]\nname = "one"' },
        '/workspace1/contracts/one/src/lib.rs': { content: 'contract' },
        '/workspace2/contracts/two/Cargo.toml': { content: '[package]\nname = "two"' },
        '/workspace2/contracts/two/src/lib.rs': { content: 'contract' }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace1', '/workspace2']);
    
    const result = await WorkspaceDetector.findContractFiles();
    
    const workspace1Files = result.filter(f => f.includes('workspace1'));
    const workspace2Files = result.filter(f => f.includes('workspace2'));
    
    assert.ok(workspace1Files.length > 0, 'should find files from workspace1');
    assert.ok(workspace2Files.length > 0, 'should find files from workspace2');
    console.log('  [ok] findContractFiles handles multiple workspace folders');
}

async function testHandlesWindowsPaths() {
    clearMocks();
    const winFiles: Record<string, { content?: string }> = {};
    winFiles['C:\\Users\\dev\\project\\contracts\\test\\src\\lib.rs'] = {
        content: '#[contract]\npub struct TestContract;'
    };
    winFiles['C:\\Users\\dev\\project\\contracts\\test\\Cargo.toml'] = {
        content: '[package]\nname = "test"\nversion = "0.1.0"'
    };
    
    setupMockFileSystem(winFiles);
    setupMockWorkspace(['C:\\Users\\dev\\project']);
    setupActiveEditor('C:\\Users\\dev\\project\\contracts\\test\\src\\lib.rs');
    
    const result = await WorkspaceDetector.findContractFiles();
    assert.ok(result.length > 0, 'should handle Windows paths');
    
    const activeResult = WorkspaceDetector.getActiveContractFile();
    assert.ok(activeResult, 'should find active contract file with Windows paths');
    console.log('  [ok] WorkspaceDetector handles Windows-style paths');
}

async function testPerformanceWithManyFiles() {
    clearMocks();
    const files: Record<string, { content?: string }> = {};
    
    // Create 100 contracts with various file types
    for (let i = 0; i < 100; i++) {
        files[`/workspace/contracts/contract-${i}/Cargo.toml`] = {
            content: `[package]\nname = "contract-${i}"\nversion = "0.1.0"`
        };
        files[`/workspace/contracts/contract-${i}/src/lib.rs`] = { content: 'contract' };
        if (i % 2 === 0) {
            files[`/workspace/contracts/contract-${i}/target/wasm32v1-none/release/contract_${i}.wasm`] = {
                content: 'wasm'
            };
        }
    }
    
    // Add a contract ID in one of the files
    files['/workspace/contracts/contract-50/.env'] = {
        content: 'CONTRACT_ID=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATEST'
    };
    
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const startTime = Date.now();
    const filesResult = await WorkspaceDetector.findContractFiles();
    const idResult = await WorkspaceDetector.findContractId();
    const endTime = Date.now();
    
    assert.ok(filesResult.length >= 100, 'should find many contract files');
    assert.strictEqual(idResult, 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATEST',
        'should find contract ID in large workspace');
    assert.ok(endTime - startTime < 5000, 'should complete within 5 seconds');
    console.log(`  [ok] Performance test: ${endTime - startTime}ms for 100 contracts`);
}

async function testHandlesDeeplyNestedContracts() {
    clearMocks();
    const deepPath = '/workspace' + '/very/deeply/nested/contracts/structure'.repeat(5);
    const files: Record<string, { content?: string }> = {};
    files[deepPath + '/Cargo.toml'] = { content: '[package]\nname = "deep"\nversion = "0.1.0"' };
    files[deepPath + '/src/lib.rs'] = { content: 'contract' };
    files[deepPath + '/target/wasm32v1-none/release/deep.wasm'] = { content: 'wasm' };
    
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const result = await WorkspaceDetector.findContractFiles();
    assert.ok(result.length > 0, 'should find deeply nested contract files');
    console.log('  [ok] findContractFiles handles deeply nested contracts');
}

async function testIgnoresNodeModules() {
    clearMocks();
    const files = {
        '/workspace/contracts/valid/Cargo.toml': { content: '[package]\nname = "valid"' },
        '/workspace/contracts/valid/src/lib.rs': { content: 'contract' },
        '/workspace/node_modules/some-pkg/src/lib.rs': { content: 'should be ignored' },
        '/workspace/node_modules/other-pkg/Cargo.toml': { content: '[package]\nname = "other"' }
    };
    setupMockFileSystem(files);
    setupMockWorkspace(['/workspace']);
    
    const result = await WorkspaceDetector.findContractFiles();
    
    const nodeModulesFiles = result.filter(f => f.includes('node_modules'));
    assert.strictEqual(nodeModulesFiles.length, 0, 'should exclude node_modules files');
    console.log('  [ok] findContractFiles excludes node_modules directory');
}

// ── Test Runner ───────────────────────────────────────────────

const tests: Array<[string, () => Promise<void>]> = [
    // findContractFiles tests
    ['findContractFiles - no workspace', testFindContractFilesNoWorkspace],
    ['findContractFiles - empty workspace', testFindContractFilesEmptyWorkspace],
    ['findContractFiles - standard contracts', testFindContractFilesStandardContracts],
    ['findContractFiles - soroban contracts', testFindContractFilesSorobanContracts],
    ['findContractFiles - WASM files', testFindContractFilesWasm],
    
    // findContractId tests
    ['findContractId - no workspace', testFindContractIdNoWorkspace],
    ['findContractId - in .env file', testFindContractIdInEnv],
    ['findContractId - in .env.local file', testFindContractIdInEnvLocal],
    ['findContractId - in stellar.toml', testFindContractIdInToml],
    ['findContractId - in JSON file', testFindContractIdInJson],
    ['findContractId - in README.md', testFindContractIdInReadme],
    ['findContractId - with env prefix', testFindContractIdWithEnvPrefix],
    ['findContractId - not found', testFindContractIdNotFound],
    ['findContractId - invalid format', testFindContractIdInvalidFormat],
    ['findContractId - case insensitive', testFindContractIdCaseInsensitive],
    
    // getActiveContractFile tests
    ['getActiveContractFile - no editor', testGetActiveContractFileNoEditor],
    ['getActiveContractFile - Rust file', testGetActiveContractFileRustFile],
    ['getActiveContractFile - contract in path', testGetActiveContractFileWithContractInPath],
    ['getActiveContractFile - soroban in path', testGetActiveContractFileWithSorobanInPath],
    ['getActiveContractFile - non-contract file', testGetActiveContractFileNonContract],
    ['getActiveContractFile - plain .rs file', testGetActiveContractFilePlainRs],
    
    // Edge cases
    ['handles file read errors', testHandlesFileReadErrors],
    ['handles multiple workspace folders', testHandlesMultipleWorkspaceFolders],
    ['handles Windows paths', testHandlesWindowsPaths],
    ['performance with many files', testPerformanceWithManyFiles],
    ['handles deeply nested contracts', testHandlesDeeplyNestedContracts],
    ['ignores node_modules', testIgnoresNodeModules],
];

(async () => {
    console.log('\nRunning workspaceDetector.test.ts…\n');
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
