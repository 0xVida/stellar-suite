declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
import * as path from 'path';
const fs = require('fs');
import { ContractDeployer } from '../services/contractDeployer';
import { MockCliOutputStreamingService } from './mocks/mockCliOutputStreamingService';
import { DeploymentFixtures } from './fixtures/deploymentFixtures';
import { CliStreamingCancellationToken } from '../services/cliOutputStreamingService';
import { DeploymentRetryStatus } from '../types/deploymentRetry';

// ── Helpers ──────────────────────────────────────────────────────────────────

class TestCancellationToken implements CliStreamingCancellationToken {
    public isCancellationRequested = false;
    private listeners: Array<() => void> = [];

    public onCancellationRequested(listener: () => void): { dispose(): void } {
        this.listeners.push(listener);
        return {
            dispose: () => {
                this.listeners = this.listeners.filter(l => l !== listener);
            }
        };
    }

    public cancel(): void {
        this.isCancellationRequested = true;
        this.listeners.forEach(l => l());
    }
}

function patchFs(methods: Record<string, any>): () => void {
    const originals: Record<string, any> = {};
    for (const key of Object.keys(methods)) {
        originals[key] = fs[key];
        fs[key] = methods[key];
    }
    return () => {
        for (const key of Object.keys(methods)) {
            fs[key] = originals[key];
        }
    };
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testBuildContract_Success() {
    const mockCli = new MockCliOutputStreamingService();
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

    const restore = patchFs({
        existsSync: () => true,
        readdirSync: () => ['contract.wasm'],
    });

    mockCli.setDefaultResponse({
        exitCode: 0,
        stdout: DeploymentFixtures.SUCCESSFUL_BUILD,
        stderr: '',
    });

    const result = await deployer.buildContract('/fake/path');
    restore();

    assert.strictEqual(result.success, true);
    assert.ok(result.wasmPath?.includes('contract.wasm'));
    assert.ok(mockCli.lastRequest?.args.includes('build'));
    assert.strictEqual(mockCli.callCount, 1);
    console.log('  ✓ buildContract: success path');
}

async function testBuildContract_Cancellation() {
    const mockCli = new MockCliOutputStreamingService();
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);
    const token = new TestCancellationToken();

    mockCli.setDefaultResponse({
        exitCode: null,
        stdout: '',
        stderr: '',
        cancelled: true,
    });

    const result = await deployer.buildContract('/fake/path', { cancellationToken: token });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.cancelled, true);
    console.log('  ✓ buildContract: cancellation handling');
}

async function testBuildContract_Failure() {
    const mockCli = new MockCliOutputStreamingService();
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

    mockCli.setDefaultResponse({
        exitCode: 1,
        stdout: '',
        stderr: 'error: failed to compile',
    });

    const result = await deployer.buildContract('/fake/path');

    assert.strictEqual(result.success, false);
    assert.ok(result.output.includes('failed to compile'));
    assert.strictEqual(result.errorType, 'unknown');
    console.log('  ✓ buildContract: failure path');
}

async function testBuildContract_Timeout() {
    const mockCli = new MockCliOutputStreamingService();
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

    mockCli.setDefaultResponse({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: true,
        error: 'Command timed out',
    });

    const result = await deployer.buildContract('/fake/path', { timeoutMs: 100 });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.errorSummary, 'Build timed out.');
    console.log('  ✓ buildContract: timeout handling');
}

async function testDeployContract_Success() {
    const mockCli = new MockCliOutputStreamingService();
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

    // Mock fs.existsSync to return true for the wasm path
    const restore = patchFs({ existsSync: () => true });

    mockCli.setDefaultResponse({
        exitCode: 0,
        stdout: DeploymentFixtures.SUCCESSFUL_DEPLOY,
        stderr: '',
    });

    const result = await deployer.deployContract('/fake/contract.wasm');

    restore();

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.contractId, 'C1234567890123456789012345678901234567890123456789012345');
    assert.strictEqual(result.transactionHash, '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
    console.log('  ✓ deployContract: success path');
}

async function testDeployContract_MalformedOutput() {
    const mockCli = new MockCliOutputStreamingService();
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

    const restore = patchFs({ existsSync: () => true });

    mockCli.setDefaultResponse({
        exitCode: 0,
        stdout: DeploymentFixtures.MALFORMED_DEPLOY_OUTPUT,
        stderr: '',
    });

    const result = await deployer.deployContract('/fake/contract.wasm');

    restore();

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Could not extract Contract ID'));
    assert.strictEqual(result.errorType, 'execution');
    console.log('  ✓ deployContract: malformed output handling');
}

async function testDeployContract_CliError() {
    const mockCli = new MockCliOutputStreamingService();
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

    const restore = patchFs({ existsSync: () => true });

    mockCli.setDefaultResponse({
        exitCode: 1,
        stdout: '',
        stderr: DeploymentFixtures.CLI_ERROR_MISSING_PASSPHRASE,
    });

    const result = await deployer.deployContract('/fake/contract.wasm');

    restore();

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.errorType, 'validation');
    const hasPassphrase = result.error?.toLowerCase().includes('passphrase') ||
        result.errorSuggestions?.some(s => s.toLowerCase().includes('passphrase'));
    assert.ok(hasPassphrase, 'Error message or suggestion should mention passphrase');
    console.log('  ✓ deployContract: CLI error parsing');
}

async function testBuildAndDeploy_Success() {
    const mockCli = new MockCliOutputStreamingService();
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

    const restore = patchFs({
        existsSync: () => true,
        readdirSync: () => ['contract.wasm'],
    });

    mockCli.setResponse('build', {
        exitCode: 0,
        stdout: DeploymentFixtures.SUCCESSFUL_BUILD,
        stderr: '',
    });
    mockCli.setResponse('deploy', {
        exitCode: 0,
        stdout: DeploymentFixtures.SUCCESSFUL_DEPLOY,
        stderr: '',
    });

    const result = await deployer.buildAndDeploy('/fake/path');

    restore();

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.contractId, 'C1234567890123456789012345678901234567890123456789012345');
    assert.strictEqual(mockCli.callCount, 2);
    console.log('  ✓ buildAndDeploy: success path');
}

async function testBuildAndDeploy_BuildFailure() {
    const mockCli = new MockCliOutputStreamingService();
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

    mockCli.setResponse('build', {
        exitCode: 1,
        stdout: '',
        stderr: 'error: build failed',
    });

    const result = await deployer.buildAndDeploy('/fake/path');

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Build failed'));
    assert.strictEqual(mockCli.callCount, 1); // Should not proceed to deploy
    console.log('  ✓ buildAndDeploy: stops on build failure');
}

async function testRetryLogic_Exhaustion() {
    // Note: deployWithRetry uses DeploymentRetryService which we haven't mocked here yet.
    // However, since we refactored ContractDeployer to accept a retryService in constructor,
    // we can test the interaction.

    // For this specific test, we'll actually test the REAL retry logic but with a MOCK CLI,
    // which fulfills the "no real CLI execution" requirement.

    const mockCli = new MockCliOutputStreamingService();
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

    const restore = patchFs({ existsSync: () => true });

    // Transient error should trigger retry
    mockCli.setDefaultResponse({
        exitCode: 1,
        stdout: '',
        stderr: DeploymentFixtures.CLI_ERROR_NETWORK,
    });

    const record = await deployer.deployWithRetry('/fake/contract.wasm', {
        maxAttempts: 2,
        initialDelayMs: 1,
        useJitter: false,
    });

    restore();

    assert.strictEqual(record.status, DeploymentRetryStatus.FAILED);
    assert.strictEqual(record.attempts.length, 2);
    console.log('  ✓ retry logic: exhausts attempts on transient failure');
}

async function testTimeoutHandling_Cleanup() {
    const mockCli = new MockCliOutputStreamingService();
    const deployer = new ContractDeployer('stellar', 'dev', 'testnet', mockCli);

    const restore = patchFs({ existsSync: () => true });

    mockCli.setDefaultResponse({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: true,
    });

    const result = await deployer.deployContract('/fake/contract.wasm', { timeoutMs: 10 });

    restore();

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'Deployment timed out.');
    console.log('  ✓ timeout handling: reports correct error');
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
    const tests = [
        testBuildContract_Success,
        testBuildContract_Cancellation,
        testBuildContract_Failure,
        testBuildContract_Timeout,
        testDeployContract_Success,
        testDeployContract_MalformedOutput,
        testDeployContract_CliError,
        testBuildAndDeploy_Success,
        testBuildAndDeploy_BuildFailure,
        testRetryLogic_Exhaustion,
        testTimeoutHandling_Cleanup,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\nContractDeployer unit tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        } catch (error) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
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
