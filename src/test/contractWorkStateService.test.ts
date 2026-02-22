declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
import {
    ContractWorkspaceStateService,
    ContractDeploymentRecord,
} from '../services/contractWorkStateService';

class MockMemento {
    private store = new Map<string, unknown>();

    get<T>(key: string, defaultValue: T): T {
        return this.store.has(key) ? this.store.get(key) as T : defaultValue;
    }

    update(key: string, value: unknown): Promise<void> {
        this.store.set(key, value);
        return Promise.resolve();
    }
}

function makeService(seed?: (memento: MockMemento) => void) {
    const memento = new MockMemento();
    if (seed) {
        seed(memento);
    }

    const context = { workspaceState: memento };
    const workspace = {
        workspaceFolders: [
            {
                uri: { fsPath: '/tmp/workspace-a' },
                name: 'workspace-a',
            },
        ],
    };

    const service = new ContractWorkspaceStateService(context as any, workspace as any);
    return { service, memento, workspace };
}

async function testMigratesLegacyState() {
    const { service, memento } = makeService(mem => {
        void mem.update('lastContractId', 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST');
        void mem.update('stellarSuite.deploymentHistory', [
            {
                contractId: 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
                contractName: 'hello',
                deployedAt: '2024-01-01T00:00:00.000Z',
                network: 'testnet',
                source: 'dev',
            },
        ]);
        void mem.update('stellarSuite.contractAliases', { '/tmp/workspace-a/hello/Cargo.toml': 'HelloAlias' });
    });

    await service.initialize();

    assert.strictEqual(service.getLastContractId(), 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST');
    assert.strictEqual(service.getDeploymentHistory().length, 1);
    assert.strictEqual(service.getPreferences().contractAliases['/tmp/workspace-a/hello/Cargo.toml'], 'HelloAlias');
    console.log('  [ok] migrates legacy workspace state');
}

async function testRecordsDeploymentAndMirrorsLegacyKeys() {
    const { service, memento } = makeService();
    await service.initialize();

    const record: ContractDeploymentRecord = {
        contractId: 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
        contractName: 'counter',
        contractPath: '/tmp/workspace-a/counter/Cargo.toml',
        deployedAt: '2024-01-02T00:00:00.000Z',
        network: 'testnet',
        source: 'dev',
        transactionHash: 'abc123',
    };

    await service.recordDeployment(record);

    assert.strictEqual(service.getDeploymentHistory()[0].contractName, 'counter');
    assert.strictEqual(service.getDeployedContracts()['/tmp/workspace-a/counter/Cargo.toml'], record.contractId);

    const legacyLast = memento.get<string | undefined>('lastContractId', undefined);
    assert.strictEqual(legacyLast, record.contractId);
    console.log('  [ok] records deployment and mirrors legacy keys');
}

async function testHandlesCorruptedStateGracefully() {
    const { service, memento } = makeService(mem => {
        void mem.update('stellarSuite.contractWorkspaceState', 'invalid-state-shape');
    });

    await service.initialize();

    assert.strictEqual(service.getDeploymentHistory().length, 0);
    const backup = memento.get<any>('stellarSuite.contractWorkspaceState.corruptedBackup', undefined);
    assert.ok(backup);
    console.log('  [ok] handles corruption with recovery and backup');
}

async function testExportImportRoundTrip() {
    const { service } = makeService();
    await service.initialize();

    await service.recordDeployment({
        contractId: 'CABCDEFGHIJKLMNOPQRSTUVWXY1234567890ABCDEFGHIJKLMNOPQRST',
        contractName: 'token',
        contractPath: '/tmp/workspace-a/token/Cargo.toml',
        deployedAt: '2024-01-03T00:00:00.000Z',
        network: 'testnet',
        source: 'dev',
    });

    const exported = service.exportState();

    const { service: importedService } = makeService();
    await importedService.initialize();
    const result = await importedService.importState(exported, 'replace');

    assert.strictEqual(result.success, true);
    assert.strictEqual(importedService.getDeploymentHistory().length, 1);
    console.log('  [ok] exports and imports state');
}

async function testSupportsMultipleWorkspaceConfigurations() {
    const { memento } = makeService();

    const context = { workspaceState: memento };
    const workspaceA = { workspaceFolders: [{ uri: { fsPath: '/tmp/workspace-a' }, name: 'a' }] };
    const workspaceB = { workspaceFolders: [{ uri: { fsPath: '/tmp/workspace-b' }, name: 'b' }] };

    const serviceA = new ContractWorkspaceStateService(context as any, workspaceA as any);
    await serviceA.initialize();
    await serviceA.recordDeployment({
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        contractName: 'alpha',
        contractPath: '/tmp/workspace-a/alpha/Cargo.toml',
        deployedAt: '2024-01-04T00:00:00.000Z',
        network: 'testnet',
        source: 'dev',
    });

    const serviceB = new ContractWorkspaceStateService(context as any, workspaceB as any);
    await serviceB.initialize();
    await serviceB.recordDeployment({
        contractId: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        contractName: 'beta',
        contractPath: '/tmp/workspace-b/beta/Cargo.toml',
        deployedAt: '2024-01-05T00:00:00.000Z',
        network: 'mainnet',
        source: 'ops',
    });

    assert.strictEqual(serviceA.getDeploymentHistory().length, 1);
    assert.strictEqual(serviceB.getDeploymentHistory().length, 1);
    assert.notStrictEqual(serviceA.getDeploymentHistory()[0].contractName, serviceB.getDeploymentHistory()[0].contractName);
    console.log('  [ok] supports multiple workspace configurations');
}

async function run() {
    const tests: Array<() => Promise<void>> = [
        testMigratesLegacyState,
        testRecordsDeploymentAndMirrorsLegacyKeys,
        testHandlesCorruptedStateGracefully,
        testExportImportRoundTrip,
        testSupportsMultipleWorkspaceConfigurations,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\ncontractWorkspaceStateService unit tests');
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
