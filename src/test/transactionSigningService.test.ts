// ============================================================
// src/test/transactionSigningService.test.ts
// Unit tests for deployment transaction signing workflow.
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

import {
    DeploymentSigningPayload,
    DeploymentSigningRequest,
    StellarSigningAdapter,
    TransactionSigningService,
} from '../services/transactionSigningService';

class MockSigningAdapter implements StellarSigningAdapter {
    async isAvailable(): Promise<boolean> {
        return true;
    }

    async derivePublicKey(secretKey: string): Promise<string> {
        return `G-${secretKey.slice(0, 6)}`;
    }

    async signPayloadHash(secretKey: string, payloadHashHex: string): Promise<string> {
        return `${payloadHashHex}:${secretKey}`;
    }

    async verifySignature(
        publicKey: string,
        payloadHashHex: string,
        signatureHex: string
    ): Promise<boolean> {
        if (!signatureHex.startsWith(`${payloadHashHex}:`)) {
            return false;
        }
        const suffix = signatureHex.split(':')[1] || '';
        return publicKey === `G-${suffix.slice(0, 6)}`;
    }
}

class FailingAdapter implements StellarSigningAdapter {
    async isAvailable(): Promise<boolean> {
        return false;
    }
    async derivePublicKey(_secretKey: string): Promise<string> {
        throw new Error('SDK missing');
    }
    async signPayloadHash(_secretKey: string, _payloadHashHex: string): Promise<string> {
        throw new Error('SDK missing');
    }
    async verifySignature(_publicKey: string, _payloadHashHex: string, _signatureHex: string): Promise<boolean> {
        throw new Error('SDK missing');
    }
}

function createPayload(service: TransactionSigningService, wasmPath: string): Promise<DeploymentSigningPayload> {
    return service.buildDeploymentSigningPayload({
        wasmPath,
        network: 'testnet',
        source: 'dev',
        cliPath: 'stellar',
        requestedAt: '2026-02-20T00:00:00.000Z',
    });
}

async function testPayloadHashIsDeterministic() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signing-test-'));
    try {
        const wasmPath = path.join(tmpDir, 'contract.wasm');
        fs.writeFileSync(wasmPath, 'wasm-bytes-1');
        const service = new TransactionSigningService(new MockSigningAdapter());
        const payloadA = await createPayload(service, wasmPath);
        const payloadB = await createPayload(service, wasmPath);

        const hashA = service.computePayloadHash(payloadA);
        const hashB = service.computePayloadHash(payloadB);
        assert.strictEqual(hashA, hashB);
        console.log('  ✓ payload hash is deterministic');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function testSignsWithInteractiveMethod() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signing-test-'));
    try {
        const wasmPath = path.join(tmpDir, 'contract.wasm');
        fs.writeFileSync(wasmPath, 'wasm-bytes-2');
        const service = new TransactionSigningService(new MockSigningAdapter());
        const payload = await createPayload(service, wasmPath);

        const result = await service.signDeployment({
            method: 'interactive',
            payload,
            secretKey: 'S-INTERACTIVE-KEY',
        });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.validated, true);
        assert.strictEqual(result.status, 'signed');
        assert.ok(result.signature);
        assert.ok(result.publicKey);
        console.log('  ✓ interactive signing succeeds and validates');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function testHardwareWalletVerificationPath() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signing-test-'));
    try {
        const wasmPath = path.join(tmpDir, 'contract.wasm');
        fs.writeFileSync(wasmPath, 'wasm-bytes-3');
        const service = new TransactionSigningService(new MockSigningAdapter());
        const payload = await createPayload(service, wasmPath);
        const payloadHash = service.computePayloadHash(payload);

        const request: DeploymentSigningRequest = {
            method: 'hardwareWallet',
            payload,
            publicKey: 'G-S-HARD',
            signature: `${payloadHash}:S-HARD`,
        };

        const result = await service.signDeployment(request);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.status, 'verified');
        assert.strictEqual(result.validated, true);
        console.log('  ✓ hardware wallet signature verification succeeds');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function testRejectsInvalidHardwareSignature() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signing-test-'));
    try {
        const wasmPath = path.join(tmpDir, 'contract.wasm');
        fs.writeFileSync(wasmPath, 'wasm-bytes-4');
        const service = new TransactionSigningService(new MockSigningAdapter());
        const payload = await createPayload(service, wasmPath);

        const result = await service.signDeployment({
            method: 'hardwareWallet',
            payload,
            publicKey: 'G-S-BAD',
            signature: 'invalid-signature',
        });

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.status, 'failed');
        assert.ok((result.error || '').toLowerCase().includes('validation'));
        console.log('  ✓ invalid hardware signature is rejected');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function testSourceAccountDelegatedMode() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signing-test-'));
    try {
        const wasmPath = path.join(tmpDir, 'contract.wasm');
        fs.writeFileSync(wasmPath, 'wasm-bytes-5');
        const service = new TransactionSigningService(new MockSigningAdapter());
        const payload = await createPayload(service, wasmPath);

        const result = await service.signDeployment({
            method: 'sourceAccount',
            payload,
        });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.status, 'delegated');
        assert.strictEqual(result.validated, false);
        console.log('  ✓ source account delegated mode supported');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function testGracefulErrorWhenSdkUnavailable() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signing-test-'));
    try {
        const wasmPath = path.join(tmpDir, 'contract.wasm');
        fs.writeFileSync(wasmPath, 'wasm-bytes-6');
        const service = new TransactionSigningService(new FailingAdapter());
        const payload = await createPayload(service, wasmPath);

        const result = await service.signDeployment({
            method: 'interactive',
            payload,
            secretKey: 'S-MISSING-SDK',
        });

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.status, 'failed');
        assert.ok((result.error || '').includes('SDK'));
        console.log('  ✓ signing errors are handled gracefully');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function run() {
    const tests: Array<() => Promise<void>> = [
        testPayloadHashIsDeterministic,
        testSignsWithInteractiveMethod,
        testHardwareWalletVerificationPath,
        testRejectsInvalidHardwareSignature,
        testSourceAccountDelegatedMode,
        testGracefulErrorWhenSdkUnavailable,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\n● TransactionSigningService');
    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (err) {
            failed++;
            console.error(`  ✕ ${test.name}`);
            console.error(`    ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));

    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch((err) => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
