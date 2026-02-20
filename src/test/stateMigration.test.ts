import * as assert from 'assert';
import * as vscode from 'vscode';
import { StateMigrationService, Migration } from '../services/stateMigrationService';

// Mock output channel
class MockOutputChannel implements vscode.OutputChannel {
    name: string = 'Mock';
    append(value: string): void { }
    appendLine(value: string): void { }
    replace(value: string): void { }
    clear(): void { }
    show(preserveFocus?: boolean): void;
    show(column?: vscode.ViewColumn, preserveFocus?: boolean): void;
    show(column?: any, preserveFocus?: any): void { }
    hide(): void { }
    dispose(): void { }
}

// Mock memento
class MockMemento implements vscode.Memento {
    private storage: Map<string, any> = new Map();

    keys(): readonly string[] {
        return Array.from(this.storage.keys());
    }

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get(key: string, defaultValue?: any): any {
        return this.storage.has(key) ? this.storage.get(key) : defaultValue;
    }

    async update(key: string, value: any): Promise<void> {
        this.storage.set(key, value);
    }
}

suite('StateMigrationService Test Suite', () => {
    let mockState: MockMemento;
    let mockOutput: MockOutputChannel;
    let service: StateMigrationService;

    setup(() => {
        mockState = new MockMemento();
        mockOutput = new MockOutputChannel();
        service = new StateMigrationService(mockState, mockOutput);
    });

    test('should run migrations correctly in order', async () => {
        let executionOrder: number[] = [];

        const migration1: Migration = {
            version: 1,
            name: 'v1',
            up: async () => { executionOrder.push(1); },
            down: async () => { },
        };
        const migration2: Migration = {
            version: 2,
            name: 'v2',
            up: async () => { executionOrder.push(2); },
            down: async () => { },
        };

        service.registerMigrations([migration2, migration1]); // Unordered intentionally

        const success = await service.runMigrations();

        assert.strictEqual(success, true);
        assert.deepStrictEqual(executionOrder, [1, 2]);
        assert.strictEqual(service.getCurrentVersion(), 2);
    });

    test('should skip migrations that are older than current version', async () => {
        await mockState.update('stellarSuite.stateVersion', 2);

        let executionOrder: number[] = [];
        const migration1: Migration = {
            version: 1,
            name: 'v1',
            up: async () => { executionOrder.push(1); },
            down: async () => { },
        };
        const migration3: Migration = {
            version: 3,
            name: 'v3',
            up: async () => { executionOrder.push(3); },
            down: async () => { },
        };

        service.registerMigrations([migration1, migration3]);
        const success = await service.runMigrations();

        assert.strictEqual(success, true);
        assert.deepStrictEqual(executionOrder, [3]);
        assert.strictEqual(service.getCurrentVersion(), 3);
    });

    test('should rollback when a migration fails', async () => {
        let stateModifications: string[] = [];

        const migration1: Migration = {
            version: 1,
            name: 'v1',
            up: async () => { stateModifications.push('up1'); },
            down: async () => { stateModifications.push('down1'); },
        };

        const migration2: Migration = {
            version: 2,
            name: 'v2',
            up: async () => {
                stateModifications.push('up2');
                throw new Error('Failure!');
            },
            down: async () => { stateModifications.push('down2'); },
        };

        service.registerMigrations([migration1, migration2]);
        const success = await service.runMigrations();

        assert.strictEqual(success, false);
        // Should execute up1, up2, then down2 since v2 failed. 
        // Note: rollback only happens for the failed migration currently, 
        // to revert the partial changes of that specific migration.
        assert.deepStrictEqual(stateModifications, ['up1', 'up2', 'down2']);
        // Version should remain as 1, because v1 succeeded and v2 failed
        assert.strictEqual(service.getCurrentVersion(), 1);
    });

    test('should fail when validation fails but still rollback', async () => {
        let rolledBack = false;

        const migration1: Migration = {
            version: 1,
            name: 'v1 fail validate',
            up: async () => { },
            down: async () => { rolledBack = true; },
            validate: () => false // Fails validation
        };

        service.registerMigration(migration1);
        const success = await service.runMigrations();

        assert.strictEqual(success, false);
        assert.strictEqual(rolledBack, true);
        assert.strictEqual(service.getCurrentVersion(), 0);
    });
});
