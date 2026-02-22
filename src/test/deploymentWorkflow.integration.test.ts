declare function require(name: string): any;
declare const process: {
    env: Record<string, string | undefined>;
    exitCode?: number;
};

const assert = require('assert');
const fs = require('fs');
const path = require('path');

import {
    CliConfiguration,
    CliConfigurationService,
    CliConfigurationStore,
    DEFAULT_CLI_CONFIGURATION,
    normalizeCliConfiguration,
} from '../services/cliConfigurationService';
import { ContractDeployer } from '../services/contractDeployer';
import { CliOutputStreamingService } from '../services/cliOutputStreamingService';
import { DeploymentFixtures } from './fixtures/deploymentFixtures';
import {
    createDeploymentFixtureWorkspace,
    detectContractDirectories,
    detectExpectedWasmPath,
} from './fixtures/deploymentWorkflowFixtures';
import { MockCliOutputStreamingService } from './mocks/mockCliOutputStreamingService';
import { DeploymentRetryStatus } from '../types/deploymentRetry';

class MemoryStore implements CliConfigurationStore {
    private data = new Map<string, unknown>();

    get<T>(key: string, defaultValue: T): T {
        return this.data.has(key) ? this.data.get(key) as T : defaultValue;
    }

    update<T>(key: string, value: T): Promise<void> {
        this.data.set(key, value);
        return Promise.resolve();
    }
}

function createConfigService(base?: Partial<CliConfiguration>): CliConfigurationService {
    const store = new MemoryStore();
    return new CliConfigurationService(
        store,
        () => normalizeCliConfiguration({
            ...DEFAULT_CLI_CONFIGURATION,
            ...(base || {}),
        }),
    );
}

type AnyFn = (...args: any[]) => any;

function patchMethod<T extends object, K extends keyof T>(
    obj: T,
    key: K,
    impl: AnyFn
): () => void {
    const original = (obj as any)[key];
    (obj as any)[key] = impl;
    return () => {
        (obj as any)[key] = original;
    };
}

function getArgValue(args: string[], flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) {
        return undefined;
    }
    return args[idx + 1];
}

function assertErrorContains(
    result: { error?: string; errorSummary?: string },
    expectedText: string,
): void {
    const haystack = [result.error, result.errorSummary].filter(Boolean).join('\n').toLowerCase();
    assert.ok(
        haystack.includes(expectedText.toLowerCase()),
        `Expected error output to include "${expectedText}", got: ${haystack || '(empty)'}`,
    );
}

async function testContractDetectionAcrossWorkspace() {
    const workspace = createDeploymentFixtureWorkspace(['alpha-contract', 'beta-contract']);
    try {
        const detected = detectContractDirectories(workspace.rootDir);
        const expected = workspace.contracts.map(contract => contract.dir).sort();
        assert.deepStrictEqual(detected, expected, 'should detect all contract directories in workspace');
        console.log('  [ok] contract detection across workspace');
    } finally {
        workspace.cleanup();
    }
}

async function testCompleteDeploymentFlow() {
    const workspace = createDeploymentFixtureWorkspace(['hello-contract']);
    try {
        const contractDirs = detectContractDirectories(workspace.rootDir);
        assert.strictEqual(contractDirs.length, 1, 'should detect one contract directory');

        const mockCli = new MockCliOutputStreamingService();
        const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

        const wasmFileName = path.basename(workspace.contracts[0].wasmPath);
        mockCli.setResponse('build', {
            exitCode: 0,
            stdout: [
                'Compiling contract...',
                'Finished release [optimized] target(s) in 0.1s',
                `Compiled contract wasm: target/wasm32-unknown-unknown/release/${wasmFileName}`,
            ].join('\n'),
            stderr: '',
        });
        mockCli.setResponse('deploy', {
            exitCode: 0,
            stdout: DeploymentFixtures.SUCCESSFUL_DEPLOY,
            stderr: '',
        });

        const streamedOutput: string[] = [];
        const result = await deployer.buildAndDeploy(contractDirs[0], {
            onStdout: (chunk) => streamedOutput.push(chunk),
            onStderr: (chunk) => streamedOutput.push(chunk),
        });

        assert.strictEqual(result.success, true);
        assert.ok(result.contractId, 'contract ID should be populated');
        assert.ok(result.transactionHash, 'transaction hash should be populated');
        assert.strictEqual(mockCli.callCount, 2, 'should run build + deploy');

        const expectedWasm = detectExpectedWasmPath(contractDirs[0]);
        assert.ok(expectedWasm, 'expected wasm path should be detected');
        assert.ok(fs.existsSync(expectedWasm), 'detected wasm path should exist');

        const streamed = streamedOutput.join('\n');
        assert.ok(streamed.includes('Compiled contract wasm'), 'stream output should include build logs');
        assert.ok(streamed.includes('Contract ID:'), 'stream output should include deploy logs');

        assert.ok(result.buildOutput?.includes('Compiled contract wasm'));
        assert.ok(result.deployOutput?.includes('Contract ID'));
        console.log('  [ok] complete deployment workflow (detect -> build -> deploy -> verify)');
    } finally {
        workspace.cleanup();
    }
}

async function testDeploymentErrorScenarios() {
    const workspace = createDeploymentFixtureWorkspace(['error-contract']);
    try {
        const mockCli = new MockCliOutputStreamingService();
        const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

        mockCli.setResponse('build', {
            exitCode: 1,
            stdout: '',
            stderr: 'error: build failed due to syntax issue',
        });

        const buildFail = await deployer.buildAndDeploy(workspace.contracts[0].dir);
        assert.strictEqual(buildFail.success, false);
        assertErrorContains(buildFail, 'build failed');

        mockCli.setResponse('build', {
            exitCode: 0,
            stdout: `Compiled contract wasm: target/wasm32-unknown-unknown/release/${path.basename(workspace.contracts[0].wasmPath)}`,
            stderr: '',
        });
        mockCli.setResponse('deploy', {
            exitCode: 0,
            stdout: DeploymentFixtures.MALFORMED_DEPLOY_OUTPUT,
            stderr: '',
        });

        const deployFail = await deployer.buildAndDeploy(workspace.contracts[0].dir);
        assert.strictEqual(deployFail.success, false);
        assertErrorContains(deployFail, 'could not extract contract id');
        console.log('  [ok] deployment workflow error scenarios (build + deploy failures)');
    } finally {
        workspace.cleanup();
    }
}

async function testRetryLogicIntegration() {
    let attempts = 0;
    const restore = patchMethod(
        ContractDeployer.prototype,
        'deployContract',
        async () => {
            attempts += 1;
            if (attempts < 2) {
                return {
                    success: false,
                    error: 'network error: timeout',
                    errorSummary: 'network timeout',
                };
            }
            return {
                success: true,
                contractId: 'CRETRY123456789012345678901234567890123456789012345678901',
                transactionHash: 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            };
        }
    );

    try {
        const deployer = new ContractDeployer('stellar', 'dev', 'testnet');
        const record = await deployer.deployWithRetry('/fake/path/contract.wasm', {
            maxAttempts: 3,
            initialDelayMs: 5,
            maxDelayMs: 10,
            backoffMultiplier: 1,
            useJitter: false,
            attemptTimeoutMs: 1000,
        });

        assert.strictEqual(record.status, DeploymentRetryStatus.SUCCEEDED);
        assert.strictEqual(record.attempts.length, 2);
        assert.strictEqual(attempts, 2);
        assert.ok(record.contractId);
        console.log('  [ok] retry logic integration (transient failure -> success)');
    } finally {
        restore();
    }
}

async function testMultiNetworkDeploymentWithProfiles() {
    const workspace = createDeploymentFixtureWorkspace(['network-contract']);
    try {
        const configService = createConfigService();
        const mockCli = new MockCliOutputStreamingService();
        mockCli.setDefaultResponse({
            exitCode: 0,
            stdout: DeploymentFixtures.SUCCESSFUL_DEPLOY,
            stderr: '',
        });

        const testnetProfile = await configService.createProfile('Testnet Profile', {
            network: 'testnet',
            source: 'dev',
        });
        const mainnetProfile = await configService.createProfile('Mainnet Profile', {
            network: 'mainnet',
            source: 'ops',
        });

        await configService.setActiveProfile(testnetProfile.id);
        const testnetResolved = await configService.getResolvedConfiguration();
        const testnetDeployer = new ContractDeployer(
            testnetResolved.configuration.cliPath,
            testnetResolved.configuration.source,
            testnetResolved.configuration.network,
            mockCli
        );
        const testnetResult = await testnetDeployer.deployFromWasm(workspace.contracts[0].wasmPath);
        assert.strictEqual(testnetResult.success, true);

        await configService.setActiveProfile(mainnetProfile.id);
        const mainnetResolved = await configService.getResolvedConfiguration();
        const mainnetDeployer = new ContractDeployer(
            mainnetResolved.configuration.cliPath,
            mainnetResolved.configuration.source,
            mainnetResolved.configuration.network,
            mockCli
        );
        const mainnetResult = await mainnetDeployer.deployFromWasm(workspace.contracts[0].wasmPath);
        assert.strictEqual(mainnetResult.success, true);

        const networks = mockCli.requests
            .map(request => getArgValue(request.args, '--network'))
            .filter((value): value is string => Boolean(value));
        const sources = mockCli.requests
            .map(request => getArgValue(request.args, '--source'))
            .filter((value): value is string => Boolean(value));

        assert.ok(networks.includes('testnet'));
        assert.ok(networks.includes('mainnet'));
        assert.ok(sources.includes('dev'));
        assert.ok(sources.includes('ops'));
        console.log('  [ok] multi-network deployment with configuration profiles');
    } finally {
        workspace.cleanup();
    }
}

async function testCleanupAfterDeployment() {
    const workspace = createDeploymentFixtureWorkspace(['cleanup-contract']);
    const root = workspace.rootDir;
    try {
        const mockCli = new MockCliOutputStreamingService();
        mockCli.setResponse('build', {
            exitCode: 0,
            stdout: `Compiled contract wasm: target/wasm32-unknown-unknown/release/${path.basename(workspace.contracts[0].wasmPath)}`,
            stderr: '',
        });
        mockCli.setResponse('deploy', {
            exitCode: 0,
            stdout: DeploymentFixtures.SUCCESSFUL_DEPLOY,
            stderr: '',
        });

        const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);
        const result = await deployer.buildAndDeploy(workspace.contracts[0].dir);
        assert.strictEqual(result.success, true);
    } finally {
        workspace.cleanup();
    }
    assert.strictEqual(fs.existsSync(root), false, 'fixture workspace should be removed');
    console.log('  [ok] cleanup removes deployment fixture artifacts');
}

async function testOptionalRealCliSmoke() {
    if (process.env.STELLAR_SUITE_RUN_REAL_CLI_INTEGRATION !== '1') {
        console.log('  [skip] optional real CLI smoke test (set STELLAR_SUITE_RUN_REAL_CLI_INTEGRATION=1)');
        return;
    }

    const cliPath = process.env.STELLAR_CLI_PATH || 'stellar';
    const streaming = new CliOutputStreamingService();
    const result = await streaming.run({
        command: cliPath,
        args: ['--version'],
        timeoutMs: 15000,
    });

    assert.strictEqual(result.success, true, `real CLI smoke failed: ${result.error || result.combinedOutput}`);
    assert.ok(result.combinedOutput.trim().length > 0, 'real CLI should produce version output');
    console.log('  [ok] optional real CLI smoke');
}

async function run() {
    const tests = [
        testContractDetectionAcrossWorkspace,
        testCompleteDeploymentFlow,
        testDeploymentErrorScenarios,
        testRetryLogicIntegration,
        testMultiNetworkDeploymentWithProfiles,
        testCleanupAfterDeployment,
        testOptionalRealCliSmoke,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\ndeployment workflow integration tests');
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
