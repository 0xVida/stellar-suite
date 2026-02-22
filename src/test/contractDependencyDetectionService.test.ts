// ============================================================
// src/test/contractDependencyDetectionService.test.ts
// Unit tests for contract dependency detection service
// Run with: node out-test/test/contractDependencyDetectionService.test.js
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
const path = require('path');

import { ContractDependencyDetectionService } from '../services/contractDependencyDetectionService';
import { ContractMetadata } from '../services/contractMetadataService';

// ── Test utilities ────────────────────────────────────────────

function createMockContract(
    name: string,
    cargoTomlPath: string,
    deps: Record<string, any> = {},
    buildDeps: Record<string, any> = {},
    devDeps: Record<string, any> = {}
): ContractMetadata {
    return {
        contractName: name,
        cargoTomlPath,
        contractDir: path.dirname(cargoTomlPath),
        package: undefined,  // Package info is optional
        dependencies: deps,
        devDependencies: devDeps,
        buildDependencies: buildDeps,
        contractDependencies: [],
        isWorkspaceRoot: false,
        cachedAt: new Date().toISOString(),
        parseWarnings: [],
    };
}

function createMockOutputChannel() {
    const messages: string[] = [];
    return {
        appendLine: (msg: string) => messages.push(msg),
        getMessages: () => messages,
        clear: () => messages.length = 0,
    };
}

// ── Test cases ────────────────────────────────────────────────

async function testBasicDependencyGraph() {
    console.log('\n[Test] Basic dependency graph construction');

    const outputChannel = createMockOutputChannel();
    const service = new ContractDependencyDetectionService(outputChannel as any);

    const contractA = createMockContract(
        'contract-a',
        '/workspace/contracts/a/Cargo.toml',
        {
            'contract-b': { name: 'contract-b', workspace: true },
        }
    );

    const contractB = createMockContract(
        'contract-b',
        '/workspace/contracts/b/Cargo.toml'
    );

    const graph = await service.buildDependencyGraph([contractA, contractB], {
        detectImports: false,
    });

    assert.strictEqual(graph.nodes.size, 2, 'Should have 2 nodes');
    assert.strictEqual(graph.edges.length, 1, 'Should have 1 edge');
    assert.strictEqual(graph.cycles.length, 0, 'Should have no cycles');
    assert.strictEqual(graph.deploymentOrder.length, 2, 'Should have deployment order');

    console.log('  ✓ Basic dependency graph constructed correctly');
}

async function testCircularDependencies() {
    console.log('\n[Test] Circular dependency detection');

    const outputChannel = createMockOutputChannel();
    const service = new ContractDependencyDetectionService(outputChannel as any);

    const contractA = createMockContract(
        'contract-a',
        '/workspace/contracts/a/Cargo.toml',
        {
            'contract-b': { name: 'contract-b', workspace: true },
        }
    );

    const contractB = createMockContract(
        'contract-b',
        '/workspace/contracts/b/Cargo.toml',
        {
            'contract-a': { name: 'contract-a', workspace: true },
        }
    );

    const graph = await service.buildDependencyGraph([contractA, contractB], {
        detectImports: false,
    });

    assert.ok(graph.cycles.length > 0, 'Should detect circular dependencies');
    assert.ok(service.hasCircularDependencies(graph), 'hasCircularDependencies should return true');

    const details = service.getCircularDependencyDetails(graph);
    assert.ok(details.length > 0, 'Should have circular dependency details');

    console.log(`  ✓ Circular dependency detected: ${details[0]}`);
}

async function testDependencyChain() {
    console.log('\n[Test] Multi-level dependency chain');

    const outputChannel = createMockOutputChannel();
    const service = new ContractDependencyDetectionService(outputChannel as any);

    const contractC = createMockContract(
        'contract-c',
        '/workspace/contracts/c/Cargo.toml'
    );

    const contractB = createMockContract(
        'contract-b',
        '/workspace/contracts/b/Cargo.toml',
        {
            'contract-c': { name: 'contract-c', workspace: true },
        }
    );

    const contractA = createMockContract(
        'contract-a',
        '/workspace/contracts/a/Cargo.toml',
        {
            'contract-b': { name: 'contract-b', workspace: true },
        }
    );

    const graph = await service.buildDependencyGraph([contractA, contractB, contractC], {
        detectImports: false,
    });

    assert.strictEqual(graph.nodes.size, 3, 'Should have 3 nodes');
    assert.strictEqual(graph.cycles.length, 0, 'Should have no cycles');

    console.log('  ✓ Multi-level dependency chain handled correctly');
}

// ── Main test runner ──────────────────────────────────────────

(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  Contract Dependency Detection Service Tests             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');

    try {
        await testBasicDependencyGraph();
        await testCircularDependencies();
        await testDependencyChain();

        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║  ✓ ALL TESTS PASSED                                      ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
        if (error instanceof Error && error.stack) {
            console.error('Stack trace:', error.stack);
        }
        process.exitCode = 1;
    }
})();
